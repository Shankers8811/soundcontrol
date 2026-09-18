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
 * Names kept for EXPLANATION only — never for resolution (Pass 11 §12).
 *
 * These SKUs are not in OpenSCQ30's device table and no capture proves
 * their protocol layout, so `matchDevice` returns the unknown-model
 * profile for them and this table only supplies the explanatory note:
 *
 *  - Liberty 4 (A3953) is a DIFFERENT product from Liberty 4 NC (A3947);
 *    an approximate marketing name is not evidence, and borrowing the NC
 *    profile would assert its battery scale, ANC layout and capabilities
 *    without proof.
 *  - Sport X10 (A3961) and Sleep A10 (A6610) are likewise not A3949
 *    (P20i); their wiring is unproven, so nothing is assumed.
 *
 * If a future capture verifies one of these layouts, promote it to a real
 * `DEVICES` entry with its own `source:` evidence instead of re-adding a
 * resolves-to fallback here.
 */
export const UNVERIFIED_ALIASES: Array<{ names: string[]; note: string }> = [
  {
    names: ['Liberty 4', 'A3953'],
    note:
      'Liberty 4 (A3953) is a distinct product from Liberty 4 NC (A3947) and no capture proves its protocol layout, so SoundControl treats it as an unknown model: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable.',
  },
  {
    names: ['Sport X10', 'A3961'],
    note:
      'Sport X10 (A3961) has no published protocol capture, so SoundControl treats it as an unknown model rather than borrowing another device’s battery scale or ANC layout: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable.',
  },
  {
    names: ['Sleep A10', 'A6610'],
    note:
      'Sleep A10 (A6610) has no published protocol capture, so SoundControl treats it as an unknown model rather than borrowing another device’s battery scale or ANC layout: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable.',
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

const RANKED_UNVERIFIED: Array<{ alias: string; note: string }> = UNVERIFIED_ALIASES.flatMap(
  (a) => a.names.map((n) => ({ alias: n.toLowerCase(), note: a.note })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * The unidentified-model profile (Pass 10 §1/§2/§5).
 *
 * A device whose name matched nothing in the table is NOT a P30i, NOT an
 * R50i and NOT any other row: borrowing a real model's profile would guess
 * its battery scale (a scale-5 level shown against scale 10 reads as half
 * the real charge), its ANC byte layout and its capabilities. This profile
 * therefore claims only what the protocol documents for EVERY device:
 *
 *  - `01:05` firmware/serial (implemented by all supported models),
 *  - the `01:03` battery-query presence layout — byte0 left, byte1 right
 *    (TWS) or one level (over-ear), `0xFF` = side absent (PROTOCOL.md,
 *    OpenSCQ30 `request_battery_level.rs`) — presence only, never percent:
 *    `batteryMax: null` keeps the raw-level scale unproven, so the UI shows
 *    "Battery unavailable" instead of a precise-looking guess,
 *  - the shared TWS state-blob head (battery at 2/3) for spontaneous
 *    `01:01` updates — again presence-level information only; charging,
 *    EQ and sound-mode offsets stay null because no layout is proven.
 *
 * Everything model-specific is disabled: no ANC controls (layout unknown —
 * sending a guessed `06:81` would silently set the wrong state), no EQ, no
 * gaming/surround/dual/LDAC toggles. Identity can still arrive later (scan
 * name, persisted recents, manual profile override); until then the model
 * stays unknown rather than inferred. Deliberately NOT part of `DEVICES`,
 * so the preview picker and the model-table tests keep enumerating only
 * real, documented devices.
 */
export const UNKNOWN_PROFILE: DeviceProfile = {
  id: 'unknown',
  name: 'Unknown model',
  sku: '—',
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
  batteryMax: null,
  names: [],
  ancLayout: 'none',
  eqCommand: null,
  state: {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: null,
    serial: null,
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
  },
  source:
    'No identity: protocol-universal reads only (01:05, 01:03 presence per PROTOCOL.md). Battery scale unproven — percentages stay unavailable.',
  verified: false,
};

export function matchDevice(name: string | undefined | null): DeviceProfile {
  if (!name) return UNKNOWN_PROFILE;
  const n = name.toLowerCase();
  const hit = RANKED_ALIASES.find((a) => n.includes(a.alias));
  if (hit) return DEVICES.find((d) => d.id === hit.id) ?? UNKNOWN_PROFILE;
  // Unverified marketing names and SKUs deliberately DO NOT resolve to a
  // real profile (Pass 11 §12): "Liberty 4" (A3953) is not "Liberty 4 NC"
  // (A3947), and Sport X10 (A3961) / Sleep A10 (A6610) are not A3949.
  // Guessing would assert an unproven battery scale and ANC layout, so the
  // honest answer is the unknown-model profile; matchNote() explains why.
  return UNKNOWN_PROFILE;
}

/** Explanatory note when the match came from an unverified alias. */
export function matchNote(name: string | undefined | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (RANKED_ALIASES.some((a) => n.includes(a.alias))) return null;
  const alias = RANKED_UNVERIFIED.find((a) => n.includes(a.alias));
  if (alias) return alias.note;
  // Nothing matched at all: the device runs on the unidentified-model
  // profile. Tell the user why battery percentages (and model-specific
  // controls) stay unavailable instead of letting it look broken.
  return (
    'This device’s model could not be identified, so SoundControl uses its generic profile: ' +
    'firmware, serial and earbud presence still come from the device, but battery percentages ' +
    'and model-specific controls stay unavailable — a raw level is never shown against a guessed scale.'
  );
}
