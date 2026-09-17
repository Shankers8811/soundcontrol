import { useEffect, useRef, useState } from 'react';

export function FindDeviceModal({ onClose }: { onClose: () => void }) {
  const [playingSide, setPlayingSide] = useState<'left' | 'right' | 'both' | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  const startTone = (pan: number) => {
    stopTone();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, ctx.currentTime);

    // Chirp pulsation effect
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 4; // 4 pulses per second
    lfoGain.gain.value = 0.14;
    lfo.connect(lfoGain);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    lfoGain.connect(gain.gain);

    // Stereo panner if supported
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      osc.connect(gain);
      gain.connect(ctx.destination);
    }

    osc.start();
    lfo.start();
    audioRef.current = { ctx, osc, gain };
  };

  const stopTone = () => {
    if (audioRef.current) {
      try {
        audioRef.current.osc.stop();
        audioRef.current.osc.disconnect();
        void audioRef.current.ctx.close();
      } catch {}
      audioRef.current = null;
    }
  };

  /**
   * Plays the locator tone through the computer.
   *
   * This deliberately does not send anything to the earbuds: there is no
   * "find my device" command in any Soundcore capture or in OpenSCQ30's
   * command table, so the frame this used to inject (`01:88`) was invented.
   * An unverified write to an unknown command is worse than no write, so the
   * modal is now an honest local alarm and says so below.
   */
  const playSide = (side: 'left' | 'right' | 'both') => {
    if (playingSide === side) {
      stopTone();
      setPlayingSide(null);
      return;
    }
    setPlayingSide(side);
    const pan = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    startTone(pan);
  };

  useEffect(() => {
    return () => {
      stopTone();
    };
  }, []);

  return (
    <div className="space-y-4 px-4 py-3">
      {/* Warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold">High Volume Warning</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Please remove the earbuds from your ears before triggering the alarm to avoid hearing discomfort or damage.
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-amber-700">
              The tone plays through this computer, not the earbuds — the Soundcore protocol has no
              confirmed acoustic-beacon command, so SoundControl does not pretend to send one.
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-mute">
        Select which earbud to locate. A loud, high-pitched pulsing tone will play to help you find them in your room.
      </p>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => void playSide('left')}
          className={`flex flex-col items-center justify-center rounded-2xl border p-5 transition ${
            playingSide === 'left' || playingSide === 'both'
              ? 'border-blue bg-blue text-white shadow-md'
              : 'border-line bg-wash text-ink hover:border-blue/50'
          }`}
        >
          <span className="text-2xl">🎧 L</span>
          <span className="mt-2 text-sm font-bold">Left Earbud</span>
          <span className="mt-1 text-xs opacity-75">
            {playingSide === 'left' || playingSide === 'both' ? 'Beeping…' : 'Tap to ring'}
          </span>
        </button>

        <button
          onClick={() => void playSide('right')}
          className={`flex flex-col items-center justify-center rounded-2xl border p-5 transition ${
            playingSide === 'right' || playingSide === 'both'
              ? 'border-blue bg-blue text-white shadow-md'
              : 'border-line bg-wash text-ink hover:border-blue/50'
          }`}
        >
          <span className="text-2xl">🎧 R</span>
          <span className="mt-2 text-sm font-bold">Right Earbud</span>
          <span className="mt-1 text-xs opacity-75">
            {playingSide === 'right' || playingSide === 'both' ? 'Beeping…' : 'Tap to ring'}
          </span>
        </button>
      </div>

      <button
        onClick={() => void playSide('both')}
        className={`w-full rounded-2xl py-3.5 text-sm font-semibold transition ${
          playingSide === 'both'
            ? 'bg-danger text-white'
            : 'bg-wash text-ink hover:bg-slate-200'
        }`}
      >
        {playingSide === 'both' ? 'Stop Ringing Both' : 'Ring Both Earbuds'}
      </button>

      {playingSide && (
        <button
          onClick={() => {
            stopTone();
            setPlayingSide(null);
            onClose();
          }}
          className="w-full rounded-full bg-slate-900 py-3 text-sm font-semibold text-white"
        >
          Found Them! Stop All Sounds
        </button>
      )}
    </div>
  );
}
