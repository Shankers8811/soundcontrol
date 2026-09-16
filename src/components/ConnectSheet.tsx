import { useEffect, useState } from 'react';
import { asset } from '../lib/asset';
import { bluetoothReady, inIframe, isPolicyError, isUserCancel, openAppWindow } from '../lib/bluetoothEnv';
import { useApp } from '../state/store';
import { bridgeAlive, scanBridgeDevices, type NearbyDevice } from '../transports/bridge';

// Electron only implements Web Bluetooth on Linux — on Windows the desktop app
// cannot scan at all, and requests reject with a silent NotFoundError. The
// working path there is the local Python RFCOMM bridge, which talks to devices
// *already paired with Windows* — including earbuds currently playing audio,
// which no browser-style scan can see.
const desktop = typeof window !== 'undefined' ? window.electronAPI : undefined;
const onWindowsDesktop = desktop?.isElectron === true && desktop?.platform === 'win32';

function normalizeMac(input: string): string {
  const hexed = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hexed.length !== 12) return '';
  const parts = hexed.match(/.{2}/g);
  return parts ? parts.join(':') : '';
}

export function ConnectSheet() {
  const app = useApp();
  const [searching, setSearching] = useState(false);
  const [nearby, setNearby] = useState<NearbyDevice[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [helper, setHelper] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [macInput, setMacInput] = useState('');
  const framed = inIframe();

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      const [found, alive] = await Promise.all([scanBridgeDevices(), bridgeAlive()]);
      if (stop) return;
      setHelper(alive ? 'online' : 'offline');
      if (found.length) setNearby(found);
    };
    void pull();
    const t = window.setInterval(() => void pull(), 2500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  const search = async () => {
    app.clearError();
    setHint(null);

    if (onWindowsDesktop) {
      // Browser scanning cannot work in Electron on Windows, so Search refreshes
      // the paired-device list instead — which is also the better behavior: it
      // finds earbuds that are already connected and playing.
      setSearching(true);
      try {
        const [found, alive] = await Promise.all([scanBridgeDevices(), bridgeAlive()]);
        setHelper(alive ? 'online' : 'offline');
        if (found.length) setNearby(found);
        if (!alive) {
          setHint(
            'The Bluetooth helper is not responding. Restart SoundControl — it starts the helper automatically, no installs needed. If it still does not respond, reinstall from the latest GitHub Release (or open the web app in Edge/Chrome and pair earbuds in pairing mode instead).',
          );
        } else if (!found.length) {
          setHint(
            'No paired devices found yet — pair the earbuds once in Windows Settings → Bluetooth & devices. Paired earbuds show up here even while they are playing audio; no need to disconnect.',
          );
        }
      } finally {
        setSearching(false);
      }
      return;
    }

    if (framed || !bluetoothReady()) {
      const w = openAppWindow();
      if (!w) {
        setHint('Allow the pop-up, or use the preview menu "Open in new tab". Then tap Search — Chrome will list your earbuds.');
        return;
      }
      setHint('Continue in the new tab. Chrome will show nearby soundcore devices — tap yours. No codes to type.');
      return;
    }

    setSearching(true);
    try {
      await app.connectBle(showAll);
    } catch (err) {
      if (isPolicyError(err)) {
        openAppWindow();
        setHint('Bluetooth is blocked in this embedded preview. Use the new tab, then tap Search.');
      } else if (isUserCancel(err)) {
        setHint(
          'Nothing listed? Earbuds already connected to your computer are invisible to browser scans — put them in pairing mode (open the case, hold its button ~3s), or on Windows use the desktop app, which finds paired devices automatically.',
        );
      }
    } finally {
      setSearching(false);
    }
  };

  const pick = async (d: NearbyDevice) => {
    if (d.source === 'demo') {
      await app.connectSim().catch(() => {});
      return;
    }
    if (d.mac) await app.connectBridge(d.mac, d.name, d.battery).catch(() => {});
  };

  return (
    <div className="flex flex-1 flex-col px-5 py-4">
      <div className="flex flex-col items-center pt-4">
        <div className={`radar ${searching || app.connecting ? 'on' : ''}`}>
          <img
            src={asset('device-earbuds.webp')}
            alt=""
            width={704}
            height={384}
            decoding="async"
            className="h-16 w-16 object-contain"
          />
        </div>
        <h2 className="mt-5 text-center text-xl font-semibold">Add device</h2>
        <p className="mt-2 max-w-[20rem] text-center text-sm text-mute">
          {onWindowsDesktop
            ? 'Earbuds paired with Windows are found here automatically — even while they play audio. Nothing to type.'
            : 'Turn the earbuds on and open the charging case. Then search — pick your soundcore from the list. Nothing to type.'}
        </p>
      </div>

      <button
        disabled={app.connecting || searching}
        onClick={() => void search()}
        className="mt-6 w-full rounded-full bg-blue py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
      >
        {searching || app.connecting ? 'Searching…' : onWindowsDesktop ? 'Refresh paired devices' : 'Search'}
      </button>

      {!onWindowsDesktop && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 flex w-full items-center justify-between rounded-2xl border border-line bg-wash px-3.5 py-3 text-left"
          aria-pressed={showAll}
        >
          <span>
            <span className="block text-sm font-semibold text-ink">Show All Bluetooth Devices</span>
            <span className="block text-xs text-mute">
              Turn on if your soundcore doesn&apos;t appear in the list
            </span>
          </span>
          <span className={`toggle ${showAll ? 'on' : ''}`} aria-hidden />
        </button>
      )}

      {hint && <p className="mt-3 rounded-2xl bg-sky px-3 py-2 text-center text-sm text-blue">{hint}</p>}

      {onWindowsDesktop && (
        <p className="mt-2 text-center text-xs text-mute">
          {helper === 'online'
            ? 'Windows helper: running ✓ — paired devices are listed below automatically.'
            : helper === 'offline'
              ? 'Windows helper: not responding — restart the app (it starts automatically).'
              : 'Checking for the Windows helper…'}
        </p>
      )}

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-mute">Nearby Soundcore Devices</p>
        {nearby.length === 0 ? (
          <p className="mt-2 text-xs text-mute leading-relaxed">
            {onWindowsDesktop && helper === 'online'
              ? 'Earbuds paired with Windows appear here automatically — even while playing audio. Or connect by MAC below.'
              : 'Tap Search to discover your Soundcore headphones or earbuds.'}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {nearby.map((d) => (
              <li key={d.id}>
                <button
                  disabled={app.connecting}
                  onClick={() => void pick(d)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-wash px-3.5 py-3 text-left border border-line hover:border-blue transition shadow-2xs"
                >
                  <img src={asset('device-earbuds.webp')} alt="" width={704} height={384} loading="lazy" decoding="async" className="h-10 w-10 object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink text-sm">{d.name}</span>
                    <span className="text-xs text-blue font-medium">Tap to Connect</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onWindowsDesktop && helper === 'online' && (
        <form
          className="mt-4 rounded-2xl border border-line bg-wash p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const mac = normalizeMac(macInput);
            if (!mac) {
              setHint(
                'Enter the earbud address like AA:BB:CC:DD:EE:FF (Windows Settings → Bluetooth & devices → your device → Device properties).',
              );
              return;
            }
            setHint(null);
            void app.connectBridge(mac);
          }}
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-mute" htmlFor="manual-mac">
            Connect by MAC (skip scanning)
          </label>
          <p className="mt-1 text-xs text-mute">
            Works while the earbuds are already connected to Windows — nothing needs to be in pairing mode.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="manual-mac"
              value={macInput}
              onChange={(e) => setMacInput(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
            <button
              disabled={app.connecting}
              className="rounded-full bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {app.connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      )}

      {/* Demo presets */}
      <div className="mt-6 rounded-2xl bg-wash p-3.5 border border-line">
        <p className="text-xs font-bold uppercase tracking-wider text-mute mb-2">No hardware nearby? Try a demo device:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => void app.connectSim('r50i-nc')}
            className="rounded-xl bg-white p-2.5 font-medium border border-line hover:border-blue text-left transition"
          >
            <div className="font-semibold text-ink">R50i NC</div>
            <div className="text-[11px] text-mute">Compact Earbuds</div>
          </button>
          <button
            onClick={() => void app.connectSim('liberty-4-nc')}
            className="rounded-xl bg-white p-2.5 font-medium border border-line hover:border-blue text-left transition"
          >
            <div className="font-semibold text-ink">Liberty 4 NC</div>
            <div className="text-[11px] text-mute">Active Noise Cancelling</div>
          </button>
          <button
            onClick={() => void app.connectSim('space-one')}
            className="rounded-xl bg-white p-2.5 font-medium border border-line hover:border-blue text-left transition"
          >
            <div className="font-semibold text-ink">Space One</div>
            <div className="text-[11px] text-mute">Over-Ear Headphone</div>
          </button>
          <button
            onClick={() => void app.connectSim('q30')}
            className="rounded-xl bg-white p-2.5 font-medium border border-line hover:border-blue text-left transition"
          >
            <div className="font-semibold text-ink">Life Q30</div>
            <div className="text-[11px] text-mute">Travel & Commute</div>
          </button>
        </div>
      </div>
    </div>
  );
}
