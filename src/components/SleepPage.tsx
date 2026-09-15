import { useEffect, useState } from 'react';
import { setSoundVolume, stopAllSleepSounds } from '../lib/sleepAudio';

interface SoundDef {
  id: 'rain' | 'waves' | 'wind' | 'fire' | 'birds' | 'stream' | 'white' | 'clock';
  name: string;
  icon: string;
  desc: string;
}

const SOUNDS: SoundDef[] = [
  { id: 'rain', name: 'Rain', icon: '🌧️', desc: 'Drizzle & gentle raindrops' },
  { id: 'waves', name: 'Ocean Waves', icon: '🌊', desc: 'Rhythmic tidal surge' },
  { id: 'wind', name: 'Breeze', icon: '💨', desc: 'Whispering night wind' },
  { id: 'fire', name: 'Campfire', icon: '🔥', desc: 'Crackling hearth & logs' },
  { id: 'birds', name: 'Birds', icon: '🐦', desc: 'Morning forest songbirds' },
  { id: 'stream', name: 'Stream', icon: '💧', desc: 'Clear mountain brook' },
  { id: 'white', name: 'White Noise', icon: '📻', desc: 'Steady broadband hush' },
  { id: 'clock', name: 'Clock', icon: '🕰️', desc: 'Soothing pendulum tick' },
];

const PRESETS: Array<{ name: string; values: Record<string, number> }> = [
  { name: 'Rainy Night', values: { rain: 0.7, wind: 0.3 } },
  { name: 'Ocean Retreat', values: { waves: 0.8, wind: 0.25 } },
  { name: 'Forest Camp', values: { fire: 0.6, stream: 0.4, birds: 0.3 } },
  { name: 'Deep Sleep', values: { white: 0.6, rain: 0.4 } },
];

export function SleepPage() {
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Timer countdown
  useEffect(() => {
    if (timerMinutes > 0 && isPlaying) {
      setTimeLeft(timerMinutes * 60);
    } else {
      setTimeLeft(0);
    }
  }, [timerMinutes, isPlaying]);

  useEffect(() => {
    if (!isPlaying || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopAll();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, timeLeft]);

  const updateVol = (id: SoundDef['id'], val: number) => {
    const next = { ...volumes, [id]: val };
    setVolumes(next);
    if (val > 0) {
      setIsPlaying(true);
      setSoundVolume(id, val);
    } else {
      setSoundVolume(id, 0);
      const anyActive = Object.values(next).some((v) => v > 0);
      if (!anyActive) setIsPlaying(false);
    }
  };

  const applyPreset = (presetValues: Record<string, number>) => {
    stopAllSleepSounds();
    const next: Record<string, number> = {};
    for (const [id, vol] of Object.entries(presetValues)) {
      next[id] = vol;
      setSoundVolume(id as SoundDef['id'], vol);
    }
    setVolumes(next);
    setIsPlaying(true);
  };

  const stopAll = () => {
    stopAllSleepSounds();
    setVolumes({});
    setIsPlaying(false);
    setTimeLeft(0);
  };

  const toggleMaster = () => {
    if (isPlaying) {
      stopAllSleepSounds();
      setIsPlaying(false);
    } else {
      const anyHasVol = Object.values(volumes).some((v) => v > 0);
      if (anyHasVol) {
        for (const [id, vol] of Object.entries(volumes)) {
          if (vol > 0) setSoundVolume(id as SoundDef['id'], vol);
        }
        setIsPlaying(true);
      } else {
        applyPreset(PRESETS[0].values);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-4 px-4 py-3 pb-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b254b] to-[#0b1024] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-block rounded-full bg-blue/30 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-blue uppercase">
              Superior Sleep
            </span>
            <h2 className="mt-1 text-2xl font-bold">Sleep Sounds</h2>
            <p className="mt-0.5 text-xs text-slate-300">Mix relaxing nature ambiences for rest and focus</p>
          </div>
          <button
            onClick={toggleMaster}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md transition-all ${
              isPlaying ? 'bg-blue text-white ring-4 ring-blue/30' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Timer Bar */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span>Timer:</span>
            {[0, 15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => setTimerMinutes(m)}
                className={`rounded-lg px-2 py-0.5 font-medium transition ${
                  timerMinutes === m ? 'bg-blue text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {m === 0 ? 'Off' : `${m}m`}
              </button>
            ))}
          </div>
          {timeLeft > 0 && <span className="font-mono text-blue">{formatTime(timeLeft)} left</span>}
        </div>
      </div>

      {/* Preset Quick-Buttons */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Curated Mixes</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.values)}
              className="rounded-2xl border border-line bg-wash p-2.5 text-left text-sm font-medium transition hover:border-blue hover:bg-sky/50"
            >
              <div className="font-semibold text-ink">{p.name}</div>
              <div className="text-[11px] text-mute">{Object.keys(p.values).join(' + ')}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sound Sliders */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-mute">Sound Elements</p>
          {isPlaying && (
            <button onClick={stopAll} className="text-xs font-medium text-danger hover:underline">
              Reset All
            </button>
          )}
        </div>
        <div className="grid gap-2.5">
          {SOUNDS.map((s) => {
            const vol = volumes[s.id] || 0;
            const active = vol > 0 && isPlaying;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                  active ? 'border-blue/40 bg-sky/30 shadow-xs' : 'border-transparent bg-wash'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-xs">
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-ink">{s.name}</span>
                    <span className="font-mono text-mute">{Math.round(vol * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={vol}
                    onChange={(e) => updateVol(s.id, Number(e.target.value))}
                    className="mt-1.5 h-1.5 w-full accent-blue cursor-pointer"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
