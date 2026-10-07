let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function setMuted(v: boolean) {
  muted = v;
}

export function isMuted() {
  return muted;
}

export async function beep(kind: 'ok' | 'mode' | 'warn' | 'click' = 'click') {
  if (muted) return;
  try {
    const c = ac();
    if (c.state === 'suspended') await c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    const table = {
      click: { f: 420, t: 0.04, a: 0.04 },
      ok: { f: 660, t: 0.09, a: 0.06 },
      mode: { f: 520, t: 0.12, a: 0.07 },
      warn: { f: 220, t: 0.16, a: 0.07 },
    }[kind];
    o.type = kind === 'warn' ? 'square' : 'sine';
    o.frequency.setValueAtTime(table.f, now);
    if (kind === 'ok') o.frequency.exponentialRampToValueAtTime(table.f * 1.5, now + table.t);
    g.gain.setValueAtTime(table.a, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + table.t);
    o.start(now);
    o.stop(now + table.t + 0.02);
  } catch {
    /* autoplay policy */
  }
}
