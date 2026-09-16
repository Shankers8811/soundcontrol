import { useEffect, useState } from 'react';
import { asset } from '../lib/asset';
import { useApp } from '../state/store';
import { bridgeHealth, scanBridgeDevices, type NearbyDevice } from '../transports/bridge';

function soundcoreFirst(a: NearbyDevice, b: NearbyDevice): number {
  const score = (d: NearbyDevice) =>
    /soundcore|anker|liberty|r50i|p30i|p20i|space|q30|q35|q45|a39|a30/i.test(d.name) ? 0 : 1;
  return score(a) - score(b) || a.name.localeCompare(b.name);
}

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
  const [helper, setHelper] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [macInput, setMacInput] = useState('');

  const refresh = async (showEmptyHint = false) => {
    setSearching(true);
    setHint(null);
    try {
      // Check the fast /health endpoint first; only enumerate PnP devices
      // when the helper is actually up. Manual refresh bypasses the cache.
      const health = await bridgeHealth();
      if (!health) {
        setHelper('offline');
        setHint(
          'The Windows Bluetooth helper is not responding. Restart SoundControl — it starts automatically, no separate install is needed. If it persists, check %AppData%\\soundcontrol\\main.log.',
        );
        return;
      }
      setHelper('online');
      const found = await scanBridgeDevices(true);
      setNearby([...found].sort(soundcoreFirst));
      if (showEmptyHint && !found.length) {
        setHint(
          'No paired devices found. Pair the earbuds once in Windows Settings → Bluetooth & devices, then refresh this list.',
        );
      }
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const pull = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const health = await bridgeHealth();
        if (stopped) return;
        setHelper(health ? 'online' : 'offline');
        if (!health) return;
        // Background polls use the helper cache; the manual button forces fresh.
        const found = await scanBridgeDevices(false);
        if (stopped) return;
        setNearby((prev) => {
          const next = [...found].sort(soundcoreFirst);
          if (next.length === prev.length && next.every((d, i) => d.id === prev[i]?.id)) return prev;
          return next;
        });
      } catch {
        if (!stopped) setHelper('offline');
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
  }, []);

  const pick = async (device: NearbyDevice) => {
    if (device.mac) await app.connectBridge(device.mac, device.name, device.battery).catch(() => {});
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
        <h2 className="mt-5 text-center text-xl font-semibold">Add Windows device</h2>
        <p className="mt-2 max-w-[20rem] text-center text-sm text-mute">
          SoundControl uses the bundled Windows Bluetooth helper. Paired earbuds appear here even while they are
          already connected or playing audio.
        </p>
      </div>

      <button
        disabled={app.connecting || searching}
        onClick={() => void refresh(true)}
        className="mt-6 w-full rounded-full bg-blue py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
      >
        {searching || app.connecting ? 'Refreshing…' : 'Refresh paired devices'}
      </button>

      {hint && <p className="mt-3 rounded-2xl bg-sky px-3 py-2 text-center text-sm text-blue">{hint}</p>}

      <p className="mt-2 text-center text-xs text-mute">
        {helper === 'online'
          ? 'Windows helper: running ✓'
          : helper === 'offline'
            ? 'Windows helper: not responding'
            : 'Checking for the Windows helper…'}
      </p>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-mute">Paired Soundcore devices</p>
        {nearby.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-mute">
            Pair the earbuds in Windows Settings first, then use Refresh paired devices.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {nearby.map((device) => (
              <li key={device.id}>
                <button
                  disabled={app.connecting}
                  onClick={() => void pick(device)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-wash px-3.5 py-3 text-left shadow-2xs transition hover:border-blue"
                >
                  <img
                    src={asset('device-earbuds.webp')}
                    alt=""
                    width={704}
                    height={384}
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 object-contain"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{device.name}</span>
                    <span className="font-medium text-xs text-blue">
                      Tap to connect
                      {typeof device.battery === 'number' ? ` · ${device.battery}% (Windows)` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {helper === 'online' && (
        <form
          className="mt-4 rounded-2xl border border-line bg-wash p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            const mac = normalizeMac(macInput);
            if (!mac) {
              setHint('Enter the Bluetooth address like AA:BB:CC:DD:EE:FF from Windows device properties.');
              return;
            }
            setHint(null);
            void app.connectBridge(mac);
          }}
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-mute" htmlFor="manual-mac">
            Connect by MAC
          </label>
          <p className="mt-1 text-xs text-mute">Use this if Windows paired the device but its name is missing.</p>
          <div className="mt-2 flex gap-2">
            <input
              id="manual-mac"
              value={macInput}
              onChange={(event) => setMacInput(event.target.value)}
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

      <div className="mt-6 rounded-2xl border border-line bg-wash p-3.5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-mute">No hardware nearby?</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['r50i-nc', 'R50i NC', 'Compact earbuds'],
            ['liberty-4-nc', 'Liberty 4 NC', 'Active noise cancelling'],
            ['space-one', 'Space One', 'Over-ear headphones'],
            ['q30', 'Life Q30', 'Travel headphones'],
          ].map(([id, name, description]) => (
            <button
              key={id}
              onClick={() => void app.connectSim(id)}
              className="rounded-xl border border-line bg-white p-2.5 text-left font-medium transition hover:border-blue"
            >
              <div className="font-semibold text-ink">{name}</div>
              <div className="text-[11px] text-mute">{description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
