import { DEVICES } from '../protocol/devices';
import { useApp } from '../state/store';
import { asset } from '../lib/asset';

export function DeviceSelectModal({ onClose }: { onClose: () => void }) {
  const app = useApp();

  const select = (id: string) => {
    app.setProfileId(id);
    onClose();
  };

  return (
    <div className="space-y-3 px-4 py-3 pb-8">
      <p className="text-sm text-mute">
        Select your Soundcore model profile. This adapts available features (ANC levels, multi-scene modes, LDAC, gaming mode).
      </p>

      {app.profile.inferred && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <span className="font-semibold">{app.profile.name}</span> was added from the
          official app&apos;s model list. Its feature flags are inferred from the product
          family rather than confirmed on your hardware, so a control may not apply.
          The ANC frame family (TWS vs over-ear) is reliable.
        </div>
      )}

      <div className="grid gap-2.5">
        {DEVICES.map((d) => {
          const isCurrent = app.profile.id === d.id;
          const img = d.kind === 'overear' ? asset('device-overear.webp') : asset('device-earbuds.webp');
          return (
            <button
              key={d.id}
              onClick={() => select(d.id)}
              className={`flex items-center gap-3.5 rounded-2xl border p-3 text-left transition ${
                isCurrent
                  ? 'border-blue bg-sky/40 ring-2 ring-blue/20 shadow-xs'
                  : 'border-line bg-wash hover:border-slate-300'
              }`}
            >
              <img
                src={img}
                alt=""
                width={704}
                height={384}
                loading="lazy"
                decoding="async"
                className="h-12 w-12 object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{d.name}</span>
                  <span className="font-mono text-[11px] text-mute">{d.sku}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-mute">
                  {(d.ancLevels || d.scenes) && <span className="rounded bg-white px-1.5 py-0.5 border border-line">Noise Cancelling</span>}
                  {d.ldac && <span className="rounded bg-white px-1.5 py-0.5 border border-line text-blue font-medium">High-Res Audio</span>}
                  {d.gaming && <span className="rounded bg-white px-1.5 py-0.5 border border-line">Game Mode</span>}
                  {d.dual && <span className="rounded bg-white px-1.5 py-0.5 border border-line">Dual Connect</span>}
                  {d.inferred && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 border border-amber-200 text-amber-700">
                      inferred
                    </span>
                  )}
                </div>
              </div>
              {isCurrent && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue text-white">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
