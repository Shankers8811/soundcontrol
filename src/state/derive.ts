/**
 * Pure device-state derivations shared by every UI page.
 *
 * No React and no DOM in this module on purpose: `scripts/test_ui_state.mjs`
 * bundles it with esbuild and asserts the whole capability / earbud-state /
 * battery / connection-phase / scan matrix deterministically, without a UI
 * test framework. Every rule here is derived from PROTOCOL.md and the
 * per-model profiles in `src/protocol/devices.ts` — nothing is guessed.
 */
import type { AncLayout, AncMode, AncScene, BatteryState, DeviceProfile, EarbudPresence } from '../types';

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which sub-features of the `06:81` sound-mode frame a layout really
 * carries. Derived byte-by-byte from the documented layouts in
 * PROTOCOL.md — this is the honest source, not the marketing flags:
 *
 * - `classic`  [mode, nc_scene, transparency, custom_nc]
 *   → scenes + vocal transparency; NO manual level byte and NO wind byte.
 * - `classic-a3035` / `classic-a3040` carry six bytes and a manual/adaptive
 *   ANC level plus a wind byte; A3040 also has Talk/Manual transparency modes.
 * - `tws-p30i` [ambient, manual<<4|adaptive, ambient, automation, wind,
 *   adaptive_sensitivity, multi_scene]
 *   → level + scenes + wind + adaptive; NO transparency sub-mode
 *   (OpenSCQ30 changelog: "R50i NC should not have transparency modes").
 * - `tws-l4nc` / `tws-p40i` [ambient, manual<<4|adaptive, transparency,
 *   automation, wind, model-specific scene]
 *   → level + vocal + wind + adaptive; P40i also exposes multi-scene ANC.
 * - `tws-l3pro` / `tws-a3936` [ambient, manual<<4|adaptive, transparency,
 *   automation, wind, sensitivity]
 *   → level + vocal + wind + adaptive; no generic scene byte.
 * - `tws-a3062` has custom transparency levels rather than a vocal toggle;
 *   `tws-l4pro` has a slider and wind bit but no generic adaptive scene;
 *   `tws-l5` has vocal transparency, wind and adaptive ANC.
 * - `tws-a3968` has named adaptive ANC, vocal transparency and wind.
 * - `tws-d1202` adds named adaptive ANC, multi-scene ANC, real-time ANC,
 *   vocal transparency and wind.
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
  'classic-a3035': { level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  'classic-a3040': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-p30i': { level: true, scenes: true, transVocal: false, wind: true, adaptive: true },
  'tws-l4nc': { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  'tws-l3pro': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-a3062': { level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  'tws-a3936': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-l4pro': { level: true, scenes: false, transVocal: false, wind: true, adaptive: false },
  'tws-p40i': { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  'tws-l5': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-a3968': { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  'tws-d1202': { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
};

export const NO_ANC_SUB: AncSubFeatures = {
  level: false,
  scenes: false,
  transVocal: false,
  wind: false,
  adaptive: false,
};

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
  /**
   * Custom EQ curves (preset id 0xFEFE). False for A3949 (R50i / P20i /
   * P25i): OpenSCQ30 sets custom_preset_id None for that model and none of
   * the 22 live captures uses FEFE — factory presets only (Phase 18).
   */
  supportsCustomEq: boolean;
  supportsVolume: false;
  supportsGestures: false;
  /** True only when `01:85` is documented for the exact model (see types.ts). */
  supportsFactoryReset: boolean;
  supportsEarbudState: boolean;
  supportsPerEarbudBattery: boolean;
  supportsFirmwareInfo: boolean;
  supportsGaming: boolean;
  supportsSurround: boolean;
  supportsDual: boolean;
  supportsLdac: boolean;
  ancSub: AncSubFeatures;
}

export function deriveCapabilities(profile: DeviceProfile): Capabilities {
  const tws = (profile.kind === 'earbuds' || profile.kind === 'open-ear') && profile.state.batteryRight !== null;
  return {
    supportsNoiseControl: profile.ancLayout !== 'none',
    supportsEqualizer: profile.eqCommand !== null,
    supportsCustomEq: profile.eqCommand !== null && profile.customEq,
    supportsVolume: false,
    supportsGestures: false,
    supportsFactoryReset: profile.factoryReset === true,
    supportsEarbudState: tws,
    supportsPerEarbudBattery: tws,
    // `01:05` (serial + firmware) is implemented by every supported model.
    supportsFirmwareInfo: true,
    supportsGaming: profile.gaming,
    supportsSurround: profile.surround,
    supportsDual: profile.dual,
    supportsLdac: profile.ldac,
    ancSub:
      profile.ancLayout === 'none'
        ? NO_ANC_SUB
        : (() => {
            const layout = ANC_SUB_FEATURES[profile.ancLayout];
            return {
              ...layout,
              // The layout describes which bytes exist; the profile describes
              // which values this exact SKU exposes in its OpenSCQ30 module.
              level: layout.level && profile.ancLevels,
              scenes: layout.scenes && profile.scenes,
              transVocal: layout.transVocal && profile.transparency,
              wind: layout.wind && profile.wind,
              adaptive: layout.adaptive && profile.ancLevels,
            };
          })(),
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
 * device telemetry); `offset` handles models whose first raw step is 1
 * (A3005/A3062/A3957), and `null` means the value is already a percentage
 * (host Bluetooth battery). A level above its scale is passed through clamped
 * rather than rescaled, so firmware that reports percents in a 0..5 slot
 * degrades gracefully instead of showing 1700%.
 */
export function batteryPercent(
  level: number | null,
  scale: number | null | undefined | 'unknown',
  offset = 0,
): number | null {
  if (level === null || level === undefined) return null;
  // A non-finite or negative level is corrupt telemetry, not a charge
  // state: clamping or rescaling it would invent a plausible-looking
  // number (§13). Unavailable is the honest answer.
  if (!Number.isFinite(level) || level < 0) return null;
  if (!Number.isFinite(offset) || offset < 0) return null;
  // 'unknown' scale: the device model is unidentified, so the raw level
  // cannot be interpreted — neither as scale-5 nor scale-10 nor as a
  // percent. A precise-looking number here would be a guess; the honest
  // answer is "unavailable" (raw levels stay visible in diagnostics).
  if (scale === 'unknown') return null;
  // A zero, negative or non-finite scale cannot interpret a raw level and
  // is not a percent passthrough either — it is corrupt profile data.
  // Refuse to guess intent; report unavailable.
  if (scale !== null && scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) return null;
  const adjusted = level + offset;
  if (scale === null || scale === undefined || adjusted > scale) {
    return Math.max(0, Math.min(100, Math.round(adjusted)));
  }
  return Math.round((adjusted * 100) / scale);
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

export interface EarbudState {
  left: EarbudSide;
  right: EarbudSide;
  connection: EarbudConnectionState;
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
    batteryScale: null,
    presence: 'unknown',
  };
}

/** One decoded battery-bearing frame (`01:01` state blob or `01:03` query). */
export interface BatteryFrame {
  rawLeft: number | undefined;
  rawRight: number | undefined;
  /** Only `01:01`/`01:04` carry charging bits; `01:03` leaves them unset. */
  /** `null` means the field was present but not a strict 0/1 boolean. */
  chargingLeft?: boolean | null;
  chargingRight?: boolean | null;
  /**
   * The model's raw-level maximum (0..5 / 0..10), null for percents, or
   * 'unknown' when the device model — and therefore the scale — is unknown.
   */
  scale: number | null | 'unknown';
  /** Raw-level offset applied by the matched model before percent scaling. */
  offset?: number;
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
  const side = (raw: number | undefined) => {
    const level = batteryLevel(raw);
    return {
      trusted: level !== null,
      level,
    };
  };
  const l = side(frame.rawLeft);
  const r = side(frame.rawRight);
  return {
    left: l.level,
    right: r.level,
    // `undefined` means this frame legitimately carried no charging field, so
    // keep the last confirmed value. `null` means a charging field was present
    // but malformed, so clear it rather than retaining a misleading `true`.
    leftCharging: l.trusted ? frame.chargingLeft === undefined ? previous.leftCharging : frame.chargingLeft : undefined,
    rightCharging: r.trusted ? frame.chargingRight === undefined ? previous.rightCharging : frame.chargingRight : undefined,
    batteryScale: frame.scale,
    batteryOffset: frame.offset ?? previous.batteryOffset ?? 0,
    // Host-reported percentage is independent from the device's raw
    // telemetry and must survive protocol refreshes for the dedicated
    // Windows/Linux battery box.
    hostPercent: previous.hostPercent ?? null,
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
    return { left: unavailable, right: unavailable, connection: 'unavailable', supported: false };
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
      battery:
        state === 'connected'
          ? batteryPercent(raw, battery.batteryScale, battery.batteryOffset ?? 0)
          : null,
      charging: state === 'connected' && charging !== undefined && charging !== null ? charging : null,
    };
  };

  return { left: side('left'), right: side('right'), connection: presence, supported: true };
}

/* ------------------------------------------------------------------ */
/* Sound-mode mirror (`06:01`) — the device confirming its own ANC     */
/* ------------------------------------------------------------------ */

/** What a `06:01` device mirror confirms; absent fields stay untouched. */
export interface SoundModeReport {
  mode: AncMode;
  /** Manual ANC level 1..5 when the layout carries one in the high nibble. */
  level?: number;
  /** Scene selector where the model layout carries one. */
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
  if (layout === 'none') return null;
  const minimumLength: Record<Exclude<AncLayout, 'none'>, number> = {
    classic: 4,
    'classic-a3035': 6,
    'classic-a3040': 6,
    'tws-p30i': 7,
    'tws-l4nc': 7,
    'tws-l3pro': 6,
    'tws-a3062': 6,
    'tws-a3936': 6,
    'tws-l4pro': 4,
    'tws-p40i': 7,
    'tws-l5': 7,
    'tws-a3968': 6,
    'tws-d1202': 8,
  };
  if (payload.length < minimumLength[layout]) return null;
  const b0 = payload[0];
  if (b0 !== 0x00 && b0 !== 0x01 && b0 !== 0x02) return null;
  const report: SoundModeReport = {
    mode: b0 === 0x00 ? 'anc' : b0 === 0x01 ? 'transparency' : 'normal',
  };
  const manual = (payload[1] >> 4) & 0x0f;
  if (layout === 'tws-l4pro' && payload[1] >= 1 && payload[1] <= 5) {
    report.level = 6 - payload[1];
  } else if (layout === 'tws-l4pro' && payload[1] >= 7 && payload[1] <= 11) {
    report.level = payload[1] - 6;
  } else if (manual >= 1 && manual <= 5) {
    report.level = manual;
  }
  // TWS sound-mode mirrors carry the automation selector at byte 3:
  // 01 means Adaptive ANC. Preserve that device-confirmed state instead of
  // reducing every ANC mirror to manual ANC.
  if (
    b0 === 0x00 &&
    (
      layout === 'tws-p30i' ||
      layout === 'tws-l4nc' ||
      layout === 'tws-l3pro' ||
      layout === 'tws-a3062' ||
      layout === 'tws-a3936' ||
      layout === 'tws-p40i' ||
      layout === 'tws-l5' ||
      layout === 'tws-a3968' ||
      layout === 'tws-d1202' ||
      layout === 'classic-a3035' ||
      layout === 'classic-a3040'
    ) &&
    payload.length >= 4 &&
    payload[3] === 0x01
  ) {
    report.mode = 'adaptive';
  }
  if (
    (layout === 'tws-l4nc' || layout === 'tws-a3936' || layout === 'tws-p40i' || layout === 'tws-l5' || layout === 'tws-a3968' || layout === 'tws-d1202') &&
    payload.length >= 5
  ) {
    report.transVocal = (payload[2] & 0x01) !== 0;
    report.wind = (payload[4] & 0x01) !== 0;
  } else if (
    (layout === 'tws-p30i' || layout === 'tws-l3pro' || layout === 'tws-a3062' || layout === 'classic-a3035' || layout === 'classic-a3040') &&
    payload.length >= 5
  ) {
    report.wind = (payload[4] & 0x01) !== 0;
    if (layout === 'classic-a3040') report.transVocal = payload[2] === 0x00;
  } else if (layout === 'tws-l4pro' && payload.length >= 4) {
    report.wind = (payload[3] & 0x01) !== 0;
  }
  if (layout === 'classic' && payload.length >= 4) {
    report.transVocal = (payload[2] & 0x01) !== 0;
    const scene = payload[1];
    report.scene = scene === 0x00 ? 'transport' : scene === 0x02 ? 'indoor' : 'outdoor';
  } else if (layout === 'tws-p30i' || layout === 'tws-p40i' || layout === 'tws-d1202') {
    const scene = payload.length >= 7 ? payload[6] : 0;
    report.scene = scene === 0x00 ? 'transport' : scene === 0x02 ? 'indoor' : 'outdoor';
  } else if (layout === 'tws-l4nc' && payload.length >= 7) {
    const scene = payload[6];
    report.scene = scene === 0x00 ? 'transport' : 'outdoor';
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
  /** Host Bluetooth stack reports the device as currently connected. */
  connected?: boolean;
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
  'No paired Soundcore devices found. Pair them once in this computer’s Bluetooth settings, then keep them connected and try again.';

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
