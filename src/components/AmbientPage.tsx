import type { ReactNode } from 'react';
import { useApp } from '../state/store';
import type { AncScene } from '../types';

const SCENES: { id: AncScene; title: string; copy: string }[] = [
  { id: 'transport', title: 'Transport', copy: 'Planes, trains, buses' },
  { id: 'indoor', title: 'Indoor', copy: 'Office & café chatter' },
  { id: 'outdoor', title: 'Outdoor', copy: 'Wind and traffic' },
];

export function AmbientPage() {
  const app = useApp();
  const adaptive = app.ancMode === 'adaptive';
  const manual = app.ancMode === 'anc';

  return (
    <div className="space-y-4 px-4 py-3">
      <p className="text-sm text-mute">
        Switch between noise cancellation, normal, and transparency. Extra options match the soundcore app for this
        model.
      </p>

      <Card>
        <ToggleRow
          title="Adaptive Noise Cancelling"
          sub="Level adjusts to your surroundings"
          on={adaptive}
          onClick={() => void app.setAnc('adaptive')}
        />
        <div className="my-3 h-px bg-line" />
        <ToggleRow
          title="Manual Mode"
          sub={manual ? `Level ${app.ancLevel}` : 'Set the depth yourself'}
          on={manual}
          onClick={() => void app.setAnc('anc', app.ancLevel)}
        />
        {app.profile.ancLevels && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-mute">
              <span>Minimum</span>
              <span>Maximum</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={app.ancLevel}
              disabled={!app.connected}
              onChange={(e) => void app.setAnc('anc', Number(e.target.value))}
              className="mt-2 w-full accent-blue"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-mute">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n === app.ancLevel && manual ? 'text-blue' : ''}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {app.profile.scenes && (
        <Card>
          <p className="font-medium">ANC scenes</p>
          <p className="mt-1 text-xs text-mute">Life Q30 / Q35 / Space Q45</p>
          <div className="mt-3 space-y-2">
            {SCENES.map((s) => (
              <button
                key={s.id}
                onClick={() => void app.setAnc('anc', app.ancLevel, s.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left ${
                  manual && app.ancScene === s.id ? 'bg-sky text-blue' : 'bg-white'
                }`}
              >
                <span>
                  <span className="block font-medium text-ink">{s.title}</span>
                  <span className="text-xs text-mute">{s.copy}</span>
                </span>
                {manual && app.ancScene === s.id && <span className="text-blue">✓</span>}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="font-medium">Transparency</p>
        <ToggleRow
          title="Talk Mode"
          sub="Voices stand out from other ambient sound"
          on={app.transVocal}
          onClick={() => void app.setTransVocal(!app.transVocal)}
        />
        <div className="my-3 h-px bg-line" />
        <button
          onClick={() => void app.setAnc('transparency')}
          className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
            app.ancMode === 'transparency' && !app.transVocal ? 'bg-sky' : ''
          }`}
        >
          Fully Transparent
        </button>
      </Card>

      <Card>
        <ToggleRow
          title="Wind noise reduction"
          sub="Cuts mic rumble outdoors"
          on={app.windNoise}
          onClick={() => void app.setWindNoise(!app.windNoise)}
        />
      </Card>

      <button
        onClick={() => void app.setAnc('normal')}
        className="w-full rounded-2xl bg-wash py-3 font-medium"
      >
        Turn ANC off (Normal)
      </button>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl bg-wash p-4">{children}</section>;
}

function ToggleRow({
  title,
  sub,
  on,
  onClick,
}: {
  title: string;
  sub: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-mute">{sub}</p>
      </div>
      <span className={`toggle ${on ? 'on' : ''}`} />
    </button>
  );
}
