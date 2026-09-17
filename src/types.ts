export type TransportKind = 'bridge' | 'sim';

export type AncMode = 'anc' | 'adaptive' | 'transparency' | 'normal';

export type AncScene = 'transport' | 'outdoor' | 'indoor';

export type DeviceFamily = 'classic' | 'tws';

export type TabId = 'device' | 'sounds' | 'controls' | 'sleep' | 'settings';

export type StackId =
  | null
  | 'ambient'
  | 'eq-custom'
  | 'hearid'
  | 'touch'
  | 'diagnostics'
  | 'about'
  | 'safe-volume'
  | 'connect'
  | 'find-device'
  | 'device-select';

export type GestureAction =
  | 'play'
  | 'next'
  | 'prev'
  | 'vol-up'
  | 'vol-down'
  | 'anc'
  | 'trans'
  | 'voice-assistant'
  | 'game'
  | 'off';

export interface TouchMap {
  leftSingle: GestureAction;
  leftDouble: GestureAction;
  leftTriple: GestureAction;
  leftHold: GestureAction;
  rightSingle: GestureAction;
  rightDouble: GestureAction;
  rightTriple: GestureAction;
  rightHold: GestureAction;
}

export type EarbudPresence = 'both' | 'left' | 'right' | 'none' | 'unknown';

export interface BatteryState {
  left: number | null;
  right: number | null;
  case: number | null;
  leftCharging?: boolean;
  rightCharging?: boolean;
  caseCharging?: boolean;
  /** Null means the values are already percentages (for example Windows PnP). */
  batteryScale?: number | null;
  /** Reported only when the Soundcore telemetry identifies each TWS side. */
  presence?: EarbudPresence;
}

/**
 * Which `06:81` (sound-mode) payload layout a model uses. The three TWS
 * layouts are the same command with a different byte meaning, so sending the
 * wrong one silently sets the wrong ANC state.
 *
 * - `classic`  4 bytes: [ambient, nc_scene, transparency, custom_nc]
 *              Life Q30 / Life Q35 / Life Tune / Space One / Space Q45.
 * - `tws-p30i` 7 bytes: [ambient, manual<<4|adaptive, ambient, nc_automation,
 *              wind, adaptive_sensitivity, multi_scene]  — P30i / R50i NC.
 * - `tws-l4nc` 7 bytes: [ambient, manual<<4|adaptive, transparency, nc_mode,
 *              wind, environment_detection, transportation]  — Liberty 4 NC.
 * - `tws-l3pro` 6 bytes: [ambient, manual<<4|adaptive, transparency, nc_mode,
 *              wind, unknown]  — Liberty 3 Pro.
 * - `none`     the model exposes no sound-mode control at all (P20i / P25i /
 *              R50i / A20i), so the ANC buttons must not send anything.
 */
export type AncLayout = 'classic' | 'tws-p30i' | 'tws-l4nc' | 'tws-l3pro' | 'none';

/**
 * Which equalizer frame a model accepts. Verified per model — the Soundcore
 * families do not share one EQ command:
 *
 * - `02:81` preset u16LE + `00` + 8 band bytes (classic `common_settings()`).
 * - `02:83` preset u16LE + 10 raw bands + 10 DRC-compensated bands (TWS
 *   `equalizer_with_drc_tws(common_settings_type_2())`).
 * - `03:87` a long model-specific HearID frame (Space One / Space Q45 /
 *   Liberty 4 NC). Not implemented here: it embeds a per-model HearID block
 *   that has no public labelled capture, so a guessed frame risks writing
 *   junk into the device's personalised curve. `null` disables the EQ UI.
 */
export type EqCommand = '02:81' | '02:83' | '03:87';

/** Offsets of the fields inside a `01:01` state-update *payload*. */
export interface StateOffsets {
  /** Left/right battery steps, or the single over-ear level at `left`. */
  batteryLeft: number;
  batteryRight: number | null;
  /** Charging flags immediately follow the levels on TWS state frames. */
  batteryChargingLeft: number | null;
  batteryChargingRight: number | null;
  /** Charging-case level, when the model reports one. */
  batteryCase: number | null;
  /** ASCII firmware string, e.g. `01.59`. */
  firmware: { at: number; length: number } | null;
  /** ASCII serial number. */
  serial: { at: number; length: number } | null;
  /** Active EQ preset id (u16 little-endian) and the band block after it. */
  eqPresetId: number | null;
  eqBands: { at: number; count: number } | null;
  /** Start of the sound-mode block echoed by the device (`06:01` mirror). */
  soundModes: number | null;
}

export interface DeviceProfile {
  id: string;
  name: string;
  sku: string;
  kind: 'earbuds' | 'overear';
  family: DeviceFamily;
  gaming: boolean;
  ancLevels: boolean;
  /** Model exposes Transport / Outdoor / Indoor ANC scenes. */
  scenes: boolean;
  ldac: boolean;
  dual: boolean;
  /** Model has a transparency sub-mode (fully transparent vs vocal). */
  transparency: boolean;
  /** Model has wind-noise suppression. Not present on the classic over-ears. */
  wind: boolean;
  /** Model has the `02:86` 3D surround toggle. */
  surround: boolean;
  /** Raw Soundcore battery levels are often 0..5 or 0..10, not percentages. */
  batteryMax: number;
  names: string[];
  ancLayout: AncLayout;
  eqCommand: EqCommand | null;
  state: StateOffsets;
  /**
   * Human-readable provenance for the profile, so a future reader can tell a
   * reverse-engineered layout from a guessed one.
   */
  source: string;
  /** False when no public capture confirms the profile; UI flags it. */
  verified: boolean;
}

export interface LogEntry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx' | 'sys';
  hex: string;
  note?: string;
  valid?: boolean | null;
}

export interface Transport {
  kind: TransportKind;
  label: string;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export const EQ_HZ = [100, 200, 400, 800, 1600, 3200, 6400, 12800] as const;

export const ZERO_BANDS = [0, 0, 0, 0, 0, 0, 0, 0];

export const DEFAULT_TOUCH: TouchMap = {
  leftSingle: 'vol-down',
  leftDouble: 'prev',
  leftTriple: 'voice-assistant',
  leftHold: 'anc',
  rightSingle: 'vol-up',
  rightDouble: 'next',
  rightTriple: 'game',
  rightHold: 'play',
};
