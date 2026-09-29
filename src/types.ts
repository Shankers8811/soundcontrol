export type TransportKind = 'bridge' | 'sim';

export type AncMode = 'anc' | 'adaptive' | 'transparency' | 'normal';

export type AncScene = 'transport' | 'outdoor' | 'indoor';

export type DeviceFamily = 'classic' | 'tws';

/** Physical presentation used by the detail views; protocol family stays separate. */
export type DeviceKind = 'earbuds' | 'overear' | 'neckband';

/**
 * Desktop sidebar pages. Five top-level destinations (Pass 8 information
 * architecture): Home, Devices, Equalizer, Noise Control, Settings. Internal
 * ids keep their original names ('dashboard', 'controls') so routing, store
 * persistence and tests stay stable — only the user-facing labels changed.
 * About moved into Settings; it is no longer a page id.
 */
export type PageId = 'dashboard' | 'devices' | 'equalizer' | 'controls' | 'settings';

/**
 * Appearance preference (Settings → Appearance). 'system' follows the OS
 * prefers-color-scheme; 'dark'/'light' force the theme. Persisted in
 * localStorage like every other real setting — resolved to a concrete
 * 'dark'|'light' on <html data-theme> by the shell.
 */
export type ThemePref = 'system' | 'dark' | 'light';

export type EarbudPresence = 'both' | 'left' | 'right' | 'none' | 'unknown';

export interface BatteryState {
  left: number | null;
  right: number | null;
  leftCharging?: boolean;
  rightCharging?: boolean;
  // No case level on purpose: many Soundcore models never report one (the
  // official app hides it too) and over-ears have no case, so displaying a
  // number here would mostly show guesses.
  /**
   * Null means the values are already percentages (for example host Bluetooth telemetry).
   * 'unknown' means the device model — and with it the raw-level scale — is
   * not known: the raw levels may be kept for presence, but NO percentage may
   * ever be derived from them (a scale-5 level read against scale 10 shows
   * half the real charge, and vice versa shows double).
   */
  batteryScale?: number | null | 'unknown';
  /**
   * Raw-level offset used by models whose first reported step is 1 rather
   * than 0 (for example A3005/A3062/A3957: displayed level = raw + 1).
   */
  batteryOffset?: number;
  /** Reported only when the Soundcore telemetry identifies each TWS side. */
  presence?: EarbudPresence;
}

/**
 * Which `06:81` (sound-mode) payload layout a model uses. The three TWS
 * layouts are the same command with a different byte meaning, so sending the
 * wrong one silently sets the wrong ANC state.
 *
 * - `classic`  4 bytes: [ambient, nc_scene, transparency, custom_nc]
 *              Life Q30 / Life Q35 / Life Tune.
 * - `classic-a3035` 6 bytes: Space One's [ambient, manual|adaptive,
 *              ambient, automation, wind, transparency_level] structure.
 * - `classic-a3040` 6 bytes: Space Q45's [ambient, manual|adaptive,
 *              transparency_mode, nc_mode, wind, transparency_level] structure.
 * - `tws-p30i` 7 bytes: [ambient, manual<<4|adaptive, ambient, nc_automation,
 *              wind, adaptive_sensitivity, multi_scene]  — P30i / R50i NC.
 * - `tws-l4nc` 7 bytes: [ambient, manual<<4|adaptive, transparency, nc_mode,
 *              wind, environment_detection, transportation]  — Liberty 4 NC.
 * - `tws-l3pro` 6 bytes: [ambient, manual<<4|adaptive, transparency, nc_mode,
 *              wind, unknown]  — Liberty 3 Pro.
 * - `tws-a3062` 6 bytes: Space One Pro's custom transparency / ANC layout.
 * - `tws-a3936` 6 bytes: Space A40's manual/adaptive ANC layout.
 * - `tws-l4pro` 4 bytes: Liberty 4 Pro's slider / airplane layout.
 * - `tws-p40i` 7 bytes: P40i's multi-scene ANC layout.
 * - `tws-l5` 7 bytes: Liberty 5's transportation-aware layout.
 * - `tws-a3968` 6 bytes: Sport X20's named adaptive/wind layout.
 * - `tws-d1202` 8 bytes: P31i/R60i NC's named adaptive, multi-scene,
 *              real-time ANC layout.
 * - `none`     the model exposes no sound-mode control at all (P20i / P25i /
 *              R50i / A20i and read-only/unverified profiles), so the ANC
 *              buttons must not send anything.
 */
export type AncLayout =
  | 'classic'
  | 'classic-a3035'
  | 'classic-a3040'
  | 'tws-p30i'
  | 'tws-l4nc'
  | 'tws-l3pro'
  | 'tws-a3062'
  | 'tws-a3936'
  | 'tws-l4pro'
  | 'tws-p40i'
  | 'tws-l5'
  | 'tws-a3968'
  | 'tws-d1202'
  | 'none';

/**
 * Which equalizer frame a model accepts. Verified per model — the Soundcore
 * families do not share one EQ command:
 *
 * - `02:81` preset u16LE + `00` + 8 band bytes (classic `common_settings()`).
 * - `02:81-dual` is the two-channel, non-DRC shape used by D1101/C50i.
 * - `02:83` preset u16LE + 10 raw bands + 10 DRC-compensated bands (TWS
 *   `equalizer_with_drc_tws(common_settings_type_2())`).
 * - `02:83-single` is the one-channel DRC shape used by A3330/A3876;
 *   `02:83-dual` is the two-channel, non-DRC shape used by A3388.
 * - `03:87` is D1202/P31i's long HearID frame. SoundControl emits the
 *   documented disabled-HearID factory-preset form and never invents a
 *   personalised curve.
 * - `null` disables the EQ UI.
 */
export type EqCommand =
  | '02:81'
  | '02:81-dual'
  | '02:83'
  | '02:83-single'
  | '02:83-dual'
  | '03:87';

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
  /** Sound-mode body length; defaults to the common seven-byte guard. */
  soundModeLength?: number;
  /**
   * Gaming-mode flag byte inside the `01:01` state update (Phase 18): when
   * present, the device's OWN report confirms/denies the toggle — the UI
   * state becomes device-confirmed instead of optimistic-only. Evidence:
   * OpenSCQ30 a3949/a3959 `state_update.rs` parse chains.
   */
  gaming?: number | null;
  /**
   * 3D Surround flag byte inside the `01:01` state update (a3959 at 74).
   */
  surround?: number | null;
  /** Dual-connections-enabled flag byte inside the `01:01` state update (a3959 at 73). */
  dualConnections?: number | null;
  /**
   * A3959 only: OpenSCQ30 gates the gaming byte on
   * `dual_firmware_version.min() >= 01.60` ("requires firmware version >=
   * 01.60, but we can just parse and check that later"). When set, the
   * gaming byte is only trusted when both buds' firmware is at least this.
   */
  gamingMinFirmware?: string | null;
}

export interface DeviceProfile {
  id: string;
  name: string;
  sku: string;
  kind: DeviceKind;
  family: DeviceFamily;
  gaming: boolean;
  ancLevels: boolean;
  /** Model exposes Transport / Outdoor / Indoor ANC scenes. */
  scenes: boolean;
  ldac: boolean;
  dual: boolean;
  /** Model has a transparency sub-mode (fully transparent vs vocal). */
  transparency: boolean;
  /** Model has a documented wind-noise suppression field in its mode layout. */
  wind: boolean;
  /** Model has the `02:86` 3D surround toggle. */
  surround: boolean;
  /**
   * Raw Soundcore battery levels are often 0..5 or 0..10, not percentages.
   * Null ONLY for the unidentified-model profile: without a proven scale a
   * raw level must never be converted to a percentage — the UI shows the
   * honest "Battery unavailable" state instead of a precise-looking guess.
   */
  batteryMax: number | null;
  /** Add to a raw level before scaling (A3005/A3062/A3957 use an offset of 1). */
  batteryOffset?: number;
  names: string[];
  ancLayout: AncLayout;
  eqCommand: EqCommand | null;
  state: StateOffsets;
  /**
   * True only when the model accepts a CUSTOM equalizer curve (preset id
   * 0xFEFE). OpenSCQ30's `equalizer_with_drc_tws` for A3959/A3948 and the
   * classic 02:81 models use `custom_preset_id: Some(0xfefe)`, while A3949
   * explicitly overrides it to `None` ("device doesn't support custom
   * presets") — and none of the 22 live P20i captures contains a FEFE
   * frame. False ⇒ the custom-curve UI stays hidden and the FEFE frame is
   * rejected by the model gate (factory presets still work).
   */
  customEq: boolean;
  /**
   * True only when the `01:85` factory-reset frame is documented for THIS
   * model. The only public source (OpenSCQ30) maps it to the Soundcore
   * Motion+ A3116 speaker, which is not in this table — so no headphone or
   * earbud profile may claim it. Falsy ⇒ the UI shows an honest unsupported
   * note instead of firing an undocumented, destructive frame at hardware.
   */
  factoryReset?: boolean;
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
