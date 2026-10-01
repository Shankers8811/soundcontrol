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

import { adjustmentToByte, byteToAdjustment } from './drc';
import type { DeviceProfile } from '../types';

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

/* ------------------------------------------------------------------ */
/* Per-model preset tables (PART 11 of the capability audit)           */
/* ------------------------------------------------------------------ */

/**
 * The equalizer *command* is shared by several models, but the set of
 * factory presets — and in one case the curve behind a shared id — is a
 * property of the model's own firmware description, not of the command.
 * Sending an id the model does not define, or a different curve under an id
 * it does define, would be exactly the "one generic implementation for
 * different protocol families" mistake.
 *
 * Sources (OpenSCQ30 master, per-device equalizer modules):
 * - `common_settings()`    → `STANDARD` (22 presets, Rock tail +3/+3 dB)
 * - `common_settings_type_2()` → same 22 ids, Rock re-tuned to +4/+5 dB
 *   (A3948/A3949/A3959/A3388/D1202 use this table)
 * - A3876 (V20i)  → its own 22-entry list (id 1 is "Balanced", id 5 is
 *   "Spoken Word" and id 19 "Podcast" — the reverse of the standard table —
 *   and id 20 has different bands; id 30 is "Volume Booster")
 * - D1101 (C50i)  → six presets: 0, 2, 4, 5, 20, 30
 * - A3330 (C30i)  → one preset: 0 (Soundcore Signature)
 * Every other profile keeps the standard 22-preset table.
 */

/** Build a preset from dB values, so `bands` and the wire bytes can't drift. */
function presetFrom(
  id: string,
  name: string,
  index: number,
  bands: number[],
  extra: Partial<Pick<EqPreset, 'blurb' | 'featured' | 'swatch'>> = {},
): EqPreset {
  const padded = [...bands, 0, -12];
  const wire = padded.map((db) => adjustmentToByte(Math.round(db * 10)));
  return {
    id,
    name,
    blurb: extra.blurb ?? 'Factory curve',
    index,
    wire,
    bands: wire.slice(0, 8).map((b) => Math.round(byteToAdjustment(b)) / 10),
    featured: extra.featured,
    swatch: extra.swatch ?? 'linear-gradient(135deg,#334155,#94a3b8)',
  };
}

/** Rock as the `common_settings_type_2` family defines it (+4/+5 dB tail). */
const TYPE2_ROCK_BANDS = [3, 2, -1, -1, 1, 3, 4, 5];

/** `common_settings_type_2`: the standard ids with the re-tuned Rock curve. */
export const TYPE2_PRESETS: EqPreset[] = EQ_PRESETS.map((preset) =>
  preset.index === 0x11
    ? presetFrom('rock', 'Rock', 0x11, TYPE2_ROCK_BANDS, {
        blurb: preset.blurb,
        featured: preset.featured,
        swatch: preset.swatch,
      })
    : preset,
);

/** A3876 / V20i — its own factory list, names and curves (OpenSCQ30 a3876.rs). */
export const V20I_PRESETS: EqPreset[] = [
  presetFrom('v20i-signature', 'Soundcore Signature', 0x00, [0, 0, 0, 0, 0, 0, 0, 0], { featured: true, swatch: 'linear-gradient(135deg,#6a5cff,#3d7bff)' }),
  presetFrom('v20i-balanced', 'Balanced', 0x01, [5.3, -2.1, -0.9, -1.6, 1.2, -3.9, -3.2, 0.2]),
  presetFrom('v20i-bass-booster', 'Bass Booster', 0x02, [4, 3, 1, 0, 0, 0, 0, 0], { featured: true, swatch: 'linear-gradient(135deg,#7c2d12,#f97316)' }),
  presetFrom('v20i-classical', 'Classical', 0x04, [3, 3, -2, -2, 0, 2, 3, 4]),
  presetFrom('v20i-spoken-word', 'Spoken Word', 0x05, [-3, 2, 4, 4, 3, 2, 0, -2]),
  presetFrom('v20i-dance', 'Dance', 0x06, [2, -3, -1, 1, 2, 2, 1, -3]),
  presetFrom('v20i-deep', 'Deep', 0x07, [2, 1, 3, 3, 2, -2, -4, -5]),
  presetFrom('v20i-electronic', 'Electronic', 0x08, [3, 2, -2, 2, 1, 2, 3, 3]),
  presetFrom('v20i-flat', 'Flat', 0x09, [-2, -2, -1, 0, 0, 0, -2, -2]),
  presetFrom('v20i-hip-hop', 'Hip-Hop', 0x0a, [2, 3, -1, -1, 2, -1, 2, 3]),
  presetFrom('v20i-jazz', 'Jazz', 0x0b, [2, 2, -2, -2, 0, 2, 3, 4]),
  presetFrom('v20i-latin', 'Latin', 0x0c, [0, 0, -2, -2, -2, 0, 3, 5]),
  presetFrom('v20i-lounge', 'Lounge', 0x0d, [-1, 2, 4, 3, 0, -2, 2, 1]),
  presetFrom('v20i-piano', 'Piano', 0x0e, [0, 3, 3, 2, 4, 5, 3, 4]),
  presetFrom('v20i-pop', 'Pop', 0x0f, [-1, 1, 3, 3, 1, -1, -2, -3]),
  presetFrom('v20i-rnb', 'R&B', 0x10, [6, 2, -2, -2, 2, 3, 3, 4]),
  presetFrom('v20i-rock', 'Rock', 0x11, [3, 2, -1, -1, 1, 3, 4, 5], { featured: true, swatch: 'linear-gradient(135deg,#7f1d1d,#ef4444)' }),
  presetFrom('v20i-small-speakers', 'Small Speakers', 0x12, [4, 3, 1, 0, -2, -3, -4, -4]),
  presetFrom('v20i-podcast', 'Podcast', 0x13, [-3, -2, 1, 2, 2, 1, 0, -3]),
  presetFrom('v20i-treble-booster', 'Treble Booster', 0x14, [0, 0, -2, 0, -1, -5, 5, 1]),
  presetFrom('v20i-treble-reducer', 'Treble Reducer', 0x15, [0, 0, 0, -2, -3, -4, -4, -6]),
  presetFrom('v20i-volume-booster', 'Volume Booster', 0x1e, [2, 3, 4, 5, 6, 6, 5, 4]),
];

/** D1101 / C50i — six documented presets. */
export const C50I_PRESETS: EqPreset[] = [0x00, 0x02, 0x04, 0x05, 0x14, 0x1e]
  .map((index) => EQ_PRESETS.find((p) => p.index === index))
  .filter((p): p is EqPreset => Boolean(p))
  .concat([presetFrom('c50i-volume-booster', 'Volume Booster', 0x1e, [2, 3, 4, 5, 6, 6, 5, 4])]);

/** A3330 / C30i — one documented factory preset. */
export const C30I_PRESETS: EqPreset[] = [
  presetFrom('c30i-signature', 'Soundcore Signature', 0x00, [0, 0, 0, 0, 0, 0, 0, 0], { featured: true, swatch: 'linear-gradient(135deg,#6a5cff,#3d7bff)' }),
];

/** The factory presets this exact model's firmware defines. */
export function presetsForProfile(profile: { presetSet?: DeviceProfile['presetSet'] }): EqPreset[] {
  switch (profile.presetSet) {
    case 'type2':
      return TYPE2_PRESETS;
    case 'v20i':
      return V20I_PRESETS;
    case 'c50i':
      return C50I_PRESETS;
    case 'c30i':
      return C30I_PRESETS;
    default:
      return EQ_PRESETS;
  }
}

/** Wire preset ids this model's firmware defines (custom 0xFEFE excluded). */
export function presetIdsForProfile(profile: { presetSet?: DeviceProfile['presetSet'] }): number[] {
  return presetsForProfile(profile).map((p) => p.index);
}

/** Look a preset up inside one model's own table. */
export function presetForProfile(
  profile: { presetSet?: DeviceProfile['presetSet'] },
  index: number,
): EqPreset | undefined {
  return presetsForProfile(profile).find((p) => p.index === index);
}
