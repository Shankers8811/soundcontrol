import { useEffect, useState } from 'react';
import { asset } from '../lib/asset';
import { bluetoothReady, inIframe, isPolicyError, openAppWindow } from '../lib/bluetoothEnv';
import { useApp } from '../state/store';
import { scanBridgeDevices, type NearbyDevice } from '../transports/bridge';

export function ConnectSheet() {
  const app = useApp();
  const [searching, setSearching] = useState(false);
  const [nearby, setNearby] = useState<NearbyDevice[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const framed = inIframe();

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      const found = await scanBridgeDevices();
      if (!stop && found.length) setNearby(found);
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

    if (framed || !bluetoothReady()) {
      const w = openAppWindow();
      if (!w) {
        setHint('Allow the pop-up, or use the preview menu “Open in new tab”. Then tap Search — Chrome will list your earbuds.');
        return;
      }
      setHint('Continue in the new tab. Chrome will show nearby soundcore devices — tap yours. No codes to type.');
      return;
    }

    setSearching(true);
    try {
      await app.connectBle();
    } catch (err) {
      if (isPolicyError(err)) {
        openAppWindow();
        setHint('Bluetooth is blocked in this embedded preview. Use the new tab, then tap Search.');
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
    if (d.mac) await app.connectBridge(d.mac, d.name).catch(() => {});
  };

  return (
    <div className="flex flex-1 flex-col px-5 py-4">
      <div className="flex flex-col items-center pt-4">
        <div className={`radar ${searching || app.connecting ? 'on' : ''}`}>
          <img src={asset('device-earbuds.png')} alt="" className="h-16 w-16 object-contain" />
        </div>
        <h2 className="mt-5 text-center text-xl font-semibold">Add device</h2>
        <p className="mt-2 max-w-[20rem] text-center text-sm text-mute">
          Turn the earbuds on and open the charging case. Then search — pick your soundcore from the list. Nothing to
          type.
        </p>
      </div>

      <button
        disabled={app.connecting || searching}
        onClick={() => void search()}
        className="mt-6 w-full rounded-full bg-blue py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
      >
        {searching || app.connecting ? 'Searching…' : 'Search'}
      </button>

      {hint && <p className="mt-3 rounded-2xl bg-sky px-3 py-2 text-center text-sm text-blue">{hint}</p>}

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-mute">Nearby devices</p>
        {nearby.length === 0 ? (
          <p className="mt-3 text-center text-sm text-mute">
            Tap Search. Chrome shows soundcore earbuds the same way the Android app does.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {nearby.map((d) => (
              <li key={d.id}>
                <button
                  disabled={app.connecting}
                  onClick={() => void pick(d)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-wash px-3 py-3 text-left"
                >
                  <img src={asset('device-earbuds.png')} alt="" className="h-12 w-12 object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="text-xs text-mute">Tap to connect</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        disabled={app.connecting}
        onClick={() => void app.connectSim()}
        className="mt-auto pt-8 pb-2 text-center text-sm text-mute"
      >
        No earbuds nearby? Try the demo
      </button>
    </div>
  );
}
