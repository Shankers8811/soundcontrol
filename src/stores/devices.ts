import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { scanDevices, connectDevice, disconnectDevice, getBluetoothState, getDeviceInfo, getBatteryLevels } from '../api/tauri';
import type { DiscoveredDevice } from '../types';

interface DevicesState {
  devices: DiscoveredDevice[];
  connectedDevice: DiscoveredDevice | null;
  isScanning: boolean;
  bluetoothState: string;
  batteryLevels: Record<string, any>;
  loadDevices: () => Promise<void>;
  scan: () => Promise<void>;
  connect: (address: string) => Promise<void>;
  disconnect: (address: string) => Promise<void>;
  setConnectedDevice: (device: DiscoveredDevice | null) => void;
  refreshBluetoothState: () => Promise<void>;
  refreshBattery: (address: string) => Promise<void>;
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
  devices: [],
  connectedDevice: null,
  isScanning: false,
  bluetoothState: 'unknown',
  batteryLevels: {},

  loadDevices: async () => {
    try {
      const devices = await scanDevices();
      set({ devices });
      const state = await getBluetoothState();
      set({ bluetoothState: state });
    } catch (e) {
      console.error('Failed to load devices', e);
    }
  },

  scan: async () => {
    set({ isScanning: true });
    try {
      const devices = await scanDevices();
      set({ devices, isScanning: false });
    } catch (e) {
      console.error('Scan failed', e);
      set({ isScanning: false });
    }
  },

  connect: async (address: string) => {
    try {
      await connectDevice(address);
      const device = get().devices.find(d => d.address === address);
      if (device) {
        set({ connectedDevice: device });
      }
      const info = await getDeviceInfo(address);
      if (info.connected) {
        const dev = get().devices.find(d => d.address === address);
        if (dev) {
          set({ connectedDevice: { ...dev, connected: true } });
        }
      }
    } catch (e) {
      console.error('Connect failed', e);
      throw e;
    }
  },

  disconnect: async (address: string) => {
    try {
      await disconnectDevice(address);
      set((state) => ({
        devices: state.devices.map(d => d.address === address ? { ...d, connected: false } : d),
        connectedDevice: state.connectedDevice?.address === address ? null : state.connectedDevice,
      }));
    } catch (e) {
      console.error('Disconnect failed', e);
      throw e;
    }
  },

  setConnectedDevice: (device) => {
    set({ connectedDevice: device });
  },

  refreshBluetoothState: async () => {
    try {
      const state = await getBluetoothState();
      set({ bluetoothState: state });
    } catch (e) {
      console.error('Failed to get Bluetooth state', e);
    }
  },

  refreshBattery: async (address: string) => {
    try {
      const levels = await getBatteryLevels(address);
      set((state) => ({
        batteryLevels: { ...state.batteryLevels, [address]: levels },
      }));
    } catch (e) {
      console.error('Failed to get battery levels', e);
    }
  },

  toggleSingleEarbudMode: (enabled) => {
    // Store single earbud mode preference in local state
    // This is a client-side preference that affects UI behavior
    console.log('Single earbud mode:', enabled);
  },
}));
