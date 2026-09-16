import { fromHex, toHex } from '../protocol/codec';
import type { Transport } from '../types';

export interface NearbyDevice {
  id: string;
  name: string;
  mac?: string;
  source: 'bridge' | 'demo';
}

// The packaged Electron app loads via file://, where location.hostname is
// empty — without this the bridge URL becomes ws://:8765 and never resolves,
// so the desktop app could never reach its own helper.
function isLocalHost(): boolean {
  const h = location.hostname;
  return !h || h === 'localhost' || h === '127.0.0.1';
}

export function defaultBridgeUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${isLocalHost() ? '127.0.0.1' : location.hostname}:8765/ws`;
}

function scanHttpBase(): string | null {
  // Public https pages (GitHub Pages) are blocked by Private Network Access
  // rules from talking to the loopback bridge, so skip polling there.
  if (location.protocol === 'https:' && !isLocalHost()) return null;
  return `http://${isLocalHost() ? '127.0.0.1' : location.hostname}:8765`;
}

/** Quick reachability probe for the local bridge helper. */
export async function bridgeAlive(): Promise<boolean> {
  const base = scanHttpBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/scan`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function scanBridgeDevices(): Promise<NearbyDevice[]> {
  const base = scanHttpBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/scan`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const json = (await res.json()) as { devices?: Array<{ mac: string; name: string }> };
    return (json.devices ?? []).map((d) => ({
      id: d.mac,
      name: d.name || d.mac,
      mac: d.mac,
      source: 'bridge' as const,
    }));
  } catch {
    return [];
  }
}

interface BridgeHello {
  type?: string;
  devices?: Array<{ mac: string; name: string }>;
  error?: string;
}

export async function connectBridge(
  mac: string,
  onRx: (data: Uint8Array) => void,
  name = '',
): Promise<{ transport: Transport; name: string }> {
  const url = defaultBridgeUrl();
  const ws = await openSocket(url);

  const transport: Transport = {
    kind: 'bridge',
    label: name || 'soundcore',
    async write(data) {
      if (ws.readyState !== WebSocket.OPEN) throw new Error('Connection lost');
      ws.send(JSON.stringify({ type: 'tx', hex: toHex(data, '') }));
    },
    async close() {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'disconnect' }));
        }
      } catch {
        /* */
      }
      ws.close();
    },
  };

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Could not reach the earbuds. Put them in pairing mode and retry.')), 10000);

    const onMsg = (ev: MessageEvent) => {
      let msg: BridgeHello & { hex?: string };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'rx' && msg.hex) {
        try {
          onRx(fromHex(msg.hex));
        } catch {
          /* */
        }
        return;
      }
      if (msg.type === 'connected') {
        window.clearTimeout(timer);
        ws.removeEventListener('message', onMsg);
        ws.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(String(e.data)) as { type?: string; hex?: string };
            if (m.type === 'rx' && m.hex) onRx(fromHex(m.hex));
          } catch {
            /* */
          }
        });
        resolve();
      }
      if (msg.type === 'error') {
        window.clearTimeout(timer);
        reject(new Error(msg.error ?? 'Could not connect'));
      }
    };

    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ type: 'connect', mac, channel: 4 }));
  });

  return { transport, name: name || mac || 'soundcore' };
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const t = window.setTimeout(() => {
      ws.close();
      reject(new Error('No desktop helper running. Use Search to pick a device in Chrome.'));
    }, 2500);
    ws.addEventListener('open', () => {
      window.clearTimeout(t);
      resolve(ws);
    });
    ws.addEventListener('error', () => {
      window.clearTimeout(t);
      reject(new Error('No desktop helper running. Use Search to pick a device in Chrome.'));
    });
  });
}
