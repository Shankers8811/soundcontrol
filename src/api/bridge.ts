/**
 * Bridge API — low-level communication with the Python Bluetooth bridge.
 *
 * This module provides a typed interface for the renderer to communicate
 * with the local Python bridge over HTTP/WebSocket.
 */

const BRIDGE_BASE = 'http://127.0.0.1:8765';

/** Bridge token for authentication */
let bridgeToken: string | null = null;

export function setBridgeToken(token: string | null): void {
  bridgeToken = token;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (bridgeToken) {
    headers['X-Bridge-Token'] = bridgeToken;
  }
  return headers;
}

/** Device returned by the bridge scan */
export interface BridgeDevice {
  id: string;
  mac: string;
  name: string;
  connected?: boolean;
  battery?: number;
}

/** Scan for available devices */
export async function scanDevices(fresh = false): Promise<BridgeDevice[]> {
  const url = `${BRIDGE_BASE}/scan${fresh ? '?fresh=1' : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Scan failed: ${response.status}`);
  }
  return response.json();
}

/** Connect to a device */
export interface ConnectResult {
  type: 'connected' | 'error';
  mac?: string;
  channel?: number;
  error?: string;
}

export async function connectDevice(mac: string, channel = 4): Promise<ConnectResult> {
  const response = await fetch(`${BRIDGE_BASE}/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ mac, channel }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Connection failed' }));
    return { type: 'error', error: error.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Disconnect from the current device */
export async function disconnectDevice(): Promise<void> {
  await fetch(`${BRIDGE_BASE}/disconnect`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

/** Send a raw frame to the device */
export async function sendFrame(hex: string): Promise<{ type: 'sent' | 'error'; n?: number; error?: string }> {
  const response = await fetch(`${BRIDGE_BASE}/tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ hex: hex.replace(/\s/g, '') }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Send failed' }));
    return { type: 'error', error: error.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Check bridge health */
export interface HealthResult {
  ok: boolean;
  connected: boolean;
  mac: string;
  channel: number;
}

export async function checkHealth(): Promise<HealthResult> {
  const response = await fetch(`${BRIDGE_BASE}/health`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export const bridgeHealth = checkHealth;

/** Get bridge info */
export interface BridgeInfo {
  ok: boolean;
  connected: boolean;
  mac: string;
  channel: number;
  pid: number;
  devices: Array<{ mac: string; name: string; connected?: boolean; battery?: number }>;
}

export async function getBridgeInfo(): Promise<BridgeInfo> {
  const response = await fetch(`${BRIDGE_BASE}/health`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Bridge info failed: ${response.status}`);
  }
  return response.json();
}

/** WebSocket connection for real-time device frames */
export interface WSMessage {
  type: 'hello' | 'rx' | 'connected' | 'disconnected' | 'sent' | 'error' | 'sys';
  [key: string]: unknown;
}

export type WSMessageHandler = (msg: WSMessage) => void;

export class BridgeWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<WSMessageHandler> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = 'ws://127.0.0.1:8765/ws') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${this.token ? `?token=${this.token}` : ''}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handlers.forEach(handler => handler(msg));
        } catch {
          // Ignore invalid messages
        }
      };

      ws.onerror = (err) => {
        // Connection error - onclose will handle reconnection
      };

      ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws = ws;
    });
  }

  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000));
  }

  onMessage(handler: WSMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/** Create a WebSocket connection for real-time device communication */
export function createBridgeWebSocket(token?: string): BridgeWebSocket {
  const ws = new BridgeWebSocket();
  if (token) ws.setToken(token);
  return ws;
}