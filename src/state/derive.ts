/**
 * Pure device-state derivations shared by every UI page.
 *
 * No React and no DOM in this module on purpose: `scripts/test_ui_state.mjs`
 * bundles it with esbuild and asserts the whole capability / earbud-state /
 * battery / connection-phase / scan matrix deterministically, without a UI
 * test framework. Every rule here is derived from PROTOCOL.md and the
 * per-model profiles in `src/protocol/devices.ts` — nothing is guessed.
 */
import type {
  AncFeatureOverrides,
  AncLayout,
  AncMode,
  AncScene,
  AncSubMode,
  BatteryState,
  DeviceProfile,
  EarbudPresence,
  EqBucket,
  ProfileRange,
} from '../types';

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which sub-features of the `06:81` sound-mode frame a layout really
 * carries. Derived byte-by-byte from the four documented layouts in
 * PROTOCOL.md — this is the honest source, not the marketing flags:
 *
 * - `classic`  [mode, nc_scene, transparency, custom_nc]
 *   → scenes + vocal transparency; NO manual level byte and NO wind byte.
 * - `tws-p30i` [ambient, manual<<4|adaptive, ambient, automation, wind,
 *   adaptive_sensitivity, multi_scene]
 *   → level + scenes + wind + adaptive; NO transparency sub-mode
 *   (OpenSCQ30 changelog: "R50i NC should not have transparency modes").
 * - `tws-l4nc` [ambient, manual<<4|adaptive, transparency, automation,
 *   wind, environment_detection, transportation]
 *   → level + transportation scenes + vocal + wind + adaptive.
 * - `tws-l3pro` [ambient, manual<<4|adaptive, transparency, automation,
 *   wind, unknown]
 *   → level + vocal + wind + adaptive; NO scene byte.
 */
export interface AncSubFeatures {
  /** Manual ANC strength 1..5 (the `manual << 4` nibble). */
  level: boolean;
  /** Transport / Outdoor / Indoor scene selection. */
  scenes: boolean;
  /** Transparency sub-mode: fully transparent vs vocal/talk. */
  transVocal: boolean;
  /** Wind-noise suppression bit. */
  wind: boolean;
  /** Adaptive ANC automation (byte 3 = 01). */
  adaptive: boolean;
}

export const ANC_SUB_FEATURES: Record<Exclude<AncLayout, 'none'>, AncSubFeatures> = {
  classic: { level: false, scenes: true, transVocal: true, wind: false, adaptive: false },
  'tws-p30i': { level: true, scenes: true, transVocal: false, wind: true, adaptive: true },
  'tws-l4nc': { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  'tws-l3pro': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
};

export const NO_ANC_SUB: AncSubFeatures = {
  level: false,
  scenes: false,
  transVocal: false,
  wind: false,
  adaptive: false,
};

/** Protocol-documented manual ANC strength range (the `manual << 4` nibble). */
export const DEFAULT_ANC_LEVEL_RANGE: ProfileRange = { min: 1, max: 5 };
/** Protocol-documented EQ band adjustment range, in dB. */
export const DEFAULT_EQ_RANGE_DB: ProfileRange = { min: -6, max: 6 };

/**
 * Apply a JSON profile's declared narrowing to the layout's documented
 * sub-features. The layout table is the ceiling: a profile may turn a control
 * off, never on, so a hand-edited file cannot make the UI offer a byte the
 * firmware does not read.
 */
export function narrowAncSub(
  layout: AncLayout,
  overrides?: AncFeatureOverrides,
): AncSubFeatures {
  if (layout === 'none') return NO_ANC_SUB;
  const documented = ANC_SUB_FEATURES[layout];
  if (!overrides) return documented;
  return {
    level: documented.level && overrides.level !== false,
    scenes: documented.scenes && overrides.scenes !== false,
    transVocal: documented.transVocal && overrides.transVocal !== false,
    wind: documented.wind && overrides.wind !== false,
    adaptive: documented.adaptive && overrides.adaptive !== false,
  };
}

/**
 * What the connected device can actually be told to do. Two entries are
 * protocol facts, not per-model checks:
 *
 * - `supportsVolume` is always false: no Soundcore RFCOMM capture or
 *   OpenSCQ30 command table contains a volume read/set frame, so the UI
 *   must never render an interactive device-volume slider.
 * - `supportsGestures` is always false: button mappings appear in some
 *   models' *state* blobs, but no public source documents a command that
 *   writes them. SoundControl does not invent one.
 */
export interface Capabilities {
  supportsNoiseControl: boolean;
  supportsEqualizer: boolean;
  supportsVolume: false;
  supportsGestures: false;
  /** True only when `01:85` is documented for the exact model (see types.ts). */
  supportsFactoryReset: boolean;
  supportsEarbudState: boolean;
  supportsPerEarbudBattery: boolean;
  /** True only for models whose `01:01` layout documents a case byte. */
  supportsCaseBattery: boolean;
  supportsFirmwareInfo: boolean;
  supportsGaming: boolean;
  /** Set when the model has gaming mode but the reported firmware is too old. */
  gamingBlockedByFirmware: boolean;
  /** The documented minimum, when the profile names one. */
  gamingMinFirmware?: string;
  supportsSurround: boolean;
  supportsDual: boolean;
  supportsLdac: boolean;
  ancSub: AncSubFeatures;
  /** Manual ANC strength bounds (documented 1..5, narrowed by the profile). */
  ancLevelRange: ProfileRange;
  /** Adaptive sensitivity bounds, or null when the layout has no such byte. */
  adaptiveSensitivityRange: ProfileRange | null;
  /** EQ band adjustment bounds in dB. */
  eqRangeDb: ProfileRange;
}

/** Parse a dotted firmware string such as `01.60` / `02.31.00`. */
export function parseFirmware(value: string | null | undefined): { major: number; minor: number } | null {
  const match = /(\d+)\.(\d+)/.exec((value ?? '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * True when `firmware` is at least `minimum`. Unknown/absent firmware is
 * never treated as old: the UI keeps the model-level capability rather than
 * hiding a feature the device may support. Only a parsed value below the
 * documented threshold blocks the feature.
 */
export function firmwareAtLeast(
  firmware: string | null | undefined,
  minimum: string | null | undefined,
): boolean {
  if (!minimum) return true;
  const fw = parseFirmware(firmware);
  const min = parseFirmware(minimum);
  if (!fw || !min) return true;
  return fw.major > min.major || (fw.major === min.major && fw.minor >= min.minor);
}

export function deriveCapabilities(profile: DeviceProfile, firmware?: string | null): Capabilities {
  const tws = profile.kind === 'earbuds' && profile.state.batteryRight !== null;
  const gamingBlockedByFirmware =
    profile.gaming &&
    !!profile.gamingMinFirmware &&
    !firmwareAtLeast(firmware, profile.gamingMinFirmware);
  return {
    supportsNoiseControl: profile.ancLayout !== 'none',
    supportsEqualizer: profile.eqCommand !== null,
    supportsVolume: false,
    supportsGestures: false,
    supportsFactoryReset: profile.factoryReset === true,
    supportsEarbudState: tws,
    supportsPerEarbudBattery: tws,
    supportsCaseBattery: profile.state.batteryCase !== null,
    // `01:05` (serial + firmware) is implemented by every supported model.
    supportsFirmwareInfo: true,
    supportsGaming: profile.gaming && !gamingBlockedByFirmware,
    gamingBlockedByFirmware,
    gamingMinFirmware: profile.gamingMinFirmware,
    supportsSurround: profile.surround,
    supportsDual: profile.dual,
    supportsLdac: profile.ldac,
    ancSub: narrowAncSub(profile.ancLayout, profile.ancFeatures),
    ancLevelRange: profile.ancLevelRange ?? DEFAULT_ANC_LEVEL_RANGE,
    adaptiveSensitivityRange:
      profile.adaptiveSensitivityRange ??
      (profile.ancLayout !== 'none' && ANC_SUB_FEATURES[profile.ancLayout].adaptive
        ? DEFAULT_ANC_LEVEL_RANGE
        : null),
    eqRangeDb: profile.eqRangeDb ?? DEFAULT_EQ_RANGE_DB,
  };
}

/* ------------------------------------------------------------------ */
/* Battery math                                                        */
/* ------------------------------------------------------------------ */

/**
 * Raw telemetry byte → level, or null when unavailable. `0xFF` means "that
 * side is not connected to the host" (PROTOCOL.md); values above 100 are
 * layout noise, never a percentage.
 */
export function batteryLevel(value: number | undefined): number | null {
  if (value === undefined || value === 0xff || value > 100) return null;
  // NaN, ±Infinity and negative raws are not wire bytes — they arrive only
  // from corrupted persisted state or a parsing bug upstream (§13). Reject
  // them here so no caller can build a percentage on garbage.
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Level → percent. `scale` is the model's raw maximum (5 or 10 steps for
 * device telemetry); `null` means the value is already a percentage (Windows
 * PnP battery). A level above its scale is passed through clamped rather
 * than rescaled, so firmware that reports percents in a 0..5 slot degrades
 * gracefully instead of showing 1700%.
 */
export function batteryPercent(level: number | null, scale: number | null | undefined | 'unknown'): number | null {
  if (level === null || level === undefined) return null;
  // A non-finite or negative level is corrupt telemetry, not a charge
  // state: clamping or rescaling it would invent a plausible-looking
  // number (§13). Unavailable is the honest answer.
  if (!Number.isFinite(level) || level < 0) return null;
  // 'unknown' scale: the device model is unidentified, so the raw level
  // cannot be interpreted — neither as scale-5 nor scale-10 nor as a
  // percent. A precise-looking number here would be a guess; the honest
  // answer is "unavailable" (raw levels stay visible in diagnostics).
  if (scale === 'unknown') return null;
  // A zero, negative or non-finite scale cannot interpret a raw level and
  // is not a percent passthrough either — it is corrupt profile data.
  // Refuse to guess intent; report unavailable.
  if (scale !== null && scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) return null;
  if (scale === null || scale === undefined || level > scale) {
    return Math.max(0, Math.min(100, Math.round(level)));
  }
  return Math.round((level * 100) / scale);
}

/* ------------------------------------------------------------------ */
/* Earbud presence (left / right / both / none / unknown)              */
/* ------------------------------------------------------------------ */

/**
 * Presence straight from the wire: each side's byte is `0xFF` when that
 * bud is not connected to the host. A side only counts as *present* when
 * its byte decodes to a trustworthy level (≤ 100); a missing byte (over-ears,
 * truncated frames) or layout noise (> 100) leaves the pair *unknown* —
 * untrustworthy telemetry is never promoted to a confirmed state.
 */
export function presenceFromRaw(rawLeft: number | undefined, rawRight: number | undefined): EarbudPresence {
  const side = (raw: number | undefined): 'present' | 'absent' | 'unknown' => {
    if (raw === undefined) return 'unknown';
    if (raw === 0xff) return 'absent';
    // Anything that cannot be a wire byte (NaN, negatives, out-of-range)
    // is untrustworthy telemetry — never promote it to a confirmed side.
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 'unknown';
    return 'present';
  };
  const left = side(rawLeft);
  const right = side(rawRight);
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  if (left === 'present' && right === 'present') return 'both';
  if (left === 'present') return 'left';
  if (right === 'present') return 'right';
  return 'none';
}

/**
 * Per-side state, explicit about every degree of knowledge:
 *
 * - `connected`    — the device explicitly reports this side present.
 * - `disconnected` — the device explicitly reports this side absent (`0xFF`).
 * - `unknown`      — the model supports L/R telemetry but no valid current
 *                    telemetry has arrived (fresh link, pending query,
 *                    truncated/untrustworthy frame). NEVER "disconnected".
 * - `unavailable`  — the model does not expose individual sides at all
 *                    (over-ears); no L/R visualization may be rendered.
 */
export type EarbudSideState = 'connected' | 'disconnected' | 'unknown' | 'unavailable';

/** Aggregate, derived ONLY from the two side states — never from battery. */
export type EarbudConnectionState = EarbudPresence | 'unavailable';

export interface EarbudSide {
  /** Source of truth for the side; battery is NEVER used as connection proof. */
  state: EarbudSideState;
  /** Percent, or null when unavailable (never invented, never stale). */
  battery: number | null;
  /** Null when the device never reported a charging flag for this side. */
  charging: boolean | null;
}

export interface EarbudCase {
  /** False unless the model's `01:01` layout documents a case byte. */
  supported: boolean;
  battery: number | null;
  charging: boolean | null;
}

export interface EarbudState {
  left: EarbudSide;
  right: EarbudSide;
  connection: EarbudConnectionState;
  /** Charging case, only for models that report it. */
  case: EarbudCase;
  /** False for models without independent L/R hardware. */
  supported: boolean;
}

/** The cleared battery state: no levels, no flags, presence unknown. */
export function emptyBattery(): BatteryState {
  return {
    left: null,
    right: null,
    leftCharging: undefined,
    rightCharging: undefined,
    case: null,
    caseCharging: undefined,
    batteryScale: null,
    presence: 'unknown',
  };
}

/** One decoded battery-bearing frame (`01:01` state blob or `01:03` query). */
export interface BatteryFrame {
  rawLeft: number | undefined;
  rawRight: number | undefined;
  /** Case byte, only present on `01:01` for models that document one. */
  rawCase?: number | undefined;
  /** Only `01:01`/`01:04` carry charging bits; `01:03` leaves them unset. */
  chargingLeft?: boolean;
  chargingRight?: boolean;
  caseCharging?: boolean;
  /**
   * The model's raw-level maximum (0..5 / 0..10), null for percents, or
   * 'unknown' when the device model — and therefore the scale — is unknown.
   */
  scale: number | null | 'unknown';
}

/**
 * The single source-of-truth merge for battery telemetry (Pass 4 §4/§5).
 *
 * Mandatory invariants — a side whose current byte is `0xFF` (explicitly
 * absent), missing, or untrustworthy (> 100) gets `null` battery and cleared
 * charging: **a previous level can NEVER survive new telemetry that says the
 * side is gone.** Only a side whose byte is present-and-valid in THIS frame
 * may keep prior charging information (frames that legitimately carry no
 * charging bits, like `01:03`, must not wipe them). Presence comes from the
 * current frame alone — no stickiness, so incomplete telemetry degrades to
 * `unknown` instead of pretending an older confirmation still holds.
 */
export function mergeBatteryTelemetry(previous: BatteryState, frame: BatteryFrame): BatteryState {
  const side = (raw: number | undefined) => ({
    trusted: raw !== undefined && raw !== 0xff && raw <= 100,
    level: batteryLevel(raw),
  });
  const l = side(frame.rawLeft);
  const r = side(frame.rawRight);
  // A `01:03` query carries no case byte. Keep the last reported case level
  // across such frames, but an explicit 0xFF / invalid case byte clears it.
  const hasCaseByte = frame.rawCase !== undefined;
  const c = side(frame.rawCase);
  return {
    left: l.level,
    right: r.level,
    leftCharging: l.trusted ? frame.chargingLeft ?? previous.leftCharging : undefined,
    rightCharging: r.trusted ? frame.chargingRight ?? previous.rightCharging : undefined,
    case: hasCaseByte ? c.level : previous.case ?? null,
    caseCharging: hasCaseByte
      ? c.trusted
        ? frame.caseCharging ?? previous.caseCharging
        : undefined
      : previous.caseCharging,
    batteryScale: frame.scale,
    presence: presenceFromRaw(frame.rawLeft, frame.rawRight),
  };
}

/**
 * Per-side earbud state for the Earbud Connection card. Always returns a
 * complete value; `supported` is false (and both sides read `unavailable`)
 * for profiles without independent left/right hardware — callers must then
 * not render per-side status at all.
 *
 * `unknown` presence yields `unknown` sides ("Detecting earbuds…"), which is
 * deliberately distinct from `disconnected` ("Disconnected"): presence is
 * only known once the device answered a battery/state frame with both side
 * bytes. Battery is shown only for a side the device reports as connected,
 * so a stale pre-disconnect level can never appear next to "Disconnected".
 */
export function deriveEarbudState(battery: BatteryState, caps: Capabilities): EarbudState {
  if (!caps.supportsEarbudState) {
    const unavailable: EarbudSide = { state: 'unavailable', battery: null, charging: null };
    return {
      left: unavailable,
      right: unavailable,
      connection: 'unavailable',
      case: { supported: false, battery: null, charging: null },
      supported: false,
    };
  }
  const presence: EarbudPresence = battery.presence ?? 'unknown';

  const side = (which: 'left' | 'right'): EarbudSide => {
    let state: EarbudSideState;
    if (presence === 'unknown') state = 'unknown';
    else if (presence === 'both') state = 'connected';
    else if (presence === 'none') state = 'disconnected';
    else state = presence === which ? 'connected' : 'disconnected';

    const raw = which === 'left' ? battery.left : battery.right;
    const charging = which === 'left' ? battery.leftCharging : battery.rightCharging;
    return {
      state,
      battery: state === 'connected' ? batteryPercent(raw, battery.batteryScale) : null,
      charging: state === 'connected' && charging !== undefined ? charging : null,
    };
  };

  const caseSupported = caps.supportsCaseBattery;
  return {
    left: side('left'),
    right: side('right'),
    connection: presence,
    case: {
      supported: caseSupported,
      battery: caseSupported ? batteryPercent(battery.case ?? null, battery.batteryScale) : null,
      charging:
        caseSupported && battery.caseCharging !== undefined ? battery.caseCharging : null,
    },
    supported: true,
  };
}

/**
 * Which locally remembered EQ curve a noise mode should use. ANC and adaptive
 * share one bucket (both are "noise cancelling" to the user); Normal and
 * Transparency get their own.
 */
export function eqBucketForMode(mode: AncMode): EqBucket {
  if (mode === 'normal') return 'normal';
  if (mode === 'transparency') return 'transparency';
  return 'anc';
}

/* ------------------------------------------------------------------ */
/* Sound-mode mirror (`06:01`) — the device confirming its own ANC     */
/* ------------------------------------------------------------------ */

/** What a `06:01` device mirror confirms; absent fields stay untouched. */
export interface SoundModeReport {
  mode: AncMode;
  /** Manual ANC level 1..5 when the layout carries one in the high nibble. */
  level?: number;
  /**
   * A3959-only: which sub-mode the automation byte (payload[3]) selects.
   * The device reports it, so the UI can mirror `Manual / Adaptive /
   * Multi-scene` instead of assuming the last button the user pressed.
   */
  subMode?: AncSubMode;
  /** Device-reported adaptive strength (low nibble), 1..5. */
  adaptiveLevel?: number;
  /**
   * Device-reported adaptive sensitivity, 0..10. The firmware sends 0xFF when
   * it has none set, which is reported as `undefined` (never as a level).
   */
  adaptiveSensitivity?: number;
  /** Classic over-ears only. */
  scene?: AncScene;
  transVocal?: boolean;
  wind?: boolean;
}

/**
 * Parse the device's own sound-mode report. Returns null for layouts without
 * ANC, short payloads, or an out-of-range mode byte — a malformed mirror must
 * never overwrite the last CONFIRMED state (Pass 4 §17: only real device
 * acknowledgements move the UI).
 */
export function parseSoundModes(
  payload: ArrayLike<number>,
  layout: AncLayout,
): SoundModeReport | null {
  if (layout === 'none' || payload.length < 2) return null;
  const b0 = payload[0];
  if (b0 !== 0x00 && b0 !== 0x01 && b0 !== 0x02) return null;
  const report: SoundModeReport = {
    mode: b0 === 0x00 ? 'anc' : b0 === 0x01 ? 'transparency' : 'normal',
  };
  const manual = (payload[1] >> 4) & 0x0f;
  if (manual >= 1 && manual <= 5) report.level = manual;
  if (layout === 'tws-p30i' && payload.length >= 7) {
    // A3959 (`a3959/structures/sound_modes.rs`): byte 3 is the
    // Manual(0)/Adaptive(1)/Multi-scene(2) selector — the enum OpenSCQ30
    // commit 9b6e42a7 corrected. Byte 1's low nibble is the adaptive strength
    // and byte 5 the adaptive sensitivity, both firmware-owned.
    const automation = payload[3];
    report.subMode =
      automation === 0x00
        ? 'manual'
        : automation === 0x01
          ? 'adaptive'
          : automation === 0x02
            ? 'multiscene'
            : undefined;
    if (b0 === 0x00 && report.subMode === 'adaptive') report.mode = 'adaptive';
    const adaptiveNibble = payload[1] & 0x0f;
    if (adaptiveNibble >= 1 && adaptiveNibble <= 5) report.adaptiveLevel = adaptiveNibble;
    const sensitivity = payload[5];
    if (sensitivity >= 0 && sensitivity <= 10) report.adaptiveSensitivity = sensitivity;
  }
  if (layout === 'tws-l4nc' && payload.length >= 5) {
    report.transVocal = (payload[2] & 0x01) !== 0;
    report.wind = (payload[4] & 0x01) !== 0;
  } else if ((layout === 'tws-p30i' || layout === 'tws-l3pro') && payload.length >= 5) {
    report.wind = (payload[4] & 0x01) !== 0;
  }
  if (layout === 'classic' && payload.length >= 4) {
    report.transVocal = (payload[2] & 0x01) !== 0;
    const scene = payload[1];
    report.scene = scene === 0x00 ? 'transport' : scene === 0x02 ? 'indoor' : 'outdoor';
  } else if (layout === 'tws-p30i' && payload.length >= 7) {
    // A3959 byte 6 is the multi-scene selector: 00 Transport · 01 Outdoor ·
    // 02 Indoor. Mirror it so a scene changed on the phone shows up here.
    // A shorter mirror carries no scene byte, so the confirmed scene survives.
    const scene = payload[6];
    report.scene = scene === 0x00 ? 'transport' : scene === 0x02 ? 'indoor' : 'outdoor';
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* Connection phase                                                    */
/* ------------------------------------------------------------------ */

/**
 * The single connection phase the UI renders. `connected` is only ever set
 * by the store after the bridge confirmed the RFCOMM link — clicking
 * "Connect" moves the phase to `connecting`, never to `connected`.
 */
export type ConnectionPhase = 'connected' | 'connecting' | 'error' | 'disconnected';

export function deriveConnectionPhase(input: {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}): ConnectionPhase {
  if (input.connected) return 'connected';
  if (input.connecting) return 'connecting';
  if (input.error) return 'error';
  return 'disconnected';
}

/* ------------------------------------------------------------------ */
/* Device-scan state machine (Devices page)                            */
/* ------------------------------------------------------------------ */

export type HelperStatus = 'checking' | 'online' | 'offline';
export type ScanStatus = 'idle' | 'scanning' | 'results' | 'empty' | 'error';

export interface ScannedDevice {
  id: string;
  name: string;
  mac?: string;
  battery?: number | null;
}

export interface ScanState {
  helper: HelperStatus;
  status: ScanStatus;
  devices: ScannedDevice[];
  /** Human-readable reason for `error`/`empty`; null otherwise. */
  message: string | null;
  lastScanAt: number | null;
}

export const INITIAL_SCAN_STATE: ScanState = {
  helper: 'checking',
  status: 'idle',
  devices: [],
  message: null,
  lastScanAt: null,
};

export type ScanEvent =
  | { type: 'start' }
  | { type: 'helper'; online: boolean }
  | { type: 'results'; devices: ScannedDevice[]; at: number }
  | { type: 'error'; message: string }
  | { type: 'helper-offline'; message: string };

export const EMPTY_SCAN_MESSAGE =
  'No paired Soundcore devices found. Pair them once in Windows Settings → Bluetooth & devices, then scan again.';

/**
 * Pure reducer for the Devices-page scan flow, so every transition
 * (scanning / results / empty / error / helper offline) is deterministic
 * and unit-tested instead of living inside an async component callback.
 */
export function nextScanState(prev: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'start':
      return { ...prev, status: 'scanning', message: null };
    case 'helper':
      return { ...prev, helper: event.online ? 'online' : 'offline' };
    case 'results':
      return {
        ...prev,
        helper: 'online',
        status: event.devices.length > 0 ? 'results' : 'empty',
        devices: event.devices,
        message: event.devices.length > 0 ? null : EMPTY_SCAN_MESSAGE,
        lastScanAt: event.at,
      };
    case 'error':
      return { ...prev, status: 'error', message: event.message };
    case 'helper-offline':
      return {
        ...prev,
        helper: 'offline',
        status: 'error',
        devices: [],
        message: event.message,
      };
  }
}
