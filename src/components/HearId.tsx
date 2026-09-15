import { useState } from 'react';
import { EQ_HZ } from '../types';
import { useApp } from '../state/store';
import { EQ_PRESETS } from '../protocol/presets';

async function playHearTone(hz: number, ear: 'left' | 'right', gainVal = 0.04, ms = 750) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz, ctx.currentTime);

  // Subtle pulsing envelope
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(gainVal, ctx.currentTime + ms / 1000 - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);

  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = ear === 'left' ? -0.85 : 0.85;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
  } else {
    osc.connect(gain);
    gain.connect(ctx.destination);
  }

  osc.start();
  osc.stop(ctx.currentTime + ms / 1000 + 0.05);

  await new Promise((r) => setTimeout(r, ms + 80));
  await ctx.close().catch(() => {});
}

export function HearIdPage() {
  const app = useApp();
  const [stage, setStage] = useState<'intro' | 'test-left' | 'test-right' | 'result'>('intro');
  const [bandIdx, setBandIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [leftResponses, setLeftResponses] = useState<boolean[]>(Array(EQ_HZ.length).fill(true));
  const [rightResponses, setRightResponses] = useState<boolean[]>(Array(EQ_HZ.length).fill(true));

  const currentEar = stage === 'test-left' ? 'left' : 'right';
  const currentHz = EQ_HZ[bandIdx];

  const playCurrent = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await playHearTone(currentHz, currentEar);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleAnswer = async (heard: boolean) => {
    if (stage === 'test-left') {
      const next = [...leftResponses];
      next[bandIdx] = heard;
      setLeftResponses(next);
      if (bandIdx < EQ_HZ.length - 1) {
        setBandIdx(bandIdx + 1);
      } else {
        setStage('test-right');
        setBandIdx(0);
      }
    } else if (stage === 'test-right') {
      const next = [...rightResponses];
      next[bandIdx] = heard;
      setRightResponses(next);
      if (bandIdx < EQ_HZ.length - 1) {
        setBandIdx(bandIdx + 1);
      } else {
        // Calculate compensation curve
        const combinedBands = EQ_HZ.map((_, i) => {
          const l = leftResponses[i];
          const r = next[i];
          if (!l && !r) return 4.0; // severe loss at this band, boost +4dB
          if (!l || !r) return 2.5; // one ear didn't hear, boost +2.5dB
          return 0; // heard clearly in both
        });
        app.setHearId(true);
        if (app.connected) {
          await app.applyBands(combinedBands);
        } else {
          combinedBands.forEach((v, i) => app.setBand(i, v));
        }
        setStage('result');
      }
    }
  };

  const resetHearId = () => {
    const sig = EQ_PRESETS.find((p) => p.id === 'signature');
    app.setHearId(false);
    if (sig) void app.applyPreset(sig);
    setStage('intro');
  };

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      {stage === 'intro' && (
        <div className="flex flex-col items-center pt-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue/10 text-3xl text-blue">
            👂
          </div>
          <h2 className="mt-4 text-2xl font-bold">HearID Sound</h2>
          <p className="mt-2 text-sm text-mute max-w-sm">
            HearID maps your personal hearing sensitivity across multiple frequencies for both your left and right ear,
            then generates a tailored EQ curve for optimal clarity.
          </p>

          <div className="mt-6 w-full space-y-2 rounded-2xl bg-wash p-4 text-left text-xs text-mute">
            <div className="flex items-center gap-2 font-medium text-ink">
              <span>🔇</span> Quiet environment recommended
            </div>
            <p>Ensure both earbuds are firmly seated in your ears with proper seal before beginning.</p>
          </div>

          {app.hearId && (
            <div className="mt-4 w-full rounded-2xl bg-sky/60 p-3 text-xs text-blue font-medium">
              ✓ Active HearID Profile is applied to your device.
            </div>
          )}

          <div className="mt-8 flex w-full flex-col gap-2.5">
            <button
              onClick={() => {
                setStage('test-left');
                setBandIdx(0);
              }}
              className="w-full rounded-full bg-blue py-3.5 font-semibold text-white shadow-md transition hover:bg-blue-2"
            >
              {app.hearId ? 'Retest HearID' : 'Start Test'}
            </button>
            {app.hearId && (
              <button
                onClick={resetHearId}
                className="w-full rounded-full border border-line bg-white py-3 text-sm font-medium text-mute hover:text-ink"
              >
                Reset to Default Signature
              </button>
            )}
          </div>
        </div>
      )}

      {(stage === 'test-left' || stage === 'test-right') && (
        <div className="flex flex-col items-center pt-2 text-center">
          <div className="flex items-center gap-2 rounded-full bg-sky px-4 py-1 text-xs font-semibold text-blue">
            <span>Testing {currentEar.toUpperCase()} Ear</span>
          </div>

          <div className="mt-4 font-mono text-xs text-mute">
            Step {bandIdx + 1} of {EQ_HZ.length}
          </div>

          <div className="mt-3 text-5xl font-extrabold text-ink">
            {currentHz >= 1000 ? `${currentHz / 1000} kHz` : `${currentHz} Hz`}
          </div>

          <p className="mt-2 text-xs text-mute">
            Tap “Play Tone” to listen in your {currentEar} ear, then tell us if you can hear it.
          </p>

          <button
            onClick={() => void playCurrent()}
            disabled={isPlaying}
            className="mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-blue text-white shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {isPlaying ? (
              <span className="animate-pulse text-xs font-semibold">Playing…</span>
            ) : (
              <span className="text-sm font-bold">Play Tone</span>
            )}
          </button>

          <div className="mt-8 grid w-full grid-cols-2 gap-3">
            <button
              onClick={() => void handleAnswer(true)}
              className="rounded-2xl bg-sky py-4 text-base font-bold text-blue shadow-xs transition hover:bg-blue hover:text-white"
            >
              ✓ I can hear it
            </button>
            <button
              onClick={() => void handleAnswer(false)}
              className="rounded-2xl bg-wash py-4 text-base font-bold text-ink shadow-xs transition hover:bg-slate-200"
            >
              ✕ Cannot hear
            </button>
          </div>
        </div>
      )}

      {stage === 'result' && (
        <div className="flex flex-col items-center pt-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
            ✓
          </div>
          <h2 className="mt-3 text-2xl font-bold">HearID Profile Created!</h2>
          <p className="mt-1 text-xs text-mute">
            Your personalized hearing compensation profile has been generated and sent to your Soundcore device.
          </p>

          {/* Visual Audiogram Preview */}
          <div className="mt-6 w-full rounded-2xl bg-wash p-4">
            <p className="mb-2 text-left text-xs font-semibold uppercase tracking-wider text-mute">
              Calculated Compensation Curve
            </p>
            <div className="flex items-end justify-between gap-1 pt-6 pb-2">
              {app.bands.map((val, i) => (
                <div key={EQ_HZ[i]} className="flex flex-col items-center gap-1">
                  <div
                    className="w-5 rounded-t-md bg-blue transition-all"
                    style={{ height: `${Math.max(8, (val + 6) * 6)}px` }}
                  />
                  <span className="font-mono text-[9px] text-mute">
                    {EQ_HZ[i] >= 1000 ? `${EQ_HZ[i] / 1000}k` : EQ_HZ[i]}
                  </span>
                  <span className="font-mono text-[9px] font-semibold text-blue">
                    {val > 0 ? `+${val}` : val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex w-full flex-col gap-2">
            <button
              onClick={() => app.back()}
              className="w-full rounded-full bg-blue py-3.5 font-semibold text-white shadow-md hover:bg-blue-2"
            >
              Done & Return Home
            </button>
            <button
              onClick={() => {
                setStage('test-left');
                setBandIdx(0);
              }}
              className="w-full rounded-full border border-line bg-white py-3 text-sm font-medium text-mute"
            >
              Retest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
