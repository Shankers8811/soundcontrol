/**
 * The 22 factory Soundcore equalizer curves.
 *
 * `wire` is the captured 8-band byte block, verbatim. `bands` (dB, for the UI
 * and the curve view) is derived from it at load time, so the two can never
 * drift apart.
 *
 * Sources — three independent projects whose tables agree **byte for byte**
 * (verified in scripts/verify-protocol.mjs):
 *   • DamienStaebler/SoundcoreDesktop `SoundcoreAPI.py` (live RFCOMM frames)
 *   • JordanViknar/Noiseclapper-GNOME `src/common.ts`   (live RFCOMM frames)
 *   • mervin008/soundcorebridge `docs/eq-capture.md`    (Android HCI snoop)
 * The 02:83 captures in victor-oliveira1/soundcore_anker_equalyzer carry the
 * same eight band bytes for every preset.
 *
 * Note on preset 0x12: every capture labels it **"Small Speaker(s)"**. It was
 * previously shipped here as "Vocal Booster", which is not a Soundcore preset.
 * Note on custom curves: the app uses preset id **0xFEFE** (`FE FE`), not
 * 0xEE — confirmed by SoundcoreDesktop's `EQGain()` and by OpenSCQ30's
 * `set_equalizer` unit test.
 */

import { byteToAdjustment } from './drc';

export interface EqPreset {
  id: string;
  name: string;
  blurb: string;
  /** Preset id as it travels on the wire (little-endian u16 in the frame). */
  index: number;
  /** Captured band bytes, 0x78 = 0 dB, 10 units per dB. */
  wire: number[];
  /** Derived from `wire`; dB, one decimal place. */
  bands: number[];
  featured?: boolean;
  swatch: string;
}

interface RawPreset {
  id: string;
  name: string;
  blurb: string;
  index: number;
  wire: string;
  featured?: boolean;
  swatch: string;
}

const RAW: RawPreset[] = [
  {
    id: 'signature',
    name: 'Soundcore Signature',
    blurb: 'Default factory curve',
    index: 0x00,
    wire: '7878787878787878',
    featured: true,
    swatch: 'linear-gradient(135deg,#6a5cff,#3d7bff)',
  },
  {
    id: 'acoustic',
    name: 'Acoustic',
    blurb: 'Warm mids, airy top',
    index: 0x01,
    wire: 'A0828C8CA0A0A08C',
    featured: true,
    swatch: 'linear-gradient(135deg,#c9a227,#f3d36b)',
  },
  {
    id: 'bass',
    name: 'Bass Booster',
    blurb: 'Sub and low-mid lift',
    index: 0x02,
    wire: 'A096827878787878',
    featured: true,
    swatch: 'linear-gradient(135deg,#e85d04,#ff9e00)',
  },
  {
    id: 'bass-cut',
    name: 'Bass Reducer',
    blurb: 'Lean low end',
    index: 0x03,
    wire: '505A6E7878787878',
    swatch: 'linear-gradient(135deg,#4a90d9,#9fd3ff)',
  },
  {
    id: 'classical',
    name: 'Classical',
    blurb: 'Hall-like presence',
    index: 0x04,
    wire: '96966464788C96A0',
    swatch: 'linear-gradient(135deg,#5c4d3c,#d7c4a3)',
  },
  {
    id: 'podcast',
    name: 'Podcast',
    blurb: 'Speech intelligibility',
    index: 0x05,
    wire: '5A8CA0A0968C7864',
    featured: true,
    swatch: 'linear-gradient(135deg,#1d6f6a,#5fd3c8)',
  },
  {
    id: 'dance',
    name: 'Dance',
    blurb: 'Club punch',
    index: 0x06,
    wire: '8C5A6E828C8C825A',
    swatch: 'linear-gradient(135deg,#c81d77,#ff7ad9)',
  },
  {
    id: 'deep',
    name: 'Deep',
    blurb: 'Sub-focused',
    index: 0x07,
    wire: '8C8296968C645046',
    swatch: 'linear-gradient(135deg,#1b3a4b,#3d7ea6)',
  },
  {
    id: 'electronic',
    name: 'Electronic',
    blurb: 'Synths and sparkle',
    index: 0x08,
    wire: '968C648C828C9696',
    swatch: 'linear-gradient(135deg,#5b2dff,#00d4ff)',
  },
  {
    id: 'flat',
    name: 'Flat',
    blurb: 'Near-linear reference',
    index: 0x09,
    wire: '64646E7878786464',
    featured: true,
    swatch: 'linear-gradient(135deg,#9aa3b2,#d5dae3)',
  },
  {
    id: 'hiphop',
    name: 'Hip-Hop',
    blurb: '808s and presence',
    index: 0x0a,
    wire: '8C966E6E8C6E8C96',
    swatch: 'linear-gradient(135deg,#111,#f4c430)',
  },
  {
    id: 'jazz',
    name: 'Jazz',
    blurb: 'Ride and upright bass',
    index: 0x0b,
    wire: '8C8C6464788C96A0',
    swatch: 'linear-gradient(135deg,#7a1f2b,#e8b298)',
  },
  {
    id: 'latin',
    name: 'Latin',
    blurb: 'Percussion forward',
    index: 0x0c,
    wire: '78786464647896AA',
    swatch: 'linear-gradient(135deg,#c2410c,#fbbf24)',
  },
  {
    id: 'lounge',
    name: 'Lounge',
    blurb: 'Soft evening curve',
    index: 0x0d,
    wire: '6E8CA09678648C82',
    swatch: 'linear-gradient(135deg,#312e81,#a78bfa)',
  },
  {
    id: 'piano',
    name: 'Piano',
    blurb: 'Hammer attack',
    index: 0x0e,
    wire: '7896968CA0AA96A0',
    swatch: 'linear-gradient(135deg,#1f2937,#e5e7eb)',
  },
  {
    id: 'pop',
    name: 'Pop',
    blurb: 'Radio smile',
    index: 0x0f,
    wire: '6E829696826E645A',
    swatch: 'linear-gradient(135deg,#db2777,#fb7185)',
  },
  {
    id: 'rnb',
    name: 'R&B',
    blurb: 'Vocal silk, sub weight',
    index: 0x10,
    wire: 'B48C64648C9696A0',
    swatch: 'linear-gradient(135deg,#4c1d95,#f472b6)',
  },
  {
    id: 'rock',
    name: 'Rock',
    blurb: 'Grit and cymbals',
    index: 0x11,
    wire: '968C6E6E82969696',
    swatch: 'linear-gradient(135deg,#7f1d1d,#f97316)',
  },
  {
    id: 'small-speakers',
    name: 'Small Speakers',
    blurb: 'Compensates tiny drivers',
    index: 0x12,
    wire: 'A0968278645A5050',
    swatch: 'linear-gradient(135deg,#0d9488,#2dd4bf)',
  },
  {
    id: 'spoken-word',
    name: 'Spoken Word',
    blurb: 'Audiobooks & lectures',
    index: 0x13,
    wire: '5A64828C8C82785A',
    swatch: 'linear-gradient(135deg,#6366f1,#818cf8)',
  },
  {
    id: 'treble',
    name: 'Treble Booster',
    blurb: 'Air and detail',
    index: 0x14,
    wire: '6464646E828C8CA0',
    featured: true,
    swatch: 'linear-gradient(135deg,#0369a1,#7dd3fc)',
  },
  {
    id: 'treble-cut',
    name: 'Treble Reducer',
    blurb: 'Tame brightness',
    index: 0x15,
    wire: '787878645A50503C',
    swatch: 'linear-gradient(135deg,#57534e,#a8a29e)',
  },
];

function wireToHex(wire: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < wire.length; i += 2) out.push(parseInt(wire.slice(i, i + 2), 16));
  return out;
}

export const EQ_PRESETS: EqPreset[] = RAW.map((p) => {
  const wire = wireToHex(p.wire);
  return {
    ...p,
    wire,
    bands: wire.map((b) => Math.round(byteToAdjustment(b)) / 10),
  };
});

export const FEATURED_PRESETS = EQ_PRESETS.filter((p) => p.featured);

/** Preset id the official app uses for a user-drawn curve. */
export const CUSTOM_EQ_PRESET_ID = 0xfefe;

export function presetById(index: number): EqPreset | undefined {
  return EQ_PRESETS.find((p) => p.index === index);
}
