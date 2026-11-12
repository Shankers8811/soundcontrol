import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { BluetoothDevice, KnownDevice, DeviceProfile, DeviceState, DeviceSession } from '../types';
import { api } from '../api/tauri';

interface DevicesState {
  // Device lists
  pairedDevices: BluetoothDevice[];
  knownDevices: KnownDevice[];
  deviceProfiles: DeviceProfile[];
  
  // Active session
  activeDevice: DeviceState | null;
  activeSession: DeviceSession | null;
  
  // UI state
  isScanning: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Actions
  setPairedDevices: (devices: BluetoothDevice[]) => void;
  setKnownDevices: (devices: KnownDevice[]) => void;
  setDeviceProfiles: (profiles: DeviceProfile[]) => void;
  setActiveDevice: (device: DeviceState | null) => void;
  setActiveSession: (session: DeviceSession | null) => void;
  setScanning: (scanning: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  scanDevices: () => Promise<void>;
  connectDevice: (mac: string) => Promise<DeviceState | null>;
  disconnectDevice: (mac: string) => Promise<void>;
  refreshDeviceState: (mac: string) => Promise<void>;
  loadDeviceProfiles: () => Promise<void>;
  loadKnownDevices: () => Promise<void>;
}

export const useDevicesStore = create<DevicesState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        pairedDevices: [],
        knownDevices: [],
        deviceProfiles: [],
        activeDevice: null,
        activeSession: null,
        isScanning: false,
        isConnecting: false,
        error: null,

        // Setters
        setPairedDevices: (devices) => set({ pairedDevices: devices }),
        setKnownDevices: (devices) => set({ knownDevices: devices }),
        setDeviceProfiles: (profiles) => set({ deviceProfiles: profiles }),
        setActiveDevice: (device) => set({ activeDevice: device }),
        setActiveSession: (session) => set({ activeSession: session }),
        setScanning: (scanning) => set({ isScanning: scanning }),
        setConnecting: (connecting) => set({ isConnecting: connecting }),
        setError: (error) => set({ error }),

        // Async actions
        scanDevices: async () => {
          set({ isScanning: true, error: null });
          try {
            const devices = await api.scanDevices();
            set({ pairedDevices: devices, isScanning: false });
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Scan failed', isScanning: false });
          }
        },

        connectDevice: async (mac: string) => {
          set({ isConnecting: true, error: null });
          try {
            const deviceState = await api.connectDevice(mac);
            set({ 
              activeDevice: deviceState, 
              activeSession: { 
                mac: deviceState.mac, 
                sku: deviceState.model, 
                profile: deviceState.profile, 
                rfcommChannel: 0, 
                connectedAt: new Date().toISOString(), 
                lastActivity: new Date().toISOString() 
              },
              isConnecting: false 
            });
            return deviceState;
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Connection failed', isConnecting: false });
            return null;
          }
        },

        disconnectDevice: async (mac: string) => {
          try {
            await api.disconnectDevice(mac);
            set({ activeDevice: null, activeSession: null });
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Disconnect failed' });
          }
        },

        refreshDeviceState: async (mac: string) => {
          try {
            const deviceState = await api.getDeviceState(mac);
            set({ activeDevice: deviceState });
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Refresh failed' });
          }
        },

        loadDeviceProfiles: async () => {
          try {
            const profiles = await api.getDeviceProfiles?.() || [];
            set({ deviceProfiles: profiles });
          } catch (error) {
            console.error('Failed to load device profiles:', error);
          }
        },

        loadKnownDevices: async () => {
          try {
            const devices = await api.getKnownDevices?.() || [];
            set({ knownDevices: devices });
          } catch (error) {
            console.error('Failed to load known devices:', error);
          }
        },
      }),
      {
        name: 'soundcontrol-devices',
        partialize: (state) => ({
          knownDevices: state.knownDevices,
          deviceProfiles: state.deviceProfiles,
        }),
      }
    ),
    { name: 'DevicesStore' }
  )
);