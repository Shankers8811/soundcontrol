/**
 * Connection Manager — handles automatic device connection, reconnection,
 * and persistent device preferences.
 *
 * This module provides a high-level API for the renderer to manage the
 * Bluetooth connection lifecycle without dealing with low-level bridge details.
 */

import type { DeviceProfile } from '../types';
import { matchDevice, UNKNOWN_PROFILE } from '../protocol/devices';
import { scanDevices } from '../api/bridge';

/** Saved device preference stored in localStorage */
export interface SavedDevice {
  mac: string;
  name: string;
  sku: string;
  profileId: string;
  lastConnected: number;
  connectionCount: number;
}

/** Connection state for the UI */
export type ConnectionPhase = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error' | 'disconnected';

export interface ConnectionState {
  phase: ConnectionPhase;
  device: SavedDevice | null;
  error: string | null;
  progress: number; // 0-100
}

const STORAGE_KEYS = {
  SAVED_DEVICES: 'soundcontrol:saved_devices',
  LAST_CONNECTED: 'soundcontrol:last_connected_mac',
  AUTO_CONNECT_ENABLED: 'soundcontrol:auto_connect_enabled',
  PREFERRED_CHANNEL: 'soundcontrol:preferred_channel',
} as const;

const MAX_SAVED_DEVICES = 10;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;
const SCAN_INTERVAL_MS = 5000;

type Listener = (state: ConnectionState) => void;

export class ConnectionManager {
  private state: ConnectionState = {
    phase: 'idle',
    device: null,
    error: null,
    progress: 0,
  };
  private listeners: Set<Listener> = new Set();
  private reconnectAttempts = 0;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentMac: string | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.loadPreferences();
    if (this.isAutoConnectEnabled()) {
      this.startAutoConnect();
    }
  }

  /** Subscribe to connection state changes */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state); // emit current state immediately
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(partial: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  // --- Preferences ---

  private loadPreferences(): void {
    try {
      const autoConnect = localStorage.getItem(STORAGE_KEYS.AUTO_CONNECT_ENABLED);
      if (autoConnect === 'true') {
        this.enableAutoConnect();
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
    }
  }

  isAutoConnectEnabled(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.AUTO_CONNECT_ENABLED) === 'true';
    } catch {
      return false;
    }
  }

  enableAutoConnect(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_CONNECT_ENABLED, 'true');
    } catch { }
    if (this.state.phase === 'idle') {
      this.startAutoConnect();
    }
  }

  disableAutoConnect(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_CONNECT_ENABLED, 'false');
    } catch { }
    this.stopAutoConnect();
  }

  // --- Device Preferences ---

  getSavedDevices(): SavedDevice[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAVED_DEVICES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveDevices(devices: SavedDevice[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_DEVICES, JSON.stringify(devices));
    } catch { }
  }

  private saveDevice(device: SavedDevice): void {
    const devices = this.getSavedDevices().filter(d => d.mac !== device.mac);
    devices.unshift(device);
    this.saveDevices(devices.slice(0, MAX_SAVED_DEVICES));
  }

  getLastConnectedMac(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_CONNECTED) || null;
    } catch {
      return null;
    }
  }

  private setLastConnectedMac(mac: string | null): void {
    try {
      if (mac) {
        localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED, mac);
      } else {
        localStorage.removeItem(STORAGE_KEYS.LAST_CONNECTED);
      }
    } catch { }
  }

  getPreferredChannel(mac: string): number | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERRED_CHANNEL);
      if (!data) return null;
      const channels = JSON.parse(data);
      return channels[mac] || null;
    } catch {
      return null;
    }
  }

  private setPreferredChannel(mac: string, channel: number): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERRED_CHANNEL);
      const channels = data ? JSON.parse(data) : {};
      channels[mac] = channel;
      localStorage.setItem(STORAGE_KEYS.PREFERRED_CHANNEL, JSON.stringify(channels));
    } catch { }
  }

  // --- Device Discovery & Identification ---

  /**
   * Scan for available devices and match them against known profiles.
   * Returns devices with their matched profile information.
   */
  async scanForDevices(fresh = false): Promise<Array<{
    mac: string;
    name: string;
    connected?: boolean;
    battery?: number;
    profile: DeviceProfile | null;
    profileId: string | null;
    isKnown: boolean;
  }>> {
    const devices = await scanDevices(fresh);
    return devices.map(device => {
      const profile = matchDevice(device.name || '');
      return {
        mac: device.mac,
        name: device.name,
        connected: device.connected,
        battery: device.battery,
        profile: profile.id === 'unknown' ? null : profile,
        profileId: profile.id === 'unknown' ? null : profile.id,
        isKnown: profile.id !== 'unknown',
      };
    });
  }

  /**
   * Find a specific device by MAC address and return its profile info.
   */
  async findDevice(mac: string): Promise<{
    mac: string;
    name: string;
    profile: DeviceProfile | null;
    profileId: string | null;
    isKnown: boolean;
  } | null> {
    const normalized = this.normalizeMac(mac);
    if (!normalized) return null;

    const devices = await this.scanForDevices(true);
    const device = devices.find(d => d.mac.toLowerCase() === normalized.toLowerCase());
    if (!device) return null;

    return {
      mac: device.mac,
      name: device.name,
      profile: device.profile,
      profileId: device.profileId,
      isKnown: device.isKnown,
    };
  }

  /**
   * Auto-identify device from name using the same logic as the app.
   * Falls back through multiple strategies.
   */
  async identifyDevice(mac: string, nameHint?: string): Promise<{
    profile: DeviceProfile;
    profileId: string;
    confidence: 'high' | 'medium' | 'low';
  } | null> {
    const normalized = this.normalizeMac(mac);
    if (!normalized) return null;

    // Strategy 1: Use provided name hint
    if (nameHint) {
      const profile = matchDevice(nameHint);
      if (profile.id !== 'unknown') {
        return { profile, profileId: profile.id, confidence: 'high' };
      }
    }

    // Strategy 2: Scan and match by name
    const devices = await this.scanForDevices(true);
    const device = devices.find(d => d.mac.toLowerCase() === normalized.toLowerCase());
    if (device?.isKnown) {
      return { profile: device.profile!, profileId: device.profileId!, confidence: 'high' };
    }

    // Strategy 3: Use MAC address prefix (OUI) lookup as last resort
    // This is a fallback and has low confidence
    const oui = normalized.substring(0, 8).toUpperCase();
    // Could add OUI database lookup here

    return null;
  }

  private normalizeMac(mac: string): string {
    const hex = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    return hex.length === 12 ? hex.match(/.{2}/g)!.join(':') : '';
  }

  // --- Connection Management ---

  /**
   * Connect to a device with automatic channel probing and profile detection.
   * Saves device to preferences on success.
   */
  async connect(mac: string, channel?: number): Promise<{
    success: boolean;
    profile?: DeviceProfile;
    channel?: number;
    error?: string;
  }> {
    const normalized = this.normalizeMac(mac);
    if (!normalized) {
      return { success: false, error: 'Invalid MAC address' };
    }

    this.setState({ phase: 'connecting', progress: 10, error: null });

    try {
      // Identify device first
      const identification = await this.identifyDevice(normalized);
      if (!identification) {
        this.setState({ phase: 'error', error: 'Could not identify device' });
        return { success: false, error: 'Could not identify device' };
      }

      this.setState({ phase: 'connecting', progress: 30 });

      // Use provided channel or try preferred/saved channel
      const preferredChannel = channel || this.getPreferredChannel(normalized);
      const channels = preferredChannel
        ? [preferredChannel, 4, 12, 15, 10, 30, 1].filter((c, i, arr) => arr.indexOf(c) === i)
        : [4, 12, 15, 10, 30, 1];

      // Attempt connection with channel probing
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        this.setState({ phase: 'connecting', progress: 30 + (i * 10) });

        try {
          await this.connectBridge(normalized, ch);
          this.setState({ phase: 'connecting', progress: 80 });

          // Verify connection by requesting state
          await this.verifyConnection();

          // Success!
          const profile = this.matchDeviceByMac(normalized) || UNKNOWN_PROFILE;
          this.saveDevice({
            mac: normalized,
            name: this.getDeviceName(normalized) || 'Unknown',
            sku: identification.profile?.sku || 'UNKNOWN',
            profileId: identification.profileId!,
            lastConnected: Date.now(),
            connectionCount: 1,
          });
          this.setLastConnectedMac(normalized);
          this.setPreferredChannel(normalized, ch);
          this.currentMac = normalized;
          this.reconnectAttempts = 0;

          this.setState({
            phase: 'connected',
            device: this.getSavedDevice(normalized),
            progress: 100,
            error: null,
          });

          return { success: true, profile: identification.profile, channel: ch };
        } catch (err) {
          // Try next channel
          continue;
        }
      }

      throw new Error('No DSP channel responded');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({ phase: 'error', error: message, progress: 0 });
      return { success: false, error: message };
    }
  }

  /**
   * Low-level bridge connection with channel probing.
   */
  private async connectBridge(mac: string, channel: number): Promise<void> {
    const response = await fetch(`http://127.0.0.1:8765/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': this.getBridgeToken(),
      },
      body: JSON.stringify({ mac, channel }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Connection failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.type === 'error') {
      throw new Error(result.error);
    }
  }

  /**
   * Verify the connection by requesting device state.
   */
  private async verifyConnection(): Promise<void> {
    // Request device state (01:01) to verify the connection works
    const response = await fetch('http://127.0.0.1:8765/tx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': this.getBridgeToken(),
      },
      body: JSON.stringify({ hex: '08EE00000001010A0002' }), // 01:01 handshake
    });

    if (!response.ok) {
      throw new Error('Connection verification failed');
    }
  }

  /**
   * Disconnect from the current device.
   */
  async disconnect(): Promise<void> {
    this.stopAutoReconnect();
    this.reconnectAttempts = 0;

    try {
      await fetch('http://127.0.0.1:8765/disconnect', {
        method: 'POST',
        headers: { 'X-Bridge-Token': this.getBridgeToken() },
      });
    } catch { }

    this.setState({ phase: 'disconnected', device: null, progress: 0 });
    this.currentMac = null;
  }

  // --- Auto-connect / Reconnect ---

  private startAutoConnect(): void {
    if (this.scanInterval) return;

    // Initial scan
    this.scanAndConnect();

    // Periodic scan for auto-connect
    this.scanInterval = setInterval(() => {
      if (this.state.phase === 'idle' || this.state.phase === 'disconnected') {
        this.scanAndConnect();
      }
    }, SCAN_INTERVAL_MS);
  }

  private stopAutoConnect(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.stopAutoReconnect();
  }

  private async scanAndConnect(): Promise<void> {
    if (this.state.phase !== 'idle' && this.state.phase !== 'disconnected') return;

    const lastMac = this.getLastConnectedMac();
    if (!lastMac) return;

    // Check if the device is currently available
    const device = await this.findDevice(lastMac);
    if (!device || !device.connected) return;

    // Attempt to connect
    this.setState({ phase: 'connecting', progress: 10 });
    const result = await this.connect(lastMac);
    if (!result.success) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setState({ phase: 'error', error: 'Max reconnect attempts reached' });
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;

    this.reconnectTimeout = setTimeout(() => {
      this.scanAndConnect();
    }, delay);
  }

  private stopAutoReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // --- Bridge Token Management ---

  private getBridgeToken(): string {
    // In production, this comes from the Electron main process
    // For now, read from a global that the main process sets
    return (window as any).__BRIDGE_TOKEN__ || '';
  }

  setBridgeToken(token: string): void {
    (window as any).__BRIDGE_TOKEN__ = token;
  }

  // --- Utility ---

  private matchDeviceByMac(mac: string): DeviceProfile | null {
    const saved = this.getSavedDevice(mac);
    if (saved?.profileId) {
      // Would need to import from devices module
      return null; // Placeholder
    }
    return null;
  }

  private getSavedDevice(mac: string): SavedDevice | null {
    return this.getSavedDevices().find(d => d.mac.toLowerCase() === mac.toLowerCase()) || null;
  }

  private getDeviceName(mac: string): string | null {
    const saved = this.getSavedDevice(mac);
    return saved?.name || null;
  }

  // --- Cleanup ---

  destroy(): void {
    this.stopAutoConnect();
    this.listeners.clear();
  }
}

/** Singleton instance */
let connectionManagerInstance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
  }
  return connectionManagerInstance;
}

export function destroyConnectionManager(): void {
  if (connectionManagerInstance) {
    connectionManagerInstance.destroy();
    connectionManagerInstance = null;
  }
}