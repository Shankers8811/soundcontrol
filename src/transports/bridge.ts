import { fromHex, toHex } from '../protocol/codec';
import type { BatteryState, Transport } from '../types';

export interface NearbyDevice {
  id: string;
  name: string;
  mac?: string;
  source: 'bridge' | 'demo';
  /** Windows may expose one aggregate Bluetooth battery percentage. */
  battery?: number | null;
}

// The packaged Electron app loads via file://, where location.hostname is
// empty — without this the bridge URL becomes ws://:8765 and never resolves,
// so the desktop app could never reach its own helper.
function isLocalHost(): boolean {
  const h = location.hostname;
  return !h || h === 'localhost' || h === '127.0.0.1';
}

// Per-session bridge secret. The Windows desktop app's main process mints a
// fresh token on every launch and hands it to this renderer over IPC.
// Fetched once and cached — the token never changes within a session.
let cachedToken: string | null | undefined;
async function bridgeToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const t = await window.electronAPI?.getBridgeToken?.();
    cachedToken = typeof t === 'string' && t ? t : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function defaultBridgeUrl(token: string | null = null): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${isLocalHost() ? '127.0.0.1' : location.hostname}:8765/ws`;
  // The renderer's WebSocket handshake cannot carry custom headers, so the
  // secret travels as a query parameter; loopback only, never logged by the bridge.
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function scanHttpBase(): string | null {
  // Public https pages (GitHub Pages) are blocked by Private Network Access
  // rules from talking to the loopback bridge, so skip polling there.
  if (location.protocol === 'https:' && !isLocalHost()) return null;
  return `http://${isLocalHost() ? '127.0.0.1' : location.hostname}:8765`;
}

export interface BridgeHealth {
  ok: boolean;
  connected: boolean;
  mac: string;
  channel: number;
}

/** Fast liveness probe for the local bridge helper (never runs PnP enumeration). */
export async function bridgeHealth(): Promise<BridgeHealth | null> {
  const base = scanHttpBase();
  if (!base) return null;
  try {
    const token = await bridgeToken();
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(2000),
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as BridgeHealth;
  } catch {
    return null;
  }
}

/** Quick reachability probe for the local bridge helper. */
export async function bridgeAlive(): Promise<boolean> {
  return (await bridgeHealth()) !== null;
}

export async function scanBridgeDevices(fresh = false): Promise<NearbyDevice[]> {
  const base = scanHttpBase();
  if (!base) return [];
  try {
    const token = await bridgeToken();
    // Windows PnP/Bluetooth enumeration can take several seconds on a cold
    // machine; the helper caches for 3s and /health stays the fast probe.
    const res = await fetch(`${base}/scan${fresh ? '?fresh=1' : ''}`, {
      signal: AbortSignal.timeout(10000),
      headers: authHeaders(token),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      devices?: Array<{ mac: string; name: string; battery?: number | null }>;
    };
    return (json.devices ?? []).map((d) => ({
      id: d.mac,
      name: d.name || d.mac,
      mac: d.mac,
      battery: d.battery ?? null,
      source: 'bridge' as const,
    }));
  } catch {
    return [];
  }
}

interface BridgeHello {
  type?: string;
  devices?: Array<{ mac: string; name: string; battery?: number | null }>;
  error?: string;
  message?: string;
  channel?: number;
}

export async function connectBridge(
  mac: string,
  onRx: (data: Uint8Array) => void,
  name = '',
  windowsBattery: number | null = null,
  /** Bridge diagnostics ("DSP answered on channel 4", silent-link watchdog…). */
  onSys: (message: string, isError: boolean) => void = () => {},
): Promise<{
  transport: Transport;
  name: string;
  battery: Partial<BatteryState> | null;
  /** RFCOMM channel the bridge verified as the DSP, once it reports one. */
  dspChannel: number | null;
}> {
  const url = defaultBridgeUrl(await bridgeToken());
  const ws = await openSocket(url);
  let dspChannel: number | null = null;

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
    const fail = (message: string) => {
      window.clearTimeout(timer);
      ws.removeEventListener('message', onMsg);
      ws.removeEventListener('close', onClose);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      reject(new Error(message));
    };
    // The bridge probes up to six RFCOMM channels with a handshake before it
    // gives up (see DSP_CHANNEL_CANDIDATES in soundcore_bridge.py). That can
    // take ~20s on a cold stack, so this has to outlast it — a 10s timer used
    // to abandon connections that were about to succeed.
    const timer = window.setTimeout(
      () =>
        fail(
          'Could not reach the earbuds. Leave them connected in Windows Bluetooth settings (not in pairing mode), close the Soundcore phone app, and retry.',
        ),
      30000,
    );
    const onClose = () => fail('The desktop helper closed the connection before the earbuds connected.');

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
      if (msg.type === 'sys' && (msg.message || msg.error)) {
        onSys(msg.error ?? msg.message ?? '', Boolean(msg.error));
        return;
      }
      if (msg.type === 'connected') {
        if (typeof msg.channel === 'number') dspChannel = msg.channel;
        window.clearTimeout(timer);
        ws.removeEventListener('message', onMsg);
        ws.removeEventListener('close', onClose);
        ws.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(String(e.data)) as {
              type?: string;
              hex?: string;
              message?: string;
              error?: string;
            };
            if (m.type === 'rx' && m.hex) onRx(fromHex(m.hex));
            // Late diagnostics from the helper, e.g. the silent-link watchdog
            // firing seconds after the connect already resolved.
            if (m.type === 'sys' && (m.message || m.error)) {
              onSys(m.error ?? m.message ?? '', Boolean(m.error));
            }
          } catch {
            /* */
          }
        });
        resolve();
      }
      if (msg.type === 'error') {
        fail(msg.error ?? 'Could not connect');
      }
    };

    ws.addEventListener('message', onMsg);
    ws.addEventListener('close', onClose);
    try {
      ws.send(JSON.stringify({ type: 'connect', mac, channel: 4 }));
    } catch {
      fail('The desktop helper connection is not writable.');
    }
  });

  return {
    transport,
    name: name || mac || 'soundcore',
    battery:
      windowsBattery !== null
        ? { left: windowsBattery, right: windowsBattery, case: null, batteryScale: null }
        : null,
    dspChannel,
  };
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
      reject(new Error('No Windows Bluetooth helper running. Restart SoundControl and try again.'));
    }, 2500);
    ws.addEventListener('open', () => {
      window.clearTimeout(t);
      resolve(ws);
    });
    ws.addEventListener('error', () => {
      window.clearTimeout(t);
      reject(new Error('No Windows Bluetooth helper running. Restart SoundControl and try again.'));
    });
  });
}
