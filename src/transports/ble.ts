import { isPolicyError } from '../lib/bluetoothEnv';
import type { Transport } from '../types';

const OPTIONAL_SERVICES: Array<number | string> = [
  'battery_service',
  'device_information',
  0x180f,
  0x180a,
  0xff12,
  0xae00,
  0xae10,
  0x6666,
  '0000ff12-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae10-0000-1000-8000-00805f9b34fb',
  '00006666-0000-1000-8000-00805f9b34fb',
];

const FILTERS = [
  { namePrefix: 'Soundcore' },
  { namePrefix: 'soundcore' },
  { namePrefix: 'Anker' },
  { namePrefix: 'Q30' },
  { namePrefix: 'Q35' },
  { namePrefix: 'Q45' },
  { namePrefix: 'Liberty' },
  { namePrefix: 'Life' },
  { namePrefix: 'Space' },
  { namePrefix: 'R50i' },
  { namePrefix: 'P30i' },
  { namePrefix: 'P20i' },
  { namePrefix: 'P25i' },
  { namePrefix: 'A39' },
  { namePrefix: 'A30' },
];

function isWritable(c: BluetoothRemoteGATTCharacteristic): boolean {
  return Boolean(c.properties.write || c.properties.writeWithoutResponse);
}

async function pickDevice(): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error('Use Chrome or Edge. Firefox and Safari cannot scan Bluetooth from a web page.');
  }
  try {
    return await navigator.bluetooth.requestDevice({
      filters: FILTERS,
      optionalServices: OPTIONAL_SERVICES,
    });
  } catch (err) {
    if (isPolicyError(err)) {
      throw new Error(
        'This preview window blocks Bluetooth. Tap Search again after the app opens in its own browser tab.',
      );
    }
    throw err;
  }
}

export async function connectBluetooth(onRx: (data: Uint8Array) => void): Promise<{
  transport: Transport;
  name: string;
  battery: number | null;
}> {
  const device = await pickDevice();
  const server = await device.gatt!.connect();
  let battery: number | null = null;
  try {
    const batSvc = await server.getPrimaryService('battery_service');
    const chars = await batSvc.getCharacteristics();
    const level = chars.find((c) => c.uuid.includes('2a19')) ?? chars[0];
    const view = await level.readValue();
    battery = view.getUint8(0);
  } catch {
    battery = null;
  }

  const services = await server.getPrimaryServices();
  const writable: BluetoothRemoteGATTCharacteristic[] = [];
  const notify: BluetoothRemoteGATTCharacteristic[] = [];

  for (const svc of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try {
      chars = await svc.getCharacteristics();
    } catch {
      continue;
    }
    for (const c of chars) {
      if (isWritable(c)) writable.push(c);
      if (c.properties.notify) notify.push(c);
    }
  }

  const onChar = (ev: Event) => {
    const t = ev.target as unknown as BluetoothRemoteGATTCharacteristic;
    const v = t.value;
    if (!v) return;
    onRx(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
  };

  for (const c of notify) {
    try {
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', onChar);
    } catch {
      /* */
    }
  }

  const writer = writable[0] ?? null;

  const transport: Transport = {
    kind: 'ble',
    label: device.name ?? 'soundcore',
    async write(data) {
      if (!writer) {
        throw new Error('Connected for battery, but this model needs the desktop app for ANC.');
      }
      try {
        if (writer.properties.writeWithoutResponse) {
          await writer.writeValueWithoutResponse(data);
        } else {
          await writer.writeValue(data);
        }
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    },
    async close() {
      try {
        server.disconnect();
      } catch {
        /* */
      }
    },
  };

  return { transport, name: device.name ?? 'soundcore', battery };
}
