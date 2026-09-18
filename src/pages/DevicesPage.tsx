import { useCallback, useEffect, useReducer, useState } from 'react';
import { useApp } from '../state/store';
import {
  INITIAL_SCAN_STATE,
  nextScanState,
  type ScannedDevice,
} from '../state/derive';
import { DEVICES } from '../protocol/devices';
import { bridgeHealth, scanBridgeDevicesDetailed } from '../transports/bridge';
import { IconBolt, IconBt, IconCheck, IconClose, IconRefresh } from '../components/Icons';
import {
  Button,
  Card,
  InlineError,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  UnavailableNote,
} from '../components/ui';

/**
 * Devices page (PART I/M) — the real Windows scanning backend only.
 *
 * Scan data comes from the helper's `/scan` HTTP endpoint (PowerShell/PnP
 * enumeration in soundcore_bridge.py — unchanged), liveness from `/health`.
 * Every state is explicit: checking helper / scanning / results / empty /
 * error + retry. No mock or demo data reaches this page in production; the
 * developer simulator lives in Settings behind `import.meta.env.DEV`.
 */

function soundcoreFirst(a: ScannedDevice, b: ScannedDevice): number {
  const score = (d: ScannedDevice) =>
    /soundcore|anker|liberty|r50i|p30i|p20i|space|q30|q35|q45|a39|a30/i.test(d.name) ? 0 : 1;
  return score(a) - score(b) || a.name.localeCompare(b.name);
}

function normalizeMac(input: string): string {
  const hexed = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hexed.length !== 12) return '';
  const parts = hexed.match(/.{2}/g);
  return parts ? parts.join(':') : '';
}

const HELPER_OFFLINE_MESSAGE =
  'The Windows Bluetooth helper is not responding. It starts automatically with SoundControl and may still be booting — retry in a moment. If it never starts, check %AppData%\\soundcontrol\\main.log.';

export function DevicesPage() {
  const app = useApp();
  const [scan, dispatch] = useReducer(nextScanState, INITIAL_SCAN_STATE);
  const [macInput, setMacInput] = useState('');
  const [macHint, setMacHint] = useState<string | null>(null);
  const [connectingMac, setConnectingMac] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  /* ---------------------------------------------------------- scanning */

  const refresh = useCallback(async (fresh: boolean, manual: boolean) => {
    if (manual) dispatch({ type: 'start' });
    const health = await bridgeHealth();
    if (!health) {
      dispatch({ type: 'helper-offline', message: HELPER_OFFLINE_MESSAGE });
      return;
    }
    dispatch({ type: 'helper', online: true });
    const result = await scanBridgeDevicesDetailed(fresh);
    if (result.error) {
      dispatch({ type: 'error', message: result.error });
      return;
    }
    dispatch({
      type: 'results',
      devices: [...result.devices].sort(soundcoreFirst),
      at: Date.now(),
    });
  }, []);

  // Initial pull + gentle 5s background poll (helper-side cache; manual
  // refresh forces a fresh PnP enumeration). Same hardened pattern the
  // previous connect flow used: stopped/inFlight guards, cleaned up on
  // unmount so no timer or promise outlives the page.
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const pull = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        await refresh(false, false);
      } finally {
        inFlight = false;
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  /* --------------------------------------------------------- connecting */

  const connect = useCallback(
    async (mac: string, name?: string, battery?: number | null) => {
      setConnectingMac(mac);
      try {
        // Errors surface through the app-level banner (classified by the
        // hardened transport); swallow the rethrow — never an unhandled
        // rejection.
        await app.connectBridge(mac, name, battery ?? null);
      } catch {
        /* banner already explains it */
      } finally {
        setConnectingMac(null);
      }
    },
    [app],
  );

  const submitMac = (event: React.FormEvent) => {
    event.preventDefault();
    const mac = normalizeMac(macInput);
    if (!mac) {
      setMacHint('Enter the Bluetooth address like AA:BB:CC:DD:EE:FF from Windows device properties.');
      return;
    }
    setMacHint(null);
    void connect(mac);
  };

  const busy = app.connecting;

  /* ------------------------------------------------------------- render */

  return (
    <div>
      <PageHeader
        title="Devices"
        sub={
          <>
            <StatusBadge phase={app.connectionPhase} />
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                scan.helper === 'online'
                  ? 'border-accent/30 bg-accent/8 text-accent-soft'
                  : scan.helper === 'offline'
                    ? 'border-danger/30 bg-danger/8 text-danger'
                    : 'border-edge bg-sunken text-mute'
              }`}
              title="The local Python helper performs Windows PnP Bluetooth enumeration"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  scan.helper === 'online' ? 'bg-accent' : scan.helper === 'offline' ? 'bg-danger' : 'bg-faint blink'
                }`}
                aria-hidden
              />
              Helper {scan.helper === 'online' ? 'running' : scan.helper === 'offline' ? 'not responding' : 'checking…'}
            </span>
          </>
        }
        right={
          <Button
            variant="primary"
            loading={scan.status === 'scanning'}
            disabled={busy || scan.status === 'scanning'}
            onClick={() => void refresh(true, true)}
          >
            {!busy && scan.status !== 'scanning' && <IconRefresh size={15} />}
            {scan.status === 'scanning' ? 'Scanning…' : 'Scan devices'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ---------------------------------------------- discovered list */}
        <div className="space-y-4 xl:col-span-7">
          <Card
            title="Paired Windows devices"
            subtitle="Bluetooth devices already paired in Windows Settings — SoundControl speaks RFCOMM to them directly"
            actions={
              scan.lastScanAt !== null ? (
                <span className="font-mono text-[10px] text-faint">
                  last scan {new Date(scan.lastScanAt).toLocaleTimeString()}
                </span>
              ) : undefined
            }
          >
            {scan.status === 'error' && scan.message && (
              <div className="space-y-3">
                <InlineError message={scan.message} />
                <Button onClick={() => void refresh(true, true)} disabled={busy}>
                  <IconRefresh size={14} /> Retry scan
                </Button>
              </div>
            )}

            {(scan.status === 'scanning' || (scan.status === 'idle' && scan.helper === 'checking')) && (
              <div className="flex items-center gap-3 py-6 text-sm text-mute">
                <Spinner size={18} />
                {scan.helper === 'checking' ? 'Checking the Bluetooth helper…' : 'Scanning paired devices…'}
              </div>
            )}

            {scan.status === 'empty' && (
              <div className="space-y-3 py-2">
                <p className="text-sm leading-relaxed text-mute">{scan.message}</p>
                <p className="text-xs text-faint">
                  Earbuds must stay <span className="font-semibold text-ink/80">connected</span> in Windows
                  Bluetooth settings (audio may be playing). “Pairing mode” is the wrong state.
                </p>
              </div>
            )}

            {scan.status === 'idle' && scan.helper === 'offline' && (
              <UnavailableNote title="Bluetooth helper unavailable">{HELPER_OFFLINE_MESSAGE}</UnavailableNote>
            )}

            {scan.status === 'results' && (
              <ul className="space-y-2">
                {scan.devices.map((device) => {
                  const isActive = app.connected && device.mac !== undefined && device.mac === app.connectedMac;
                  const isConnecting = connectingMac === device.mac;
                  return (
                    <li
                      key={device.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
                        isActive ? 'border-accent/55 bg-accent/8' : 'border-edge bg-sunken hover:border-accent/35'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                          isActive ? 'border-accent/40 bg-accent/12 text-accent' : 'border-edge bg-panel text-mute'
                        }`}
                      >
                        <IconBt size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{device.name}</span>
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-soft">
                              <IconCheck size={10} /> Connected
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-faint">
                          {device.mac}
                          {typeof device.battery === 'number' && (
                            <span className="inline-flex items-center gap-1 text-mute">
                              · {device.battery}%
                              <IconBolt size={10} className="text-warn/80" /> Windows
                            </span>
                          )}
                        </span>
                      </span>
                      {isActive ? (
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => void app.disconnect()}>
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={device.mac ? 'primary' : 'secondary'}
                          loading={isConnecting}
                          disabled={busy || !device.mac}
                          onClick={() => device.mac && void connect(device.mac, device.name, device.battery)}
                        >
                          {isConnecting || (busy && !isConnecting) ? 'Connecting…' : 'Connect'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Manual MAC — real connect path for nameless pairings. */}
          <Card title="Connect by address" subtitle="For devices Windows paired without a readable name">
            <form onSubmit={submitMac} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={macInput}
                onChange={(e) => setMacInput(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                aria-label="Bluetooth address"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-edge bg-sunken px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
              />
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Connecting…' : 'Connect'}
              </Button>
            </form>
            {macHint && <p className="mt-2 text-xs text-warn">{macHint}</p>}
          </Card>
        </div>

        {/* -------------------------------------------------- right column */}
        <div className="space-y-4 xl:col-span-5">
          {/* Recent devices — one-tap reconnect (real bridge connects). */}
          {app.recentDevices.length > 0 && (
            <Card title="Recent" subtitle="One tap reconnects through the helper">
              <ul className="space-y-1.5">
                {app.recentDevices.map((d) => (
                  <li key={d.mac} className="flex items-center gap-2 rounded-lg border border-edge bg-sunken px-3 py-2">
                    <button
                      disabled={busy}
                      onClick={() => void connect(d.mac, d.name)}
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="block truncate text-xs font-semibold text-ink">{d.name}</span>
                      <span className="block font-mono text-[10px] text-faint">{d.mac}</span>
                    </button>
                    <span className="text-[11px] font-semibold text-accent-soft">
                      {connectingMac === d.mac ? <Spinner size={13} /> : busy ? '…' : 'Reconnect'}
                    </span>
                    <button
                      onClick={() => app.forgetRecentDevice(d.mac)}
                      aria-label={`Forget ${d.name} from the recent list`}
                      title="Remove from this local list (does not unpair the device in Windows)"
                      className="rounded p-1 text-faint transition-colors hover:bg-raised hover:text-danger"
                    >
                      <IconClose size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Capabilities of the connected/selected model — PART L honesty. */}
          <Card
            title="Model capabilities"
            subtitle={`${app.profile.name} (${app.profile.sku}) — derived from the documented protocol, per model`}
            actions={
              <Button size="sm" onClick={() => setProfileOpen(true)}>
                {app.connected ? 'Override profile' : 'Preview profiles'}
              </Button>
            }
          >
            <CapabilityList />
            {app.profileNote && (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
                {app.profileNote}
              </p>
            )}
            {!app.profile.verified && (
              <p className="mt-2 text-[11px] text-faint">
                This profile has no published capture; it is the closest verified relative and the
                UI flags it.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Profile picker — changes the protocol profile the app really uses. */}
      <Modal open={profileOpen} title="Soundcore model profiles" onClose={() => setProfileOpen(false)} width="max-w-2xl">
        <p className="mb-3 text-xs leading-relaxed text-mute">
          SoundControl matches the Bluetooth name automatically. Override only if it picked the
          wrong model — the profile decides which real protocol frames (sound modes, EQ, toggles)
          are sent, so a wrong override means wrong commands.
        </p>
        <ul className="space-y-1.5">
          {DEVICES.map((d) => {
            const current = app.profile.id === d.id;
            return (
              <li key={d.id}>
                <button
                  onClick={() => {
                    app.setProfileId(d.id);
                    setProfileOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors duration-150 ${
                    current ? 'border-accent/60 bg-accent/10' : 'border-edge bg-sunken hover:border-accent/35'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {d.name} <span className="font-mono text-[11px] text-faint">{d.sku}</span>
                      {!d.verified && (
                        <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[9px] font-bold text-warn">
                          UNVERIFIED
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-mute">
                      {d.kind === 'earbuds' ? 'Earbuds' : 'Over-ear'} ·{' '}
                      {d.ancLayout !== 'none' ? 'noise control' : 'no noise control'} ·{' '}
                      {d.eqCommand ? `EQ ${d.eqCommand}` : 'EQ via 03:87 (unsupported)'}
                    </span>
                  </span>
                  {current && <IconCheck size={16} className="text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

/** Honest capability matrix rows — every ✓/✗ maps to a documented command. */
function CapabilityList() {
  const app = useApp();
  const c = app.capabilities;
  const rows: Array<[string, boolean, string]> = [
    ['Noise control', c.supportsNoiseControl, c.supportsNoiseControl ? `06:81 · ${app.profile.ancLayout}` : 'no sound-mode module'],
    ['Equalizer', c.supportsEqualizer, c.supportsEqualizer ? String(app.profile.eqCommand) : '03:87 HearID — not sent on purpose'],
    ['Gaming mode', c.supportsGaming, c.supportsGaming ? (app.profile.sku === 'A3947' ? '10:85' : '01:87') : 'no command for this model'],
    ['3D surround', c.supportsSurround, c.supportsSurround ? '02:86' : 'no command for this model'],
    ['Dual connection', c.supportsDual, c.supportsDual ? '0B:84' : 'no command for this model'],
    ['LDAC codec', c.supportsLdac, c.supportsLdac ? '01:7F / 01:FF' : 'no command for this model'],
    ['Firmware & serial', c.supportsFirmwareInfo, '01:05 — every supported model'],
    ['Per-earbud status & battery', c.supportsEarbudState, c.supportsEarbudState ? '01:03 side bytes (0xFF = absent)' : 'single-body / over-ear hardware'],
    ['Device volume', c.supportsVolume, 'no volume command exists in the protocol'],
    ['Gesture remapping', c.supportsGestures, 'no button-write command is publicly documented'],
  ];
  return (
    <ul className="space-y-1">
      {rows.map(([label, ok, detail]) => (
        <li key={label} className="flex items-center gap-2.5 text-xs">
          <span
            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
              ok ? 'border-accent/50 bg-accent/12 text-accent' : 'border-edge bg-sunken text-faint'
            }`}
            aria-hidden
          >
            {ok ? <IconCheck size={10} /> : <IconClose size={9} />}
          </span>
          <span className={`w-44 shrink-0 font-medium ${ok ? 'text-ink' : 'text-mute'}`}>{label}</span>
          <span className="min-w-0 truncate font-mono text-[10px] text-faint">{detail}</span>
        </li>
      ))}
    </ul>
  );
}
