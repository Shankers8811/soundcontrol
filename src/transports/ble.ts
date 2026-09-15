import { isPolicyError } from '../lib/bluetoothEnv';
import type { Transport } from '../types';

/**
 * Strict cap for every GATT round-trip. On Android Chrome the GATT connection
 * can hang forever (never resolves, never rejects) while the earbuds are
 * busy streaming A2DP audio — without this the UI sticks in "Searching…".
 */
const GATT_TIMEOUT_MS = 3500;

/**
 * Every known Soundcore / Anker vendor GATT service. Chrome only exposes
 * services listed here to getPrimaryServices(), so all of them must be
 * registered or the control channel stays invisible.
 */
const OPTIONAL_SERVICES: Array<number | string> = [
  'battery_service',
  'device_information',
  0xffe0,
  0xfee0,
  0xae00,
  0xae10,
  0x6666,
  0x7777,
  0x8888,
  0xff12,
  '0cf12d31-fac3-4553-bd80-d6832e7b3947',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae10-0000-1000-8000-00805f9b34fb',
  '00006666-0000-1000-8000-00805f9b34fb',
  '00007777-0000-1000-8000-00805f9b34fb',
  '00008888-0000-1000-8000-00805f9b34fb',
  '0000ff12-0000-1000-8000-00805f9b34fb',
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

/** Matches transient "GATT operation already in progress / busy" failures. */
export function isGattBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already in progress|gatt.*(busy|in progress|in use)|operation in progress|device is busy|busy/i.test(
    msg,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${(ms / 1000).toFixed(1)}s`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timer);
  });
}

async function pickDevice(acceptAll: boolean): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error('Use Chrome or Edge. Firefox and Safari cannot scan Bluetooth from a web page.');
  }
  try {
    return acceptAll
      ? await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: OPTIONAL_SERVICES,
        })
      : await navigator.bluetooth.requestDevice({
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

export interface BleConnectOptions {
  /** List every nearby BLE device instead of only Soundcore-filtered ones. */
  acceptAllDevices?: boolean;
}

const TIMEOUT_HINT =
  'Connection timed out — pause any playing music, keep the earbuds in the open case, then tap Search and try again.';

export async function connectBluetooth(
  onRx: (data: Uint8Array) => void,
  options: BleConnectOptions = {},
): Promise<{
  transport: Transport;
  name: string;
  battery: number | null;
}> {
  const device = await pickDevice(options.acceptAllDevices === true);
  if (!device.gatt) {
    throw new Error('This browser did not expose a Bluetooth connection for the device.');
  }

  let server: BluetoothRemoteGATTServer;
  try {
    server = await withTimeout(device.gatt.connect(), GATT_TIMEOUT_MS, 'Bluetooth connection');
  } catch (err) {
    try {
      device.gatt.disconnect();
    } catch {
      /* release the hanging GATT link */
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(/timed out/i.test(msg) ? TIMEOUT_HINT : msg);
  }

  let battery: number | null = null;
  try {
    const batSvc = await withTimeout(
      server.getPrimaryService('battery_service'),
      GATT_TIMEOUT_MS,
      'Battery service',
    );
    const chars = await withTimeout(batSvc.getCharacteristics(), GATT_TIMEOUT_MS, 'Battery read');
    const level = chars.find((c) => c.uuid.includes('2a19')) ?? chars[0];
    if (level) {
      const view = await withTimeout(level.readValue(), GATT_TIMEOUT_MS, 'Battery read');
      battery = view.getUint8(0);
    }
  } catch {
    battery = null;
  }

  let services: BluetoothRemoteGATTService[];
  try {
    services = await withTimeout(server.getPrimaryServices(), GATT_TIMEOUT_MS, 'Service discovery');
  } catch (err) {
    try {
      server.disconnect();
    } catch {
      /* release the hanging GATT link */
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(/timed out/i.test(msg) ? TIMEOUT_HINT : msg);
  }

  const writable: BluetoothRemoteGATTCharacteristic[] = [];
  const notify: BluetoothRemoteGATTCharacteristic[] = [];

  for (const svc of services) {
    try {
      const chars = await withTimeout(
        svc.getCharacteristics(),
        GATT_TIMEOUT_MS,
        'Characteristic discovery',
      );
      for (const c of chars) {
        if (isWritable(c)) writable.push(c);
        if (c.properties.notify) notify.push(c);
      }
    } catch {
      continue;
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

  // Serialize all writes: overlapping GATT writes are the #1 cause of
  // "operation already in progress" errors on Android.
  let tail: Promise<void> = Promise.resolve();

  const transport: Transport = {
    kind: 'ble',
    label: device.name ?? 'soundcore',
    async write(data) {
      const job = tail.then(async () => {
        if (!writer) {
          throw new Error('Connected for battery, but this model needs the desktop app for ANC.');
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (writer.properties.writeWithoutResponse) {
              await writer.writeValueWithoutResponse(data);
            } else {
              await writer.writeValue(data);
            }
            return;
          } catch (err) {
            if (isGattBusyError(err)) {
              if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
                continue;
              }
              // Still busy after retries: resolve silently. The UI state was
              // already updated optimistically, so never show an error popup.
              return;
            }
            throw new Error(err instanceof Error ? err.message : String(err));
          }
        }
      });
      tail = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
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
