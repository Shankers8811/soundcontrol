/**
 * Pure device-state derivations shared by every UI page.
 *
 * No React and no DOM in this module on purpose: `scripts/test_ui_state.mjs`
 * bundles it with esbuild and asserts the whole capability / earbud-state /
 * battery / connection-phase / scan matrix deterministically, without a UI
 * test framework. Every rule here is derived from PROTOCOL.md and the
 * per-model profiles in `src/protocol/devices.ts` — nothing is guessed.
 */
import type { AncLayout, BatteryState, DeviceProfile, EarbudPresence } from '../types';

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
  supportsFirmwareInfo: boolean;
  supportsGaming: boolean;
  supportsSurround: boolean;
  supportsDual: boolean;
  supportsLdac: boolean;
  ancSub: AncSubFeatures;
}

export function deriveCapabilities(profile: DeviceProfile): Capabilities {
  const tws = profile.kind === 'earbuds' && profile.state.batteryRight !== null;
  return {
    supportsNoiseControl: profile.ancLayout !== 'none',
    supportsEqualizer: profile.eqCommand !== null,
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
    ancSub: profile.ancLayout === 'none' ? NO_ANC_SUB : ANC_SUB_FEATURES[profile.ancLayout],
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
  return value === undefined || value === 0xff || value > 100 ? null : value;
}

/**
 * Level → percent. `scale` is the model's raw maximum (5 or 10 steps for
 * device telemetry); `null` means the value is already a percentage (Windows
 * PnP battery). A level above its scale is passed through clamped rather
 * than rescaled, so firmware that reports percents in a 0..5 slot degrades
 * gracefully instead of showing 1700%.
 */
export function batteryPercent(level: number | null, scale: number | null | undefined): number | null {
  if (level === null || level === undefined) return null;
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
 * bud is not connected to the host. When only one byte exists (over-ears,
 * truncated frames) the per-side status is *unknown* — never "disconnected".
 */
export function presenceFromRaw(rawLeft: number | undefined, rawRight: number | undefined): EarbudPresence {
  if (rawLeft === undefined || rawRight === undefined) return 'unknown';
  const left = rawLeft !== 0xff;
  const right = rawRight !== 0xff;
  if (left && right) return 'both';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

export type SideConnection = 'connected' | 'disconnected' | 'unknown';

export interface EarbudSide {
  connection: SideConnection;
  /** Percent, or null when unavailable (never invented). */
  battery: number | null;
  /** Null when the device never reported a charging flag for this side. */
  charging: boolean | null;
}

export interface EarbudState {
  left: EarbudSide;
  right: EarbudSide;
}

/**
 * Per-side earbud state for the Earbud Connection card, or null when the
 * profile has no independent left/right hardware (over-ears) — callers must
 * then not render per-side status at all.
 *
 * `unknown` presence yields `unknown` sides ("Status unavailable"), which is
 * deliberately distinct from `disconnected` ("Not connected"): presence is
 * only known once the device answered a battery/state frame with both side
 * bytes. Battery is only shown for a side the device reports as connected,
 * so a stale pre-disconnect level can never appear next to "Not connected".
 */
export function deriveEarbudState(battery: BatteryState, caps: Capabilities): EarbudState | null {
  if (!caps.supportsEarbudState) return null;
  const presence: EarbudPresence = battery.presence ?? 'unknown';

  const side = (which: 'left' | 'right'): EarbudSide => {
    let connection: SideConnection;
    if (presence === 'unknown') connection = 'unknown';
    else if (presence === 'both') connection = 'connected';
    else if (presence === 'none') connection = 'disconnected';
    else connection = presence === which ? 'connected' : 'disconnected';

    const raw = which === 'left' ? battery.left : battery.right;
    const charging = which === 'left' ? battery.leftCharging : battery.rightCharging;
    return {
      connection,
      battery: connection === 'connected' ? batteryPercent(raw, battery.batteryScale) : null,
      charging: connection === 'connected' && charging !== undefined ? charging : null,
    };
  };

  return { left: side('left'), right: side('right') };
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
