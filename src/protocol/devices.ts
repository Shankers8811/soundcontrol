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
  soundModeLength: 7,
  // Trailing block (OpenSCQ30 a3959 state_update.rs, Phase 18): buttons(8)
  // at 55…62, ambient_cycle 63, sound_modes 64…70, unknown 71, touch_tone
  // 72, dual_connections_enabled 73, surround_sound 74, auto_power_off 75,
  // low_battery_prompt 76, gaming_mode 77 (only when min firmware >= 01.60),
  // unknown(12) → payload is 90 bytes.
  dualConnections: 73,
  surround: 74,
  gaming: 77,
  gamingMinFirmware: '01.60',
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
  // Trailing block (OpenSCQ30 a3949 state_update.rs, Phase 18): unknown(11)
  // at 44…54, buttons(6) 55…60, unknown(4) 61…64, gaming_mode 65,
  // touch_tone 66 → payload is 67 bytes.
  gaming: 65,
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
  soundModeLength: 7,
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
  soundModeLength: 6,
};

/**
 * Over-ear models report one battery level. The OpenSCQ30 A3004/A3027/
 * A3028/A3035/A3040 state bodies all begin with `BatteryLevel` at offset 0.
 * Firmware and serial still come from the `01:05` request, which every one
 * of these models implements.
 */
function overEarState(batteryAt = 0): StateOffsets {
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

/** Shared TWS state head: tws status (2), dual battery (4), firmware (10), serial (16). */
function twsState(overrides: Partial<StateOffsets> = {}): StateOffsets {
  return {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: 4,
    batteryChargingRight: 5,
    batteryCase: null,
    firmware: { at: 6, length: 10 },
    serial: { at: 16, length: 16 },
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides,
  };
}

/** A3005/A3062-style single-body state with a two-byte battery head. */
function singleBodyState(
  firmware: { at: number; length: number },
  serial: { at: number; length: number },
  overrides: Partial<StateOffsets> = {},
): StateOffsets {
  return {
    batteryLeft: 0,
    batteryRight: null,
    batteryChargingLeft: 1,
    batteryChargingRight: null,
    batteryCase: null,
    firmware,
    serial,
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides,
  };
}

/** OpenSCQ30's DualBatteryLevel has levels only; firmware starts at byte 4. */
function twsLevelState(overrides: Partial<StateOffsets> = {}): StateOffsets {
  return {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: { at: 4, length: 10 },
    serial: { at: 14, length: 16 },
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides,
  };
}

/**
 * Transport shape only for universal presence reads. These are deliberately
 * NOT a documented `01:01` telemetry layout; the store's `verified` gate
 * refuses to parse them as state offsets.
 */
function catalogTwsState(): StateOffsets {
  return {
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
  };
}

const SPACE_A40_STATE = twsState({
  batteryCase: 118,
  eqPresetId: 32,
  eqBands: { at: 34, count: 20 },
  soundModes: 111,
  soundModeLength: 6,
  dualConnections: 121,
  gaming: 124,
});

const LIBERTY4PRO_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 44,
  eqBands: { at: 46, count: 20 },
  soundModes: 125,
  soundModeLength: 4,
  dualConnections: 142,
});

const P40I_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  soundModeLength: 7,
  dualConnections: 135,
});

const LIBERTY5_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  dualConnections: 130,
  gaming: 146,
});

const SPACE_ONE_PRO_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 7, length: 16 },
  {
    eqPresetId: 23,
    eqBands: { at: 25, count: 10 },
    soundModes: 69,
    soundModeLength: 6,
    dualConnections: 79,
  },
);

const Q11I_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 7, length: 16 },
  {
    eqPresetId: 23,
    eqBands: { at: 25, count: 10 },
    dualConnections: 41,
  },
);

const SPACE2_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 11, length: 12 },
  { batteryChargingLeft: null },
);

const Q20I_STATE: StateOffsets = {
  batteryLeft: 0,
  batteryRight: null,
  batteryChargingLeft: 1,
  batteryChargingRight: null,
  batteryCase: null,
  firmware: { at: 2, length: 5 },
  serial: { at: 7, length: 16 },
  eqPresetId: 23,
  eqBands: { at: 25, count: 10 },
  soundModes: 35,
  soundModeLength: 4,
};

const LIFE_Q_STATE: StateOffsets = {
  batteryLeft: 0,
  batteryRight: null,
  batteryChargingLeft: 1,
  batteryChargingRight: null,
  batteryCase: null,
  firmware: { at: 39, length: 5 },
  serial: { at: 44, length: 16 },
  eqPresetId: 2,
  eqBands: { at: 4, count: 8 },
  soundModes: 35,
  soundModeLength: 4,
};

/** A3945 Life Note 3S: Tws(2) + dual_battery(4) + firmware(10) +
 * serial(16) + EQ<2,10>(22) + six button pairs(12) + touch/wear/game(3)
 * + case(1) + BassUp(1) + color(1) = 72 bytes. No write capability is
 * inferred from this parse chain (a3945/packets/state_update_packet.rs). */
const LIFE_NOTE_3S_STATE = twsState({
  minimumLength: 72,
  exactLength: 72,
  eqPresetId: 32,
  eqBands: { at: 34, count: 20 },
  batteryCase: 69,
  gaming: 68,
});

const C30I_STATE = twsLevelState({
  // A3330/C30i's level-only head is followed by the case byte at 35. The
  // late fields below are the offsets in the captured 01:01 state payload;
  // do not shift them to match the outbound 02:83 frame shape.
  batteryCase: 35,
  eqPresetId: 50,
  eqBands: { at: 52, count: 10 },
  // OpenSCQ30 parses this readable flag, but exposes no surround write module.
  surround: 44,
  dualConnections: 47,
});

const AEROCLIP_STATE = twsLevelState({
  // A3388/AeroClip has one ten-band EQ block in its state update. Its outbound
  // 02:83 command is two-channel, but that command shape must not be reused
  // as a state-payload length or the real 66-byte telemetry frame is rejected.
  batteryCase: 35,
  eqPresetId: 50,
  eqBands: { at: 52, count: 10 },
  // Readable in the state packet only; the A3388 module does not document
  // SET_SURROUND_SOUND (02:86), so the profile capability remains false.
  surround: 44,
  dualConnections: 47,
});

// OpenSCQ30's D1101 parser places the dual-connections flag immediately after
// the low-battery prompt at payload offset 53 (not 54).


const V20I_STATE = twsLevelState({
  eqPresetId: 36,
  eqBands: { at: 38, count: 20 },
  gaming: 72,
  dualConnections: 74,
});

const SPORT_X20_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 117,
  soundModeLength: 6,
  surround: 126,
  dualConnections: 128,
});

const C50I_STATE = twsLevelState({
  eqPresetId: 30,
  eqBands: { at: 32, count: 10 },
  dualConnections: 53,
});

const P31I_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  soundModeLength: 8,
  dualConnections: 131,
});

// D1301/Sleep A30's captured 01:01 bodies have Tws(2), DualBatteryLevel(2),
// firmware(10) at 4, serial(16) at 14, then 120 further bytes. The upstream
// three-option post-sleep audio captures are 150 bytes (action 144, enable 148).
// Do not confirm this layout on the earlier partial 32-byte identity prefix.
const SLEEP_A30_STATE = twsLevelState({ minimumLength: 150, exactLength: 150 });

/**
 * Current catalog rows whose exact packet family is not public. They still
 * get exact identity and protocol-universal battery/presence reads, but no
 * guessed scale, state offsets, ANC, EQ or codec controls.
 */
function catalogOnly(
  id: string,
  name: string,
  sku: string,
  kind: DeviceProfile['kind'],
  names: string[],
  source: string,
): DeviceProfile {
  return {
    id,
    name,
    sku,
    kind,
    family: kind === 'earbuds' ? 'tws' : 'classic',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: null,
    names,
    ancLayout: 'none',
    eqCommand: null,
    customEq: false,
    state: kind === 'earbuds' ? catalogTwsState() : overEarState(),
    source,
    verified: false,
  };
}

export const DEVICES: DeviceProfile[] = [
  {
    id: 'life-note-3s-readonly',
    name: 'Life Note 3S (read-only)',
    sku: 'A3945',
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
    names: ['Life Note 3S', 'A3945', 'soundcore Life Note 3S'],
    ancLayout: 'none',
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: LIFE_NOTE_3S_STATE,
    source: `${OPENSCQ30} (a3945/packets/state_update_packet.rs): complete 72-byte 01:01 parse chain; case(69), gaming(68), BassUp(70), six button pairs(54..65). 04:81/04:84 and EQ writes intentionally blocked`,
    verified: true,
  },
  {
    id: 'c30i',
    name: 'C30i',
    sku: 'A3330',
    kind: 'open-ear',
    family: 'tws',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ['C30i', 'A3330', 'soundcore C30i'],
    ancLayout: 'none',
    eqCommand: '02:83-single',
    presetSet: 'c30i',
    customEq: true,
    caseBatteryMax: 5,
    state: C30I_STATE,
    source: `${OPENSCQ30} (a3330): dual_battery_level(5), case_battery_level(5), equalizer_with_drc (single channel), dual_connections; no sound-mode module`,
    verified: true,
  },
  {
    id: 'aeroclip',
    name: 'AeroClip',
    sku: 'A3388',
    kind: 'open-ear',
    family: 'tws',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    // A3388 state telemetry contains a readable surround byte, but the
    // OpenSCQ30 module deliberately does not register a surround writer:
    // 02:86 is not acknowledged and must never be advertised or sent.
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['AeroClip', 'A3388', 'soundcore AeroClip'],
    ancLayout: 'none',
    eqCommand: '02:83-dual',
    presetSet: 'type2',
    customEq: true,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: AEROCLIP_STATE,
    source: `${OPENSCQ30} (a3388): dual_battery_level_custom(max 10, offset 1), case_battery_level_custom(max 10, offset 1), one ten-band state EQ block with two-channel outbound 02:83, dual_connections; surround is parsed read-only and has no documented write module`,
    verified: true,
  },
  {
    id: 'v20i',
    name: 'V20i',
    sku: 'A3876',
    kind: 'open-ear',
    family: 'tws',
    gaming: true,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['V20i', 'A3876', 'soundcore V20i'],
    ancLayout: 'none',
    eqCommand: '02:83-single',
    presetSet: 'v20i',
    customEq: true,
    state: V20I_STATE,
    source: `${OPENSCQ30} (a3876): dual_battery_level_custom(max 10, offset 1), one-channel 02:83 DRC EQ applied to both buds, gaming, dual_connections`,
    verified: true,
  },
  {
    id: 'sport-x20',
    name: 'Sport X20',
    sku: 'A3968',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['Sport X20', 'A3968', 'soundcore Sport X20'],
    ancLayout: 'tws-a3968',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: SPORT_X20_STATE,
    source: `${OPENSCQ30} (a3968): six-byte named sound modes, dual_battery(5), case_battery_level(5), dual_connections and surround_sound; custom HearID EQ is not emitted by this app`,
    verified: true,
  },
  {
    id: 'c50i',
    name: 'C50i',
    sku: 'D1101',
    kind: 'open-ear',
    family: 'tws',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['C50i', 'D1101', 'soundcore C50i'],
    ancLayout: 'none',
    eqCommand: '02:81-dual',
    presetSet: 'c50i',
    customEq: true,
    state: C50I_STATE,
    source: `${OPENSCQ30} (d1101): dual_battery_level_custom(max 10, offset 1), two-channel 02:81 EQ, dual_connections and LDAC`,
    verified: true,
  },
  {
    id: 'p31i',
    name: 'P31i / R60i NC',
    sku: 'D1202',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['P31i', 'R60i NC', 'D1202', 'D1202C', 'soundcore P31i', 'soundcore R60i NC'],
    ancLayout: 'tws-d1202',
    ambientTransparency: true,
    // D1202 uses the source-backed 03:87 HearID/DSP transaction. SoundControl
    // emits only the documented disabled-HearID factory-preset form; custom
    // personalised HearID curves remain intentionally unavailable.
    eqCommand: '03:87',
    presetSet: 'type2',
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: P31I_STATE,
    source: `${OPENSCQ30} (d1202/d1202c): eight-byte named sound modes, dual_battery_custom(max 10, offset 1), case battery, LDAC, dual_connections and 03:87 two-channel EQ with disabled HearID factory-preset writes; personalised HearID remains read-only`,
    verified: true,
  },
  {
    id: 'sleep-a30',
    name: 'Sleep A30',
    sku: 'D1301',
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
    batteryMax: 10,
    batteryOffset: 1,
    names: ['Sleep A30', 'D1301', 'soundcore Sleep A30'],
    ancLayout: 'none',
    eqCommand: null,
    customEq: false,
    state: SLEEP_A30_STATE,
    source: `${OPENSCQ30} (d1301): dual_battery_level_custom(max 10, offset 1), sleep/listening-mode state; specialized sleep commands are not guessed by SoundControl`,
    verified: true,
  },
  {
    id: 'p30i',
    name: 'P30i / R50i NC',
    sku: 'A3959',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    ancLevels: true,
    scenes: true,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: false,
    batteryMax: 10,
    names: ['P30i', 'R50i NC', 'A3959', 'soundcore P30i', 'soundcore R50i NC'],
    ancLayout: 'tws-p30i',

    // Documented: OpenSCQ30 changelog "Soundcore R50i NC should not have
    // transparency modes" — the model gate refuses the ambient 0x01 write
    // (PENDING CAPTURE: no physical transparency observation exists).
    ambientTransparency: false,
    eqCommand: '02:83',
    presetSet: 'type2',
    customEq: true,
    state: P30I_STATE,
    source: `${OPENSCQ30} (a3959): dual_battery(10), a3959_sound_modes (NC=0/Transparency=1/Normal=2, manual+adaptive, wind), equalizer_with_drc_tws with custom preset 0xFEFE, gaming_mode (state byte 77, firmware >= 01.60), dual_connections (73), surround_sound (74)`,
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
    presetSet: 'type2',
    // OpenSCQ30 a3949.rs: equalizer_with_drc_tws with custom_preset_id: None
    // — "device doesn't support custom presets". None of the 22 live P20i
    // captures uses the FEFE custom id either (all factory presets 00..16),
    // so custom curves stay OFF for this family: factory presets only.
    customEq: false,
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3949): no sound-modes module (no ANC/transparency), equalizer_with_drc_tws WITHOUT custom presets, gaming_mode (state byte 65), dual_battery(5); 22 live 02:83 factory-preset captures in victor-oliveira1/soundcore_anker_equalyzer (RFCOMM channel 10)`,
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
    presetSet: 'type2',
    customEq: true,
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3948): equalizer_with_drc_tws (common_settings_type_2, custom preset 0xFEFE), dual_battery(5), no gaming mode`,
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
    ambientTransparency: true,
    // A3947 writes EQ only via the model-specific 03:87 HearID frame.
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
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
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: LIBERTY3PRO_STATE,
    source: `${OPENSCQ30} (a3952): a3952_sound_modes, ldac, equalizer_with_custom_hear_id_tws`,
    verified: true,
  },
  {
    id: 'space-a40',
    name: 'Space A40',
    sku: 'A3936',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['Space A40', 'A3936', 'soundcore Space A40'],
    ancLayout: 'tws-a3936',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    state: SPACE_A40_STATE,
    source: `${OPENSCQ30} (a3936): six-byte sound modes, dual_battery(5), LDAC, dual_connections, gaming, case battery, custom HearID EQ module (not emitted by this app)`,
    verified: true,
  },
  {
    id: 'liberty-4-pro',
    name: 'Liberty 4 Pro',
    sku: 'A3954',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 100,
    names: ['Liberty 4 Pro', 'A3954', 'soundcore Liberty 4 Pro'],
    ancLayout: 'tws-l4pro',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: LIBERTY4PRO_STATE,
    source: `${OPENSCQ30} (a3954): four-byte slider sound modes (ANC 1..5 maps to slider 5..1; transparency 7..11), LDAC, dual connections; model-specific HearID EQ is intentionally read-only`,
    verified: true,
  },
  {
    id: 'p40i',
    name: 'P40i',
    sku: 'A3955',
    kind: 'earbuds',
    family: 'tws',
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: false,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['P40i', 'A3955', 'soundcore P40i'],
    ancLayout: 'tws-p40i',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: P40I_STATE,
    source: `${OPENSCQ30} (a3955): seven-byte sound modes with multi-scene ANC, dual_battery(5), dual connections; specialized EQ/HearID fields are not guessed`,
    verified: true,
  },
  {
    id: 'liberty-5',
    name: 'Liberty 5',
    sku: 'A3957',
    kind: 'earbuds',
    family: 'tws',
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['Liberty 5', 'A3957', 'soundcore Liberty 5'],
    ancLayout: 'tws-l5',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: LIBERTY5_STATE,
    source: `${OPENSCQ30} (a3957): seven-byte sound modes, dual_battery_custom(max 10, offset 1), LDAC, dual connections, gaming over 10:85; EQ/HearID writes intentionally disabled`,
    verified: true,
  },
  {
    id: 'space-one-pro',
    name: 'Space One Pro',
    sku: 'A3062',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['Space One Pro', 'A3062', 'soundcore Space One Pro'],
    ancLayout: 'tws-a3062',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
    state: SPACE_ONE_PRO_STATE,
    source: `${OPENSCQ30} (a3062): six-byte custom-transparency sound modes, single_battery_custom(max 10, offset 1), LDAC, dual connections; model-specific EQ/HearID is not guessed`,
    verified: true,
  },
  {
    id: 'q20i',
    name: 'Q20i',
    sku: 'A3004',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    // Q21i NC is a regional marketing name for the same A3004 hardware: the
    // Anker EU/UK Declaration of Conformity covers "Q20i and Q21i NC" on
    // A3004, so the shared name resolves to this exact SKU profile instead of
    // an unknown model.
    names: ['Q20i', 'A3004', 'soundcore Q20i', 'Q21i NC', 'soundcore Q21i NC'],
    ancLayout: 'classic',
    ambientTransparency: true,
    eqCommand: '02:83',
    customEq: true,
    state: Q20I_STATE,
    source: `${OPENSCQ30} (a3004): four-byte ambient sound modes, single_battery(5), equalizer_with_drc; no ANC level/scene or transparency sub-mode controls are exposed`,
    verified: true,
  },
  {
    id: 'q11i',
    name: 'Q11i',
    sku: 'A3005',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['Q11i', 'A3005', 'soundcore Q11i'],
    ancLayout: 'none',
    eqCommand: '02:83',
    customEq: true,
    presetSet: 'a3005',
    state: Q11I_STATE,
    source: `${OPENSCQ30} (a3005): equalizer_with_drc, dual connections, auto power-off, single_battery_custom(max 10, offset 1); no sound-mode module`,
    verified: true,
  },
  {
    id: 'space-2-readonly',
    name: 'Space 2 (read-only)',
    sku: 'D1402',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ['Space 2', 'D1402', 'soundcore Space 2'],
    ancLayout: 'none',
    eqCommand: null,
    customEq: false,
    state: SPACE2_STATE,
    source: 'soundcorebridge protocol-map.md: D1402 read state/battery/LDAC responses are known, but every write requires the verified 05:01/05:81/18:85 unlock sequence and specialized 03:87 EQ template; this profile is deliberately read-only until that transport is implemented',
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
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 5,
    names: ['Space One', 'A3035', 'soundcore Space One'],
    ancLayout: 'classic-a3035',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
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
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ['Q45', 'Space Q45', 'A3040', 'soundcore Space Q45'],
    ancLayout: 'classic-a3040',
    ambientTransparency: true,
    eqCommand: null,
    customEq: false,
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
    transparency: false,
    batteryMax: 5,
    names: ['Q35', 'Life Q35', 'A3027', 'soundcore Life Q35'],
    ancLayout: 'classic',
    ambientTransparency: true,
    eqCommand: '02:81',
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source: `${OPENSCQ30} (a3027): classic 4-byte sound modes at state offset 35, single_battery(5) at offset 0, equalizer(common_settings)`,
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
    transparency: false,
    batteryMax: 5,
    names: ['Q30', 'Life Q30', 'A3028', 'Soundcore Life Q30'],
    ancLayout: 'classic',
    ambientTransparency: true,
    eqCommand: '02:81',
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source: `${OPENSCQ30} (a3028) + live frames in JordanViknar/Noiseclapper-GNOME and DamienStaebler/SoundcoreDesktop: classic 4-byte modes at state offset 35, battery at offset 0`,
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
    transparency: false,
    batteryMax: 5,
    // The official serial-number guide lists A3029 as "Life Tune/Life Tune XR".
    names: ['Life Tune', 'Life Tune XR', 'A3029', 'soundcore Life Tune', 'soundcore Life Tune XR'],
    ancLayout: 'classic',
    ambientTransparency: true,
    eqCommand: '02:81',
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source:
      'OpenSCQ30 routes A3029 through the A3028 (Life Q30) implementation: classic 4-byte modes at state offset 35 and battery at offset 0; name from its own i18n entry',
    verified: true,
  },
  {
    id: 'life-tune-pro',
    name: 'Life Tune Pro',
    sku: 'A3030',
    kind: 'overear',
    family: 'classic',
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ['Life Tune Pro', 'A3030', 'soundcore Life Tune Pro'],
    ancLayout: 'classic',
    ambientTransparency: true,
    eqCommand: '02:81',
    // FEFE custom curves documented for the 02:81 command (same family as the
    // A3027 row this SKU is routed through).
    customEq: true,
    state: LIFE_Q_STATE,
    source:
      'OpenSCQ30 device_model.rs routes A3030 (Life Tune Pro) through the A3027 (Life Q35) implementation: classic 4-byte sound modes at state offset 35, single_battery(5) at offset 0 and 02:81 equalizer. Identity from the official soundcore serial-number guide (A3030 = Life Tune Pro).',
    verified: true,
  },

  // Official US/EU catalog identities with no public packet layout yet. These
  // rows deliberately resolve the exact SKU to a read-only catalog profile:
  // 01:05 identity and 01:03 presence reads remain available, while every
  // model-specific control stays disabled until a capture proves its bytes.
  catalogOnly('liberty-buds', 'Liberty Buds', 'D1200', 'earbuds', ['Liberty Buds', 'D1200', 'soundcore Liberty Buds'], 'Official soundcore catalog identity (EU/current regional listing); packet layout not published in the sources used here.'),
  catalogOnly('liberty-5-pro', 'Liberty 5 Pro', 'D1203', 'earbuds', ['Liberty 5 Pro', 'D1203', 'soundcore Liberty 5 Pro'], 'Official soundcore US catalog/product identity; exact D1203 packet layout is not published in the sources used here.'),
  catalogOnly('liberty-5-pro-max', 'Liberty 5 Pro Max', 'D1204', 'earbuds', ['Liberty 5 Pro Max', 'D1204', 'soundcore Liberty 5 Pro Max'], 'Official soundcore US catalog identity; exact D1204 packet layout is not published in the sources used here.'),
  catalogOnly('p42i', 'P42i', 'D1205', 'earbuds', ['P42i', 'D1205', 'soundcore P42i'], 'Official soundcore US catalog/product identity; exact D1205 packet layout is not published in the sources used here.'),
  catalogOnly('liberty-buds-2', 'Liberty Buds 2', 'D1206', 'earbuds', ['Liberty Buds 2', 'D1206', 'soundcore Liberty Buds 2'], 'Official soundcore US catalog/product identity; exact D1206 packet layout is not published in the sources used here.'),
  catalogOnly('sleep-a20', 'Sleep A20', 'A6611', 'earbuds', ['Sleep A20', 'A6611', 'soundcore Sleep A20'], 'Official soundcore US catalog identity; exact A6611 sleep-earbud packet layout is not published in the sources used here.'),
  catalogOnly('aeroclip-2', 'AeroClip 2', 'D1105', 'earbuds', ['AeroClip 2', 'D1105', 'soundcore AeroClip 2', 'AeroClip2'], 'Official soundcore US open-ear catalog/product identity; exact D1105 packet layout is not published in the sources used here.'),
  catalogOnly('aerofit-2', 'AeroFit 2', 'A3874', 'earbuds', ['AeroFit 2', 'A3874', 'A3874X', 'AeroFit 2 AI Assistant', 'soundcore AeroFit 2', 'soundcore AeroFit 2 AI Assistant'], 'Official soundcore US catalog identity; AeroFit 2 AI Assistant is a regional/feature SKU alias of A3874, not a second protocol family.'),
  catalogOnly('aerofit-2-pro', 'AeroFit 2 Pro', 'A3875', 'earbuds', ['AeroFit 2 Pro', 'A3875', 'soundcore AeroFit 2 Pro'], 'Official soundcore US/EU product identity; exact A3875 packet layout is not published in the sources used here.'),
  catalogOnly('aerofit-pro', 'AeroFit Pro', 'A3871', 'earbuds', ['AeroFit Pro', 'A3871', 'soundcore AeroFit Pro'], 'Official soundcore US/EU product identity; exact A3871 packet layout is not published in the sources used here.'),
  catalogOnly('aerofit', 'AeroFit', 'A3872', 'earbuds', ['AeroFit', 'A3872', 'soundcore AeroFit'], 'Official soundcore EU product identity; exact A3872 packet layout is not published in the sources used here.'),
  catalogOnly('c40i', 'C40i', 'A3331', 'earbuds', ['C40i', 'A3331', 'soundcore C40i'], 'Official soundcore US/EU catalog/support identity; exact A3331 packet layout is not published in the sources used here.'),
  catalogOnly('v30i', 'V30i', 'A3873', 'earbuds', ['V30i', 'A3873', 'soundcore V30i'], 'Official soundcore US open-ear catalog identity; exact A3873 packet layout is not published in the sources used here.'),
  catalogOnly('v40i', 'V40i', 'A3878', 'earbuds', ['V40i', 'A3878', 'soundcore V40i'], 'Official soundcore US open-ear catalog identity; exact A3878 packet layout is not published in the sources used here.'),
  catalogOnly('k20i', 'K20i', 'A3994', 'earbuds', ['K20i', 'A3994', 'soundcore K20i'], 'Official soundcore EU catalog/support identity; exact A3994 packet layout is not published in the sources used here.'),
  catalogOnly('space-2-pro', 'Space 2 Pro', 'D1406', 'overear', ['Space 2 Pro', 'D1406', 'soundcore Space 2 Pro'], 'Official soundcore US catalog/product identity; exact D1406 packet layout is not published in the sources used here.'),
  catalogOnly('q31i', 'Q31i', 'D1404', 'overear', ['Q31i', 'D1404', 'soundcore Q31i'], 'Official soundcore US/EU product/support identity; exact D1404 packet layout is not published in the sources used here.'),
  catalogOnly('h30i', 'H30i', 'A3012', 'overear', ['H30i', 'A3012', 'soundcore H30i'], 'Official soundcore EU product/support identity; exact A3012 packet layout is not published in the sources used here.'),
  catalogOnly('life-q20', 'Life Q20', 'A3025', 'overear', ['Life Q20', 'A3025', 'soundcore Life Q20'], 'Official soundcore EU product/support identity; exact A3025 packet layout is not published in the sources used here.'),
  catalogOnly('life-2', 'Life 2', 'A3023', 'overear', ['Life 2', 'A3023', 'soundcore Life 2'], 'Official soundcore serial-number guide identifies A3023 as Life 2; no OpenSCQ30 implementation or other public packet layout exists in the sources used here, so only protocol-universal reads are enabled.'),
  catalogOnly('life-q10', 'Life Q10', 'A3032', 'overear', ['Life Q10', 'A3032', 'soundcore Life Q10'], 'Official soundcore serial-number guide and product page (A3032 = Life Q10); no public packet layout exists in the sources used here.'),
  catalogOnly('life-q20-plus', 'Life Q20+', 'A3045', 'overear', ['Life Q20+', 'Q20+', 'A3045', 'soundcore Life Q20+'], 'Official soundcore service pages (A3045 Life Q20+ user manual, quick-start guide and DoC); no public packet layout exists in the sources used here.'),
  catalogOnly('vortex', 'Soundcore Vortex', 'A3031', 'overear', ['Soundcore Vortex', 'Vortex', 'A3031'], 'Official soundcore serial-number guide identifies A3031 as Soundcore Vortex. OpenSCQ30 publishes a dedicated a3031 implementation (sound modes with NC levels, dual battery, EQ<2,8>, button status, auto power-off, touch tone), but that packet layout has not been ported or validated in SoundControl, so only protocol-universal reads are enabled.'),
  catalogOnly('space-nc', 'Space NC', 'A3021', 'overear', ['Space NC', 'A3021', 'soundcore Space NC'], 'FCC ID 2AOKB-A3021 (Anker Innovations) identifies A3021 as Soundcore Space NC (user manual, 2018, the earliest Space-series ANC headphone). No OpenSCQ30 implementation or other public packet layout exists in the sources used here, so only protocol-universal reads are enabled.'),
  catalogOnly('life-2-nc', 'Life 2 NC', 'A3024', 'overear', ['Life 2 NC', 'A3024', 'soundcore Life 2 NC'], 'FCC ID 2AOKB-A3024 (Anker Innovations) identifies A3024 as Soundcore Life 2 NC (user manual, 2019). No public packet layout exists in the sources used here, so only protocol-universal reads are enabled.'),
  catalogOnly('life-2-neo', 'Life 2 Neo', 'A3033', 'overear', ['Life 2 Neo', 'A3033', 'soundcore Life 2 Neo', 'Q10i', 'soundcore Q10i', 'Life Q10i'], 'Anker registration (A3033C) and the soundcore serial-number guide identify A3033 as Life 2 Neo; the retail variant A3033Y11 is sold in several regions as Soundcore Q10i, so Q10i is treated as a regional marketing alias of the same A3033 hardware, not a second device (the separate A3032 Life Q10 row is a different product). OpenSCQ30 documents an a3033 implementation (equalizer, wearing detection and single_battery(5), no sound modes), but that packet layout has not been ported or validated in SoundControl, so only protocol-universal reads are enabled.'),
  catalogOnly('life-u2i', 'R500 / Life U2i', 'A3213', 'neckband', ['R500', 'Life U2i', 'A3213', 'soundcore R500', 'soundcore Life U2i'], 'Official soundcore product and serial-number pages identify A3213 as R500/Life U2i; exact packet layout is not published in the sources used here.'),
  catalogOnly('life-u2', 'Life U2', 'A3212', 'neckband', ['Life U2', 'A3212', 'soundcore Life U2'], 'Official soundcore product and serial-number pages identify A3212 as Life U2; exact packet layout is not published in the sources used here.'),
  catalogOnly('life-nc', 'Life NC', 'A3201', 'neckband', ['Life NC', 'A3201', 'soundcore Life NC'], 'Official soundcore serial-number page identifies A3201 as Life NC; exact packet layout is not published in the sources used here.'),
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
 *  - Sport X10 (A3961), Sleep A10 (A6610), Life A2 NC (A3935), Life P3
 *    (A3939) and Life Note 3 (A3933) are likewise not a verified sibling;
 *    their wiring is unproven, so nothing is assumed.
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
  {
    names: ['Life A2 NC', 'A3935'],
    note:
      'Life A2 NC (A3935) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the Liberty or Life-Q layouts.',
  },
  {
    names: ['Life P3', 'A3939'],
    note:
      'Life P3 (A3939) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the P20i or Life-Q layouts.',
  },
  {
    names: ['Life Note 3', 'A3933'],
    note:
      'Life Note 3 (A3933) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the P20i or Life-Q layouts.',
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
 *  - the protocol-universal `01:03` battery/presence shape (battery at 2/3)
 *    for explicit reads. Catalog identities are NEVER parsed through the
 *    profile-offset `01:01` state path; charging, EQ and sound-mode offsets
 *    stay null because no layout is proven.
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
  customEq: false,
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

interface AliasMatch {
  id: string;
  alias: string;
  start: number;
  end: number;
}

/**
 * Token boundary for alias matching. Equivalent to `\b` for aliases made of
 * word characters, but it also works when an alias ENDS in punctuation such
 * as the official "Life Q20+" name: `\b` cannot terminate after "+" (a
 * non-word character followed by end-of-string is not a word boundary).
 * [A-Za-z0-9_] is the token alphabet, so "R50iNC" and "XR50i" still never
 * match "R50i".
 */
const TOKEN_CHAR = '[a-z0-9_]';
const tokenRegex = (alias: string): RegExp =>
  new RegExp(
    `(?<!${TOKEN_CHAR})${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${TOKEN_CHAR})`,
  );

/** Whole-token alias matches with their spans (Phase 18 identification). */
function aliasMatches(n: string): AliasMatch[] {
  return RANKED_ALIASES.flatMap((a) => {
    const m = tokenRegex(a.alias).exec(n);
    return m ? [{ id: a.id, alias: a.alias, start: m.index, end: m.index + a.alias.length }] : [];
  });
}

/**
 * Resolve token matches to ONE profile, or null when unresolvable:
 *  - no matches → null;
 *  - the longest match wins, and a shorter match fully INSIDE its span is
 *    the same words ("R50i NC" also contains the token "R50i" — not a
 *    competing model), so it is ignored;
 *  - a match for a DIFFERENT model outside the winner's span ("P30i R50i")
 *    is genuine ambiguity → null (unknown-model profile, never a guess).
 */
function resolveAliasMatches(matches: AliasMatch[]): DeviceProfile | null {
  if (matches.length === 0) return null;
  const winner = [...matches].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const competing = matches.filter(
    (m) => m.id !== winner.id && !(m.start >= winner.start && m.end <= winner.end),
  );
  if (competing.length > 0) return null;
  return DEVICES.find((d) => d.id === winner.id) ?? null;
}

export function matchDevice(name: string | undefined | null): DeviceProfile {
  if (!name) return UNKNOWN_PROFILE;
  const n = name.toLowerCase();
  // Phase 18: aliases must match as WHOLE TOKENS, not substrings — "R50iNC"
  // or "XR50i" must NOT resolve to the R50i profile, and a name that
  // contains tokens from TWO different models ("P30i R50i") is ambiguous
  // rather than a lucky longest-first win. Both cases resolve to the honest
  // unknown-model profile instead of a guessed capability set.
  const hit = resolveAliasMatches(aliasMatches(n));
  if (hit) return hit;
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
  const tokenMatch = (alias: string) => tokenRegex(alias).test(n);
  const matches = aliasMatches(n);
  if (matches.length > 0) {
    if (resolveAliasMatches(matches)) return null;
    // Tokens matched but resolution failed: the name carries tokens from
    // more than one model. That is ambiguity, not an identification.
    return `The device name "${name}" matches more than one Soundcore model, so SoundControl cannot
      safely pick a capability profile. It connects with the generic profile: firmware, serial and
      earbud presence still work, but model-specific controls stay unavailable.`;
  }
  const alias = RANKED_UNVERIFIED.find((a) => tokenMatch(a.alias));
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
