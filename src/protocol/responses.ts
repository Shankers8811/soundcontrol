import type { StateOffsets } from '../types';

/* -------------------------------------------------------------------------- */
/* Phase 18 — response validation + device-session isolation helpers          */
/* -------------------------------------------------------------------------- */

/**
 * Session isolation (Task 13). One connection owns the parsed device state:
 * when it ends — explicit disconnect, link-down, or a new connect starting —
 * every still-queued frame from the OLD session must be dropped, so
 * telemetry from device A can never update the state of device B (or the
 * post-disconnect UI).
 *
 * Usage: the store calls `begin()` when a connect attempt starts and keeps
 * the returned id; the rx callback checks `isActive(id)` before parsing;
 * `end()` invalidates everything (late frames from any session are dropped).
 */
export interface DeviceSessionGuard {
  /** Start a new session; invalidates the previous one. Returns its id. */
  begin(): number;
  /** Invalidate all sessions (disconnect / link-down). */
  end(): void;
  /** True only when `id` is the currently active session. */
  isActive(id: number): boolean;
}

export function createSessionGuard(): DeviceSessionGuard {
  let seq = 0;
  let active: number | null = null;
  return {
    begin: () => {
      active = ++seq;
      return active;
    },
    end: () => {
      active = null;
    },
    isActive: (id: number) => active !== null && active === id,
  };
}

/* ------------------------------------------------------- firmware parsing */

/** Parse one "XX.XX" ASCII firmware string into a comparable [major, minor]. */
function parseFirmwarePart(text: string): [number, number] | null {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function compareFirmware(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * True when BOTH halves of a dual-firmware ASCII string (e.g. "01.5901.59",
 * left bud then right bud) are at least `minimum` ("01.60"). This mirrors
 * OpenSCQ30's a3959 rule: the gaming byte is only meaningful when
 * `dual_firmware_version.min() >= 01.60`. Unparseable firmware ⇒ false
 * (fail closed: the byte is not trusted).
 */
export function dualFirmwareAtLeast(dualFirmwareAscii: string, minimum: string): boolean {
  if (dualFirmwareAscii.length !== 10) return false;
  const left = parseFirmwarePart(dualFirmwareAscii.slice(0, 5));
  const right = parseFirmwarePart(dualFirmwareAscii.slice(5, 10));
  const min = parseFirmwarePart(minimum);
  if (!left || !right || !min) return false;
  const lower = compareFirmware(left, right) <= 0 ? left : right;
  return compareFirmware(lower, min) >= 0;
}

/* --------------------------------------------- device toggle mirror (19) */

export interface DeviceToggleMirror {
  /** Gaming-mode flag straight from the device state, or null when this
   *  model/state does not report it (or the firmware gate says untrustworthy). */
  gaming: boolean | null;
  /** 3D Surround flag from the device state, or null. */
  surround: boolean | null;
  /** Dual-connections flag from the device state, or null. */
  dual: boolean | null;
}

/**
 * Extract the feature-toggle flags a model mirrors inside its `01:01` state
 * update (Phase 18, Task 19 — device-confirmed state instead of
 * optimistic-only). Offsets come from OpenSCQ30's a3949/a3959
 * state_update.rs parse chains (see src/protocol/devices.ts):
 *
 *   A3949: gaming at 65 (no surround/dual — the model has neither feature).
 *   A3959: dual at 73, surround at 74, gaming at 78 (Phase 20) — the gaming byte only
 *          when both buds run firmware >= 01.60 (OpenSCQ30 firmware gate).
 *
 * A byte outside the payload, or an untrustworthy one, yields null — the
 * previous UI state stands and the store logs the honest
 * "Command sent — device confirmation unavailable" wording instead.
 */
export function parseDeviceToggles(payload: Uint8Array, state: StateOffsets): DeviceToggleMirror {
  const readFlag = (at: number | null | undefined): boolean | null =>
    typeof at === 'number' && payload.length > at ? payload[at] !== 0x00 : null;

  let gaming = readFlag(state.gaming);
  if (gaming !== null && state.gamingMinFirmware) {
    const fw =
      state.firmware && payload.length >= state.firmware.at + state.firmware.length
        ? asciiSlice(payload, state.firmware.at, state.firmware.length)
        : '';
    if (!dualFirmwareAtLeast(fw, state.gamingMinFirmware)) gaming = null;
  }
  return { gaming, surround: readFlag(state.surround), dual: readFlag(state.dualConnections) };
}

/** ASCII slice that tolerates non-printable bytes (they become spaces). */
function asciiSlice(data: Uint8Array, at: number, length: number): string {
  let out = '';
  for (let i = at; i < Math.min(at + length, data.length); i++) {
    out += data[i] >= 0x20 && data[i] <= 0x7e ? String.fromCharCode(data[i]) : ' ';
  }
  return out;
}
