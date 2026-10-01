import { useCallback, useEffect, useReducer, useState } from 'react';
import { useApp } from '../state/store';
import {
  INITIAL_SCAN_STATE,
  deriveCapabilities,
  nextScanState,
  type ScannedDevice,
} from '../state/derive';
import { DEVICES, matchDevice } from '../protocol/devices';
import { MARKET_CATALOG, type MarketCatalogEntry } from '../protocol/marketCatalog';
import { DeviceTypeVisual, deviceKindLabel } from '../components/DeviceTypeVisual';
import { bridgeHealth, scanBridgeDevicesDetailed } from '../transports/bridge';
import { IconBt, IconCheck, IconClose, IconRefresh } from '../components/Icons';
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
 * Devices page (PART I/M) — the real Windows/Linux Bluetooth scanning
 * backend only.
 *
 * Scan data comes from the helper's `/scan` HTTP endpoint (Windows PnP or
 * Linux BlueZ enumeration in soundcore_bridge.py), liveness from `/health`.
 * Every state is explicit: checking helper / scanning / results / empty /
 * error + retry. No mock or demo data reaches this page in production; the
 * developer simulator lives in Settings behind `import.meta.env.DEV`.
 */

function soundcoreFirst(a: ScannedDevice, b: ScannedDevice): number {
  const score = (d: ScannedDevice) =>
    /soundcore|anker|liberty|r50i|p30i|p20i|space|q30|q35|q45|a39|a30/i.test(d.name) ? 0 : 1;
  return Number(Boolean(b.connected)) - Number(Boolean(a.connected)) || score(a) - score(b) || a.name.localeCompare(b.name);
}

function normalizeMac(input: string): string {
  const hexed = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hexed.length !== 12) return '';
  const parts = hexed.match(/.{2}/g);
  return parts ? parts.join(':') : '';
}

const HELPER_OFFLINE_MESSAGE =
  'The Bluetooth helper is not responding. It starts automatically with SoundControl and may still be booting — retry in a moment. If it never starts, check the SoundControl log folder in Settings.';

/** Recovery-only selector. Registry profiles and their documented capabilities,
 * never free-text model codes, offsets, or commands. */
export function ManualModelOptions({
  currentId,
  onSelect,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {DEVICES.filter((d) => d.verified).map((d) => {
        const current = currentId === d.id;
        const caps = deriveCapabilities(d);
        const features = [
          caps.supportsNoiseControl && 'ANC / transparency',
          caps.supportsEqualizer && 'EQ',
          caps.supportsGaming && 'Game Mode',
          caps.supportsLdac && 'LDAC',
          caps.supportsDual && 'Multipoint',
          caps.supportsSurround && 'Spatial audio',
        ].filter(Boolean).join(' · ') || 'Universal reads only';
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors duration-150 ${
                current ? 'border-accent/60 bg-accent/10' : 'border-edge bg-sunken hover:border-accent/35'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {d.name} <span className="font-mono text-[11px] text-faint">{d.sku}</span>
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-soft">Verified protocol profile</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-mute">{deviceKindLabel(d.kind)} · {features}</span>
              </span>
              {current && <IconCheck size={16} className="text-accent" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DevicesPage() {
  const app = useApp();
  const [scan, dispatch] = useReducer(nextScanState, INITIAL_SCAN_STATE);
  const [macInput, setMacInput] = useState('');
  const [macHint, setMacHint] = useState<string | null>(null);
  const [connectingMac, setConnectingMac] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Never carry an open recovery picker across disconnect/reconnect or a
  // switch to another MAC, even when React batches the connection updates.
  useEffect(() => setProfileOpen(false), [app.connectedMac]);

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
      setMacHint('Enter the Bluetooth address like AA:BB:CC:DD:EE:FF from your computer’s Bluetooth device details.');
      return;
    }
    setMacHint(null);
    // When the typed address is in the current scan results, reuse the
            // identity the host already reported for it: the model name selects the
            // right device profile (and with it the correct battery scale — a
            // scale-5 model read against the generic scale-10 default would show
            // half the real percentage). Only real scan data is used; an address
            // the host cannot name still connects with the honest generic default.
    const known = scan.devices.find(
      (d) => typeof d.mac === 'string' && d.mac.toUpperCase() === mac,
    );
    void connect(mac, known?.name, known?.battery ?? null);
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
              title="The local helper performs host Bluetooth enumeration"
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
            title="Paired Bluetooth devices"
            subtitle="Devices paired with this computer — SoundControl detects them automatically and speaks RFCOMM directly"
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
                  Earbuds must stay <span className="font-semibold text-ink/80">connected</span> in this
                  computer’s Bluetooth settings (audio may be playing). “Pairing mode” is the wrong state.
                </p>
              </div>
            )}

            {scan.status === 'idle' && scan.helper === 'offline' && (
              <UnavailableNote title="Bluetooth helper unavailable">{HELPER_OFFLINE_MESSAGE}</UnavailableNote>
            )}

            {scan.status === 'results' && (
              <ul className="space-y-2">
                {scan.devices.map((device) => {
                  const isActive = app.connected && device.mac !== undefined && device.mac.toUpperCase() === app.connectedMac?.toUpperCase();
                  const isConnecting = connectingMac === device.mac;
                  const matched = matchDevice(device.name);
                  const knownProfile = matched.id !== 'unknown' ? matched : null;
                  return (
                    <li
                      key={device.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${isActive ? 'border-accent/55 bg-accent/8' : 'border-edge bg-sunken hover:border-accent/35'}`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isActive ? 'border-accent/40 bg-accent/12 text-accent' : 'border-edge bg-panel text-mute'}`}
                        title={knownProfile ? deviceKindLabel(knownProfile.kind) : 'Unknown device type'}
                      >
                        {knownProfile ? <DeviceTypeVisual kind={knownProfile.kind} size={19} /> : <IconBt size={19} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{device.name}</span>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-soft">
                              <IconCheck size={10} /> RFCOMM connected · SoundControl
                            </span>
                          ) : device.connected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/8 px-2 py-0.5 text-[10px] font-semibold text-accent-soft">
                              <IconCheck size={10} /> Bluetooth connected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-faint">
                              Paired
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                          {knownProfile && (
                            <span>{deviceKindLabel(knownProfile.kind)} · name matches a protocol profile (unconfirmed)</span>
                          )}
                          {device.mac && <span className="font-mono">{device.mac}</span>}
                          {typeof device.battery === 'number' && (
                            <span className="inline-flex items-center gap-1 text-mute">
                              · {device.battery}% host
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
          <Card title="Connect by address" subtitle="For devices paired without a readable name">
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
                      title="Remove from this local list (does not unpair the device from the computer)"
                      className="rounded p-1 text-faint transition-colors hover:bg-raised hover:text-danger"
                    >
                      <IconClose size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Device Connectivity" subtitle="Automatic identification is the default; manual choice is a recovery option">
            <div className="space-y-1 text-xs text-mute">
              {app.connected && (
                <p className="text-sm font-semibold text-ink">
                  {app.identification === 'verified' ? app.profile.name : 'Unknown Soundcore device'}
                </p>
              )}
              <p>Device name: <span className="text-ink">{app.connected ? app.deviceName : 'No device'}</span></p>
              <p>Model code: <span className="font-mono text-ink">{app.identification === 'verified' ? app.profile.sku : 'Not verified'}</span></p>
              <p>Connection: <span className="text-ink">{app.connected ? 'Connected' : 'Not connected'}</span></p>
              <p>Identification: <span className="text-ink">{{
                verified: '✓ Automatically verified (protocol profile and state layout)',
                uncertain: '⚠ Connected but identification uncertain',
                mismatch: '⚠ Connected with identification mismatch',
                'not-connected': 'Not connected',
              }[app.identification]}</span></p>
              {app.manualCandidate && (
                <p>
                  {app.identification === 'verified'
                    ? `Manual suggestion ${app.manualCandidate.name} (${app.manualCandidate.sku}) ignored — automatic identification takes precedence.`
                    : `Manual protocol-profile candidate: ${app.manualCandidate.name} (${app.manualCandidate.sku}). Automatic identification and command gates still apply.`}
                </p>
              )}
            </div>
            {app.connected && (
              <div className="mt-3 flex flex-wrap gap-2">
                {app.connectedMac && <>
                  <Button
                    size="sm"
                    variant={app.identification === 'verified' ? 'secondary' : 'primary'}
                    onClick={() => setProfileOpen(true)}
                  >
                    {app.identification === 'verified' ? 'Change device model' : 'Select model manually'}
                  </Button>
                  {app.manualCandidate && (
                    <Button size="sm" onClick={app.resetAutomaticDetection}>Reset to automatic detection</Button>
                  )}
                </>}
                <Button size="sm" variant="danger" onClick={() => void app.disconnect()}>Disconnect</Button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-faint">
              Automatic detection remains primary. A manual suggestion applies only to this device/session,
              never replaces a confirmed automatic profile, and cannot unlock protocol commands.
            </p>
          </Card>

          {/* Capabilities of the connected/selected model — PART L honesty. */}
          <Card
            title="Model capabilities"
            subtitle={app.connected && app.identification !== 'verified'
              ? 'Model-specific controls unavailable until identification is verified'
              : `${app.profile.name} (${app.profile.sku}) — derived from documented protocol evidence`}
          >
            <CapabilityList />
            {app.profileNote && (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
                {app.profileNote}
              </p>
            )}
            {!app.profile.verified && (
              <p className="mt-2 text-[11px] text-faint">
                No verified model-specific profile is available. Only universal read commands are enabled.
              </p>
            )}
          </Card>

          <MarketCoverageCard onOpen={() => setCatalogOpen(true)} />
        </div>
      </div>

      {/* A candidate is scoped to the active MAC; it cannot alter the wire profile. */}
      <Modal open={profileOpen && app.connected && Boolean(app.connectedMac)} title="Manual model selection (recovery)" onClose={() => setProfileOpen(false)} width="max-w-2xl">
        <p className="mb-3 text-xs leading-relaxed text-mute">
          Automatic identification remains primary. Only verified protocol profiles are listed;
          a manual choice is only a session-scoped suggestion and cannot bypass the command gate.
          A confirmed automatic identity takes precedence.
        </p>
        <ManualModelOptions
          currentId={app.manualCandidate?.id ?? null}
          onSelect={(id) => {
            app.selectManualModel(id);
            setProfileOpen(false);
          }}
        />
      </Modal>

      <Modal open={catalogOpen} title="US/EU market snapshot" onClose={() => setCatalogOpen(false)} width="max-w-4xl">
        <p className="mb-4 text-xs leading-relaxed text-mute">
          Catalog identity, implemented protocol support and automated test coverage are
          separate. Catalog-only devices retain safe read paths; SoundControl does not
          guess model-specific ANC, EQ, codec, or state offsets.
        </p>
        <div className="space-y-4">
          {(['tws', 'sleep', 'open-ear', 'neckband', 'headphones'] as const).map((category) => {
            const entries = MARKET_CATALOG.filter((entry) => entry.category === category);
            return (
              <section key={category}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-accent-soft">
                  {category === 'tws' ? 'Traditional TWS earbuds' : category === 'sleep' ? 'Sleep earbuds' : category === 'open-ear' ? 'Open-ear / clip-on' : category === 'neckband' ? 'Neckband earphones' : 'Over-ear / on-ear'}
                </h3>
                <ul className="space-y-1.5">
                  {entries.map((entry) => <CatalogStatusRow key={entry.sku} entry={entry} />)}
                </ul>
              </section>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

/** Summary card for the deduplicated official-market registry. */
function MarketCoverageCard({ onOpen }: { onOpen: () => void }) {
  const protocol = MARKET_CATALOG.filter((entry) => entry.protocolStatus === 'implemented').length;
  const readOnly = MARKET_CATALOG.filter((entry) => entry.protocolStatus === 'read-only').length;
  const unknown = MARKET_CATALOG.filter((entry) => entry.protocolStatus === 'unknown').length;
  const tested = MARKET_CATALOG.filter((entry) => entry.unitTestCoverage === 'covered').length;
  return (
    <Card
      title="Market compatibility"
      subtitle={`${MARKET_CATALOG.length} deduplicated US/EU catalog identities · storefront snapshot 2026-09-29, legacy rows 2026-10-01`}
      actions={<Button size="sm" onClick={onOpen}>View status</Button>}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MarketMetric value={protocol} label="protocol" tone="good" />
        <MarketMetric value={readOnly} label="read-only" tone="warn" />
        <MarketMetric value={unknown} label="catalog only" tone="muted" />
        <MarketMetric value={tested} label="unit-tested" tone="good" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Regional names and model-number aliases are grouped into one canonical SKU row.
      </p>
    </Card>
  );
}

function MarketMetric({ value, label, tone }: { value: number; label: string; tone: 'good' | 'warn' | 'muted' }) {
  const style = tone === 'good' ? 'text-accent-soft' : tone === 'warn' ? 'text-warn' : 'text-mute';
  return (
    <div className="rounded-lg border border-edge bg-sunken px-2.5 py-2">
      <div className={`font-mono text-lg font-semibold ${style}`}>{value}</div>
      <div className="text-[10px] text-faint">{label}</div>
    </div>
  );
}

function CatalogStatusRow({ entry }: { entry: MarketCatalogEntry }) {
  const protocol = entry.protocolStatus === 'implemented' ? 'Protocol: supported' : entry.protocolStatus === 'read-only' ? 'Protocol: read-only' : 'Protocol: catalog only';
  const protocolStyle = entry.protocolStatus === 'implemented'
    ? 'border-accent/30 bg-accent/8 text-accent-soft'
    : entry.protocolStatus === 'read-only'
      ? 'border-warn/30 bg-warn/8 text-warn'
      : 'border-edge bg-sunken text-faint';
  return (
    <li className="rounded-xl border border-edge bg-sunken px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-ink">{entry.sku}</span>
        <span className="text-xs font-semibold text-ink">{entry.name}</span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${protocolStyle}`}>{protocol}</span>
        <span className="ml-auto text-[10px] text-faint">{entry.regions.join(' / ')}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
        <span>Simulator: <b className={entry.simulatorCoverage === 'covered' ? 'text-accent-soft' : 'text-faint'}>{entry.simulatorCoverage}</b></span>
        <span>Unit tests: <b className={entry.unitTestCoverage === 'covered' ? 'text-accent-soft' : 'text-faint'}>{entry.unitTestCoverage}</b></span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-faint">Aliases: {entry.aliases.join(' · ')}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-mute">{entry.protocolEvidence}</p>
    </li>
  );
}

/** Honest capability matrix rows — every ✓/✗ maps to a documented command. */
function CapabilityList() {
  const app = useApp();
  const c = app.capabilities;
  const rows: Array<[string, boolean, string]> = [
    ['Noise control', c.supportsNoiseControl, c.supportsNoiseControl ? `06:81 · ${app.profile.ancLayout}` : app.connected && app.identification !== 'verified' ? 'identification not verified' : 'no sound-mode module'],
    ['Equalizer', c.supportsEqualizer, c.supportsEqualizer ? String(app.profile.eqCommand) : app.connected && app.identification !== 'verified' ? 'identification not verified' : '03:87 HearID — not sent on purpose'],
    ['Gaming mode', c.supportsGaming, c.supportsGaming ? (app.profile.sku === 'A3947' ? '10:85' : '01:87') : 'no command for this model'],
    ['3D surround', c.supportsSurround, c.supportsSurround ? '02:86' : 'no command for this model'],
    ['Dual connection', c.supportsDual, c.supportsDual ? '0B:84' : 'no command for this model'],
    ['LDAC codec', c.supportsLdac, c.supportsLdac ? '01:7F / 01:FF' : 'no command for this model'],
    ['Firmware & serial', c.supportsFirmwareInfo, '01:05 — every supported model'],
    ['Per-earbud status & battery', c.supportsEarbudState, c.supportsEarbudState ? '01:03 side bytes (0xFF = absent)' : 'single-body / over-ear hardware'],
    ['Device volume', c.supportsVolume, 'A3116-only reference write; no validated volume readback in this app'],
    ['Gesture remapping', c.supportsGestures, '04:81 is model-specific; read/verify and safety gates not implemented'],
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
