import { useRef, useState } from 'react';
import { EQ_HZ } from '../types';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';

async function tone(hz: number, ms = 700) {
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = hz;
  g.gain.value = 0.05;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  o.stop(ctx.currentTime + ms / 1000 + 0.02);
  await new Promise((r) => setTimeout(r, ms + 40));
  await ctx.close();
}

export function HearIdPage() {
  const app = useApp();
  const [step, setStep] = useState(0);
  const heard = useRef<boolean[]>(Array(EQ_HZ.length).fill(true));
  const [running, setRunning] = useState(false);

  const play = async () => {
    setRunning(true);
    try {
      await tone(EQ_HZ[step], 650);
    } finally {
      setRunning(false);
    }
  };

  const answer = async (yes: boolean) => {
    heard.current[step] = yes;
    if (step < EQ_HZ.length - 1) {
      setStep(step + 1);
      return;
    }
    const bands = heard.current.map((ok) => (ok ? 0 : 3));
    app.setHearId(true);
    if (app.connected) await app.applyBands(bands);
    else bands.forEach((v, i) => app.setBand(i, v));
    app.back();
  };

  const reset = () => {
    const sig = EQ_PRESETS.find((p) => p.id === 'signature');
    app.setHearId(false);
    if (sig) void app.applyPreset(sig);
  };

  return (
    <div className="px-4 py-3">
      <p className="text-sm text-mute">
        HearID plays a short tone at each EQ band. Tap Heard if you catch it. Missed bands get a gentle boost — a
        local hearing profile, not Anka.
      </p>

      {app.hearId && (
        <button onClick={reset} className="mt-3 w-full rounded-2xl bg-wash py-3 text-sm font-medium">
          Clear HearID and restore Signature
        </button>
      )}

      <div className="mt-8 text-center">
        <p className="text-xs text-mute">
          Band {step + 1} / {EQ_HZ.length}
        </p>
        <p className="mt-2 text-4xl font-semibold">{EQ_HZ[step] >= 1000 ? `${EQ_HZ[step] / 1000} kHz` : `${EQ_HZ[step]} Hz`}</p>
        <button
          onClick={() => void play()}
          disabled={running}
          className="mt-6 rounded-full bg-blue px-8 py-3 font-semibold text-white disabled:opacity-40"
        >
          {running ? 'Playing…' : 'Play tone'}
        </button>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => void answer(true)} className="rounded-2xl bg-sky py-3 font-medium text-blue">
            Heard
          </button>
          <button onClick={() => void answer(false)} className="rounded-2xl bg-wash py-3 font-medium">
            Not heard
          </button>
        </div>
      </div>
    </div>
  );
}
