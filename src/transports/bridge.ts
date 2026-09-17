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
// A *failed* IPC call is deliberately not cached: inside the desktop app the
// token always exists, so caching a transient failure as null would lock the
// session into permanent 401s. Outside Electron (browser demo) there is no
// API at all, and that null is cached.
let cachedToken: string | null | undefined;
async function bridgeToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  const get = window.electronAPI?.getBridgeToken;
  if (!get) {
    cachedToken = null;
    return cachedToken;
  }
  try {
    const t = await get();
    if (typeof t === 'string' && t) {
      cachedToken = t;
      return cachedToken;
    }
  } catch {
    /* transient IPC failure — retry on the next call instead of caching null */
  }
  return null;
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
  /**
   * Fires when the helper's WebSocket drops *after* a successful connect —
   * the helper exited, crashed or restarted. Without this the UI would sit at
   * "Connected" forever, with only individual writes failing.
   */
  onDown?: (reason: string) => void,
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
  // Set by transport.close() so an intentional disconnect is never reported
  // to the UI as a dropped link.
  let closedByUs = false;

  const transport: Transport = {
    kind: 'bridge',
    label: name || 'soundcore',
    async write(data) {
      if (ws.readyState !== WebSocket.OPEN) throw new Error('Connection lost');
      ws.send(JSON.stringify({ type: 'tx', hex: toHex(data, '') }));
    },
    async close() {
      closedByUs = true;
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
        // Post-connect lifecycle: if the helper's socket drops unexpectedly
        // (helper exit/crash/restart), tell the app so it can leave the
        // "Connected" state instead of failing silently on the next write.
        ws.addEventListener('close', () => {
          if (!closedByUs) {
            onDown?.(
              'The Bluetooth helper connection closed unexpectedly — the helper may have exited or restarted. Reconnect your device.',
            );
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
        ? { left: windowsBattery, right: windowsBattery, batteryScale: null }
        : null,
    dspChannel,
  };
}

/**
 * Budget for the renderer to reach the local bridge over WebSocket.
 *
 * Electron → Python helper cold-start race: the main process spawns
 * `soundcore_bridge.py` asynchronously at app launch (see
 * startBridgeIfAvailable in electron-main.cjs) and grants it a 12-second
 * readiness budget per interpreter candidate (waitForBridgeReady) — cold
 * starts, first-run antivirus scans of the freshly unpacked runtime and slow
 * disks routinely consume seconds of it. Meanwhile the window is shown
 * immediately, so the renderer can request a connection while the helper is
 * still starting. The old 2.5s timer lost that race and reported "no helper
 * running" when one was, in fact, mid-startup.
 *
 * A connection-refused error fires in milliseconds, so simply enlarging a
 * one-shot timer would not help: the budget is enforced as a retry loop that
 * keeps re-attempting the handshake until the deadline. 15s deliberately
 * outlasts the helper's own 12s readiness budget, so a helper Electron
 * considers startable can never be declared dead by the renderer first.
 */
export const BRIDGE_STARTUP_TIMEOUT_MS = 15000;
/** Pause between WebSocket attempts while the helper may still be starting. */
const BRIDGE_RETRY_INTERVAL_MS = 250;

/** What the helper's HTTP endpoint says about why the WebSocket failed. */
type HelperStatus = 'online' | 'token' | 'origin' | 'unreachable';

/**
 * Classify a failed WebSocket handshake with a cheap authenticated /health
 * probe, so the user sees the real cause instead of one generic message:
 * 401 → session-token mismatch, 403 → origin refused, 200 → helper up but
 * the upgrade itself failed, network error → helper not listening (still
 * starting, or failed to start).
 */
async function diagnoseHelper(): Promise<HelperStatus> {
  const base = scanHttpBase();
  if (!base) return 'unreachable';
  try {
    const token = await bridgeToken();
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(2000),
      headers: authHeaders(token),
    });
    if (res.status === 401) return 'token';
    if (res.status === 403) return 'origin';
    return res.ok ? 'online' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** One WebSocket handshake attempt; never rejects, reports failure instead. */
function attemptSocket(url: string): Promise<{ ws: WebSocket | null }> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ ws: null });
      return;
    }
    // Guard against re-entrancy: close() can dispatch 'error'/'close'
    // synchronously (Node's WebSocket does), and a second fail() must neither
    // recurse nor resolve twice.
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', fail);
      ws.removeEventListener('close', fail);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      resolve({ ws: null });
    };
    const onOpen = () => {
      if (settled) return;
      settled = true;
      ws.removeEventListener('error', fail);
      ws.removeEventListener('close', fail);
      resolve({ ws });
    };
    ws.addEventListener('open', onOpen);
    // Connection-refused fires 'error' (then 'close'); both mean "not yet".
    ws.addEventListener('error', fail);
    ws.addEventListener('close', fail);
  });
}

async function openSocket(url: string): Promise<WebSocket> {
  const deadline = Date.now() + BRIDGE_STARTUP_TIMEOUT_MS;
  // Consecutive identical diagnoses needed before failing fast: a single
  // probe could catch a weird transient, but these states do not heal by
  // retrying, so spinning for the full budget would just hide the real cause.
  let tokenRejections = 0;
  let onlineButRefusing = 0;
  for (;;) {
    const attempt = await attemptSocket(url);
    if (attempt.ws) return attempt.ws;

    // The handshake failed. Classify before retrying.
    const status = await diagnoseHelper();
    if (status === 'unreachable') {
      tokenRejections = 0;
      onlineButRefusing = 0;
    } else if (status === 'origin') {
      throw new Error(
        'The Bluetooth helper refused this window (origin not allowed by its security policy). Restart SoundControl from its desktop shortcut.',
      );
    } else if (status === 'token' && ++tokenRejections >= 2) {
      throw new Error(
        "The Bluetooth helper rejected SoundControl's session token — a helper from a previous session may still own port 8765. Restart SoundControl; if that does not help, end the stale helper (python.exe) process or reboot.",
      );
    } else if (status === 'online' && ++onlineButRefusing >= 3) {
      throw new Error(
        'The Windows Bluetooth helper is running but its WebSocket connection keeps failing. Restart SoundControl and try again.',
      );
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => window.setTimeout(r, BRIDGE_RETRY_INTERVAL_MS));
  }
  // Nothing was listening for the whole budget: the helper either never got
  // started or needs longer than its 12s Electron-side readiness window
  // (Electron logs the attempt to %AppData%\soundcontrol\main.log).
  throw new Error(
    'The Windows Bluetooth helper did not become ready within 15 seconds. It starts automatically with the app and may still be booting up — try connecting again in a moment. If it never starts, check %AppData%\\soundcontrol\\main.log and restart SoundControl.',
  );
}
