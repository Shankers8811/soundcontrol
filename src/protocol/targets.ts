import type { Transport } from '../types';
import { checksum } from './codec';

/* -------------------------------------------------------------------------- */
/* Command targets — the Phase 17 control boundary                            */
/* -------------------------------------------------------------------------- */

/**
 * SOUND CONTROL = EAR BUD / HEADPHONE DEVICE CONTROL — never Windows audio.
 *
 * Every outbound command carries an explicit target. There are exactly two
 * possible targets, and only one of them is legal for user-facing features:
 *
 *   - `earbud`      — the connected earbud/headphone device, over its own
 *                     supported Soundcore RFCOMM protocol.
 *   - `windows-host`— the Windows PC itself. NO user-facing audio command
 *                     may ever target it: SoundControl must not touch the
 *                     Windows master/per-app/output/input volume, mute state,
 *                     default devices, endpoints, Sound settings, mixer,
 *                     enhancements, spatial sound, Bluetooth settings, or any
 *                     registry audio configuration. The target exists as a
 *                     type so the boundary is explicit, and the registry below
 *                 is typed so that it can only ever hold `earbud` commands.
 *
 * Windows may only be touched for application infrastructure: discovering and
 * connecting the Bluetooth transport (read-only PnP enumeration), the local
 * helper process, and app lifecycle (windows, tray, logs, autostart policy).
 *
 * Enforcement is layered (a UI bug must not be able to smuggle a host-audio
 * action past this boundary):
 *
 *   1. `validateOutboundFrame()` below rejects any frame that is not a
 *      recognized, registry-listed Soundcore earbud command — see
 *      `withEarbudOnlyBoundary()`, which wraps every transport the store
 *      installs, so ALL writes (UI actions, connect handshake, background
 *      polls, the diagnostics console) pass through it.
 *   2. The Windows helper (`soundcore_bridge.py`) independently re-validates
 *      every `tx` frame against the same command set before transmitting it
 *      on the RFCOMM socket — so even a buggy or hostile renderer cannot make
 *      the helper send anything but recognized earbud commands.
 *   3. The helper contains no Windows audio APIs at all: its only device I/O
 *      is the Bluetooth RFCOMM socket to the earbuds.
 */

/** The only two destinations a SoundControl command can address. */
export type CommandTarget = 'earbud' | 'windows-host';

/**
 * A user-facing command that modifies Windows-host audio state. This type is
 * deliberately uninhabited: no such command exists, and adding one violates
 * the product boundary. `WINDOWS_HOST_AUDIO_COMMANDS` below is the runtime
 * proof — it must stay empty.
 */
export type WindowsHostAudioCommand = never;

/**
 * The registry of commands that DO exist. Empty by policy and by test: any
 * entry here would be a host-audio command reaching the UI, which the
 * earbud-only boundary forbids.
 */
export const WINDOWS_HOST_AUDIO_COMMANDS: readonly WindowsHostAudioCommand[] = [];

/** A recognized earbud command: the frame(s) that implement it, and its target. */
export interface EarbudCommandSpec {
  /** Stable command id, e.g. `sound-modes.set` (used in logs and tests). */
  id: string;
  /** Human-readable description for diagnostics. */
  label: string;
  /**
   * Explicit target. The literal type makes `windows-host` a compile error
   * here — host-targeted commands cannot be registered, only rejected.
   */
  target: 'earbud';
  /** Soundcore frame keys (`CAT:TYPE`, uppercase hex) that carry this command. */
  frames: readonly string[];
}

/**
 * Every supported earbud command, with the frame(s) that implement it.
 * Mirrors PROTOCOL.md and OpenSCQ30's command table; the Python helper's
 * `TX_ALLOWED_FRAMES` is the same set (cross-checked by tests on both sides).
 */
export const EARBUD_COMMANDS: readonly EarbudCommandSpec[] = [
  { id: 'state.request', label: 'Handshake / state request', target: 'earbud', frames: ['01:01'] },
  { id: 'battery.query', label: 'Battery level query', target: 'earbud', frames: ['01:03'] },
  { id: 'charging.query', label: 'Charging state query', target: 'earbud', frames: ['01:04'] },
  { id: 'device.info', label: 'Serial + firmware query', target: 'earbud', frames: ['01:05'] },
  { id: 'device.factory-reset', label: 'Factory reset', target: 'earbud', frames: ['01:85'] },
  { id: 'game-mode.set', label: 'Gaming / low-latency mode', target: 'earbud', frames: ['01:87'] },
  { id: 'game-mode.set-a3947', label: 'Gaming mode (Liberty 4 NC variant)', target: 'earbud', frames: ['10:85'] },
  { id: 'ldac.query', label: 'LDAC codec state query', target: 'earbud', frames: ['01:7F'] },
  { id: 'ldac.set', label: 'LDAC codec enable/disable', target: 'earbud', frames: ['01:FF'] },
  { id: 'equalizer.set', label: 'Equalizer preset/bands', target: 'earbud', frames: ['02:81'] },
  { id: 'equalizer.set-drc', label: 'Equalizer with DRC (TWS models)', target: 'earbud', frames: ['02:83'] },
  { id: 'surround.set', label: '3D Surround Sound toggle', target: 'earbud', frames: ['02:86'] },
  { id: 'sound-modes.set', label: 'ANC / transparency / wind noise modes', target: 'earbud', frames: ['06:81'] },
  { id: 'dual-audio.set', label: 'Dual audio enable/disable', target: 'earbud', frames: ['0B:84'] },
];

/** cat:type → command spec. One frame key maps to exactly one command. */
const FRAME_INDEX: ReadonlyMap<string, EarbudCommandSpec> = new Map(
  EARBUD_COMMANDS.flatMap((c) => c.frames.map((f) => [f, c] as const)),
);

/**
 * The complete set of frame keys the application may transmit — the contract
 * shared with the Windows helper (`TX_ALLOWED_FRAMES` in soundcore_bridge.py).
 */
export const EARBUD_COMMAND_FRAME_KEYS: readonly string[] = [...FRAME_INDEX.keys()].sort();

/** Resolve the earbud command a `CAT:TYPE` frame key implements, if any. */
export function commandForFrameKey(key: string): EarbudCommandSpec | undefined {
  return FRAME_INDEX.get(key.toUpperCase());
}

export type OutboundFrameCheck =
  | { ok: true; command: EarbudCommandSpec }
  | { ok: false; reason: string };

/**
 * Validate an outbound frame BEFORE transmission (Phase 17, Task 3).
 *
 * A frame may only be sent when it is provably a *recognized supported earbud
 * command*: a structurally valid Soundcore frame (header, coherent length,
 * checksum) whose CAT:TYPE is registered in `EARBUD_COMMANDS` and whose
 * resolved target is `earbud`. Everything else — garbage bytes, a corrupted
 * frame, or an unknown command — is rejected here and never reaches the
 * transport, whatever the UI asked for.
 */
export function validateOutboundFrame(data: Uint8Array): OutboundFrameCheck {
  if (data.length < 10) {
    return { ok: false, reason: 'not a Soundcore earbud protocol frame (too short)' };
  }
  if (data[0] !== 0x08 || data[1] !== 0xee || data[2] !== 0x00 || data[3] !== 0x00 || data[4] !== 0x00) {
    return { ok: false, reason: 'not a Soundcore earbud protocol frame (bad header)' };
  }
  const total = data[7] | (data[8] << 8);
  if (total !== data.length) {
    return { ok: false, reason: `length field (${total}) does not match the frame (${data.length} bytes)` };
  }
  if (checksum(data, data.length - 1) !== data[data.length - 1]) {
    return { ok: false, reason: 'checksum mismatch' };
  }
  const key = `${data[5].toString(16).toUpperCase().padStart(2, '0')}:${data[6].toString(16).toUpperCase().padStart(2, '0')}`;
  const command = FRAME_INDEX.get(key);
  if (!command) {
    return {
      ok: false,
      reason: `not a recognized supported earbud command (${key}) — rejected by the earbud-only control boundary`,
    };
  }
  // Defense in depth: even if a host-targeted entry were ever (illegally)
  // added to the registry, it still may not be transmitted.
  if ((command as { target?: CommandTarget }).target !== 'earbud') {
    return { ok: false, reason: `command ${command.id} targets the Windows host — never transmitted` };
  }
  return { ok: true, command };
}

/**
 * Wrap a transport so that every write is validated against the earbud
 * command registry before it can reach the wire (Phase 17, Task 3).
 *
 * This is the single choke point for the renderer: the store installs every
 * transport through `attach()`, and `attach()` wraps it here — so UI actions,
 * the connect handshake, background battery polls and the diagnostics console
 * all pass the same check. `onBlock` is called (once per rejected write) with
 * the rejection reason so the diagnostics log records the block.
 */
export function withEarbudOnlyBoundary(
  t: Transport,
  onBlock: (reason: string) => void = () => {},
): Transport {
  return {
    kind: t.kind,
    label: t.label,
    async write(data: Uint8Array): Promise<void> {
      const check = validateOutboundFrame(data);
      if (!check.ok) {
        onBlock(check.reason);
        throw new Error(`BLOCKED — ${check.reason}`);
      }
      return t.write(data);
    },
    close(): Promise<void> {
      return t.close();
    },
  };
}
