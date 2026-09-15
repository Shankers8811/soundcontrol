/**
 * Procedural ambient audio synthesizer for Soundcore Superior Sleep mode.
 * Zero external MP3 downloads — synthesizes soothing nature soundscapes
 * directly with the Web Audio API.
 */

type SoundId = 'rain' | 'waves' | 'wind' | 'fire' | 'birds' | 'stream' | 'white' | 'clock';

interface Channel {
  gain: GainNode;
  cleanup?: () => void;
}

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const channels: Partial<Record<SoundId, Channel>> = {};

function getContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

function createNoiseBuffer(c: AudioContext, seconds = 4): AudioBuffer {
  const size = c.sampleRate * seconds;
  const buffer = c.createBuffer(1, size, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createNoiseSource(c: AudioContext, loop = true): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = createNoiseBuffer(c);
  src.loop = loop;
  src.start();
  return src;
}

// 1. Rain: filtered pink-like noise with randomized droplets
function startRain(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  const highpass = c.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 350;

  noise.connect(filter);
  filter.connect(highpass);
  highpass.connect(dest);

  return () => {
    try {
      noise.stop();
      noise.disconnect();
    } catch {}
  };
}

// 2. Waves: modulated low-pass noise with slow periodic surge
function startWaves(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 450;
  filter.Q.value = 1.0;

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.12; // slow wave period ~8 seconds
  lfoGain.gain.value = 350;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  noise.connect(filter);
  filter.connect(dest);

  return () => {
    try {
      noise.stop();
      lfo.stop();
      noise.disconnect();
      lfo.disconnect();
    } catch {}
  };
}

// 3. Wind: whistling resonant low-pass filter
function startWind(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 280;
  filter.Q.value = 2.5;

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.18;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  noise.connect(filter);
  filter.connect(dest);

  return () => {
    try {
      noise.stop();
      lfo.stop();
      noise.disconnect();
      lfo.disconnect();
    } catch {}
  };
}

// 4. Campfire: crackling micro-impulses & warm rumble
function startFire(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const low = c.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 400;
  noise.connect(low);
  low.connect(dest);

  let active = true;
  const crackle = () => {
    if (!active || c.state === 'closed') return;
    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 800 + Math.random() * 2200;
      g.gain.value = 0.12 + Math.random() * 0.18;
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.04);
      osc.connect(g);
      g.connect(dest);
      osc.start();
      osc.stop(c.currentTime + 0.05);
    } catch {}
    const nextIn = 80 + Math.random() * 320;
    setTimeout(crackle, nextIn);
  };
  crackle();

  return () => {
    active = false;
    try {
      noise.stop();
      noise.disconnect();
    } catch {}
  };
}

// 5. Birds: delicate chirp synthesizers
function startBirds(c: AudioContext, dest: GainNode) {
  let active = true;
  const chirp = () => {
    if (!active || c.state === 'closed') return;
    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      const baseFreq = 2200 + Math.random() * 1400;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.linearRampToValueAtTime(baseFreq + 800, now + 0.08);
      osc.frequency.linearRampToValueAtTime(baseFreq + 200, now + 0.16);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch {}
    const delay = 1200 + Math.random() * 3000;
    setTimeout(chirp, delay);
  };
  chirp();

  return () => {
    active = false;
  };
}

// 6. Stream: bright churning water
function startStream(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const bpf = c.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.value = 950;
  bpf.Q.value = 0.8;

  noise.connect(bpf);
  bpf.connect(dest);

  return () => {
    try {
      noise.stop();
      noise.disconnect();
    } catch {}
  };
}

// 7. White noise: soothing flat hiss
function startWhite(c: AudioContext, dest: GainNode) {
  const noise = createNoiseSource(c);
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 4000;
  noise.connect(lpf);
  lpf.connect(dest);

  return () => {
    try {
      noise.stop();
      noise.disconnect();
    } catch {}
  };
}

// 8. Clock: rhythmic tick-tock
function startClock(c: AudioContext, dest: GainNode) {
  let active = true;
  let tick = true;
  const beat = () => {
    if (!active || c.state === 'closed') return;
    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = tick ? 1400 : 1000;
      tick = !tick;

      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch {}
    setTimeout(beat, 1000);
  };
  beat();

  return () => {
    active = false;
  };
}

const STARTERS: Record<SoundId, (c: AudioContext, dest: GainNode) => () => void> = {
  rain: startRain,
  waves: startWaves,
  wind: startWind,
  fire: startFire,
  birds: startBirds,
  stream: startStream,
  white: startWhite,
  clock: startClock,
};

export function setSoundVolume(id: SoundId, volume: number) {
  const c = getContext();
  const clamped = Math.max(0, Math.min(1, volume));

  if (clamped === 0) {
    if (channels[id]) {
      channels[id]?.cleanup?.();
      channels[id]?.gain.disconnect();
      delete channels[id];
    }
    return;
  }

  if (!channels[id]) {
    const gainNode = c.createGain();
    gainNode.gain.value = clamped;
    gainNode.connect(masterGain!);
    const starter = STARTERS[id];
    const cleanup = starter ? starter(c, gainNode) : undefined;
    channels[id] = { gain: gainNode, cleanup };
  } else {
    channels[id]!.gain.gain.setValueAtTime(clamped, c.currentTime);
  }
}

export function stopAllSleepSounds() {
  for (const id of Object.keys(channels) as SoundId[]) {
    channels[id]?.cleanup?.();
    channels[id]?.gain.disconnect();
    delete channels[id];
  }
}
