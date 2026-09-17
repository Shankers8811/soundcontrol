import type { DeviceProfile, StateOffsets } from '../types';

/**
 * Model table.
 *
 * Every row is keyed by the Soundcore SKU (A39xx / A30xx) rather than by
 * marketing name, because the marketing names collide: **A3959 is both the
 * P30i and the R50i NC**, while **A3949 covers the P20i, P25i and the plain
 * R50i**. The authoritative mapping is OpenSCQ30's `lib/i18n/en/openscq30-lib.ftl`
 * plus its per-model Rust device definitions, cross-checked against HCI
 * captures published by DamienStaebler/SoundcoreDesktop, JordanViknar/
 * Noiseclapper-GNOME, mervin008/soundcorebridge and
 * victor-oliveira1/soundcore_anker_equalyzer.
 */

/**
 * P30i / R50i NC (A3959) — `a3959/packets/inbound/state_update.rs`.
 * Parse chain (byte counts): tws_status(2) dual_battery(4) dual_firmware(10)
 * serial(16) eq<1,10>(12) unknown(10) unknown(1) buttons(8×1: enabled flag
 * None + TwsLowBits action) ambient_cycle(1) → sound_modes at 64.
 */
const P30I_STATE: StateOffsets = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: null,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: 64,
};

/**
 * P20i / P25i / R50i (A3949) — `a3949/packets/inbound/state_update.rs` has
 * the same head (tws 2, battery 4, firmware 10, serial 16, eq<1,10> 12) then
 * unknown(11), buttons, unknown(4), gaming, touch tone — and **no
 * sound_modes field at all**, which is why the ANC controls stay hidden.
 */
const P20I_STATE: StateOffsets = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: null,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: null,
};

/**
 * Liberty 4 NC (A3947) — `a3947/packets/state_update.rs`. Parse chain:
 * tws(2) battery(4) firmware(10) serial(16) unknown(5) eq<2,10>(22)
 * unknown(1) hear_id<2,10>(48 = bool+2×10+u32+type+2×10+genre+unknown)
 * unknown(1) buttons(8×2 = 16, TwsLowBits enabled + action) cycle(1)
 * sound_modes(7) unknown(6) case_battery(1) → sound_modes 126, case 139.
 */
const LIBERTY4NC_STATE: StateOffsets = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: 139,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 37,
  eqBands: { at: 39, count: 10 },
  soundModes: 126,
};

/**
 * Liberty 3 Pro (A3952) — `a3952/packets/inbound/state_update.rs`. Parse
 * chain: tws(2) battery(4) firmware(10) serial(16) eq<2,10>(22) age_range(1)
 * custom_hear_id(47) unknown(1) buttons(6×2) unknown(4) cycle(1) →
 * sound_modes at 120; touch_tone(1) wear_detection(1) unknown(1) →
 * case_battery at 129. Firmware/serial live at the same head offsets as
 * every other model, but the store still prefers the dedicated `01:05`
 * request for them.
 */
const LIBERTY3PRO_STATE: StateOffsets = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: 129,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: 120,
};

/**
 * Over-ear models (Life Q30, Life Q35, Life Tune, Space One, Space Q45) all
 * use `single_battery(5)`: one 0..5 step, not a percentage. Their state
 * layouts differ per model and are not published byte-for-byte, so only the
 * battery is read here — firmware and serial come from the `01:05` request,
 * which every one of these models implements.
 */
function overEarState(batteryAt = 2): StateOffsets {
  return {
    batteryLeft: batteryAt,
    batteryRight: null,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: null,
    serial: null,
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
  };
}

const OPENSCQ30 = 'OpenSCQ30 device definition';

export const DEVICES: DeviceProfile[] = [
  {
    id: 'p30i',
    name: 'P30i / R50i NC',
    sku: 'A3959',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: false,
    batteryMax: 10,
    names: ['P30i', 'R50i NC', 'A3959', 'soundcore P30i', 'soundcore R50i NC'],
    ancLayout: 'tws-p30i',
    eqCommand: '02:83',
    state: P30I_STATE,
    source: `${OPENSCQ30} (a3959): dual_battery(10), a3959_sound_modes, equalizer_with_drc_tws`,
    verified: true,
  },
  {
    id: 'p20i',
    name: 'P20i / P25i / R50i',
    sku: 'A3949',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    // A3949 registers no sound-mode module at all, so the ANC buttons must
    // stay hidden rather than send a frame the firmware discards.
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ['P20i', 'P25i', 'R50i', 'A3949', 'soundcore P20i', 'soundcore P25i', 'soundcore R50i'],
    ancLayout: 'none',
    eqCommand: '02:83',
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3949); 22 live 02:83 captures in victor-oliveira1/soundcore_anker_equalyzer (RFCOMM channel 10)`,
    verified: true,
  },
  {
    id: 'a20i',
    name: 'A20i',
    sku: 'A3948',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ['A20i', 'A3948', 'soundcore A20i'],
    ancLayout: 'none',
    eqCommand: '02:83',
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3948): equalizer_with_drc_tws, dual_battery(5), no gaming mode`,
    verified: true,
  },
  {
    id: 'liberty-4-nc',
    name: 'Liberty 4 NC',
    sku: 'A3947',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: false,
    dual: false,
    surround: true,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['Liberty 4 NC', 'A3947', 'soundcore Liberty 4 NC'],
    ancLayout: 'tws-l4nc',
    // A3947 writes EQ only via the model-specific 03:87 HearID frame.
    eqCommand: null,
    state: LIBERTY4NC_STATE,
    source: `${OPENSCQ30} (a3947): a3947_sound_modes, case_battery_level(5), EQ over 03:87 only`,
    verified: true,
  },
  {
    id: 'liberty-3-pro',
    name: 'Liberty 3 Pro',
    sku: 'A3952',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: false,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['Liberty 3 Pro', 'A3952', 'soundcore Liberty 3 Pro'],
    ancLayout: 'tws-l3pro',
    eqCommand: null,
    state: LIBERTY3PRO_STATE,
    source: `${OPENSCQ30} (a3952): a3952_sound_modes, ldac, equalizer_with_custom_hear_id_tws`,
    verified: true,
  },
  {
    id: 'space-one',
    name: 'Space One',
    sku: 'A3035',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: true,
    dual: true,
    surround: false,
    wind: false,
    transparency: true,
    batteryMax: 5,
    names: ['Space One', 'A3035', 'soundcore Space One'],
    ancLayout: 'classic',
    eqCommand: null,
    state: overEarState(),
    source: `${OPENSCQ30} (a3035): a3035_sound_modes, ldac, single_battery_level(5), EQ over 03:87 only`,
    verified: true,
  },
  {
    id: 'q45',
    name: 'Space Q45',
    sku: 'A3040',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: true,
    dual: true,
    surround: false,
    wind: false,
    transparency: true,
    batteryMax: 5,
    names: ['Q45', 'Space Q45', 'A3040', 'soundcore Space Q45'],
    ancLayout: 'classic',
    eqCommand: null,
    state: overEarState(),
    source: `${OPENSCQ30} (a3040): a3040_sound_modes, ldac, dual_connections, single_battery_level(5)`,
    verified: true,
  },
  {
    id: 'q35',
    name: 'Life Q35',
    sku: 'A3027',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: true,
    batteryMax: 5,
    names: ['Q35', 'Life Q35', 'A3027', 'soundcore Life Q35'],
    ancLayout: 'classic',
    eqCommand: '02:81',
    state: overEarState(),
    source: `${OPENSCQ30} (a3027): classic 4-byte sound modes, equalizer(common_settings), single_battery(5)`,
    verified: true,
  },
  {
    id: 'q30',
    name: 'Life Q30',
    sku: 'A3028',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: true,
    batteryMax: 5,
    names: ['Q30', 'Life Q30', 'A3028', 'Soundcore Life Q30'],
    ancLayout: 'classic',
    eqCommand: '02:81',
    state: overEarState(),
    source: `${OPENSCQ30} (a3028) + live frames in JordanViknar/Noiseclapper-GNOME and DamienStaebler/SoundcoreDesktop`,
    verified: true,
  },
  {
    id: 'life-tune',
    name: 'Life Tune',
    sku: 'A3029',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: true,
    batteryMax: 5,
    names: ['Life Tune', 'A3029', 'soundcore Life Tune'],
    ancLayout: 'classic',
    eqCommand: '02:81',
    state: overEarState(),
    source:
      'OpenSCQ30 routes A3029 through the A3028 (Life Q30) implementation; name from its own i18n entry',
    verified: true,
  },
];

/**
 * Profiles kept for name matching only. These SKUs are **not** in OpenSCQ30's
 * device table, so nothing about their protocol is confirmed; they resolve to
 * the closest verified profile and the UI says so.
 */
export const UNVERIFIED_ALIASES: Array<{ names: string[]; resolvesTo: string; note: string }> = [
  {
    names: ['Liberty 4', 'A3953'],
    resolvesTo: 'liberty-4-nc',
    note: 'Liberty 4 (A3953) has no published protocol; using the Liberty 4 NC profile',
  },
  {
    names: ['Sport X10', 'A3961'],
    resolvesTo: 'p20i',
    note: 'Sport X10 (A3961) has no published protocol; using the A3949 profile',
  },
  {
    names: ['Sleep A10', 'A6610'],
    resolvesTo: 'p20i',
    note: 'Sleep A10 (A6610) has no published protocol; using the A3949 profile',
  },
];

/**
 * Longest alias first. "soundcore R50i NC" contains both "R50i NC" (A3959)
 * and "R50i" (A3949); picking by table order alone would silently attach the
 * wrong protocol to the device.
 */
const RANKED_ALIASES: Array<{ alias: string; id: string }> = DEVICES.flatMap((d) =>
  [...d.names, d.sku].map((alias) => ({ alias: alias.toLowerCase(), id: d.id })),
).sort((a, b) => b.alias.length - a.alias.length);

const RANKED_UNVERIFIED: Array<{ alias: string; resolvesTo: string; note: string }> =
  UNVERIFIED_ALIASES.flatMap((a) =>
    a.names.map((n) => ({ alias: n.toLowerCase(), resolvesTo: a.resolvesTo, note: a.note })),
  ).sort((a, b) => b.alias.length - a.alias.length);

export function matchDevice(name: string | undefined | null): DeviceProfile {
  if (!name) return DEVICES[0];
  const n = name.toLowerCase();
  const hit = RANKED_ALIASES.find((a) => n.includes(a.alias));
  if (hit) return DEVICES.find((d) => d.id === hit.id) ?? DEVICES[0];
  const alias = RANKED_UNVERIFIED.find((a) => n.includes(a.alias));
  if (alias) return DEVICES.find((d) => d.id === alias.resolvesTo) ?? DEVICES[0];
  return DEVICES[0];
}

/** Explanatory note when the match came from an unverified alias. */
export function matchNote(name: string | undefined | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (RANKED_ALIASES.some((a) => n.includes(a.alias))) return null;
  return RANKED_UNVERIFIED.find((a) => n.includes(a.alias))?.note ?? null;
}
