/**
 * A3959 / P30i ANC action sequencer (Phase 20).
 *
 * Why this module exists: the physical failure is not observable in the UI, so
 * the *sequence* itself has to be reviewable and machine-checked. This is a
 * pure orchestrator — no React, no transport, no timers of its own — that the
 * store drives with real callbacks and that tests drive with fakes.
 *
 * The steps are the ones the evidence supports (docs/PHASE-20-FINAL-REPORT.md):
 *
 *   1. read FRESH device state (`01:01`) — a rebuilt frame from remembered
 *      state is never sent;
 *   2. build the target state from that fresh read, preserving the fields this
 *      action does not touch;
 *   3. send each one-field transition the A3959 dependency rules require, and
 *      wait for that command's own reply before the next write;
 *   4. read state again and compare the device's report with what was
 *      requested — the device report is the only source of "confirmed".
 *
 * Deliberately NOT here (no evidence; see the Phase 20 suggested-patch audit):
 * fixed sleeps between frames, a synthetic `01:05` "initialization" frame, an
 * extra `01:01` "commit" frame, and any retry that could double-apply a mode
 * change behind the user's back. A write result is never treated as a device
 * confirmation.
 */
import type { AncScene } from '../types';

export interface P30iActionMeta {
  channel: number | null;
  session: string | null;
}

export interface P30iActionDeps {
  /** Fresh, validated 7-byte sound-mode block from the device (`01:01`).
   *  `phase` only labels the diagnostic log line (pre-read vs read-back). */
  readState(phase: 'pre' | 'post'): Promise<Uint8Array>;
  /** Build the target 7-byte block from the fresh current block. */
  buildTarget(current: Uint8Array): Uint8Array;
  /** Resolves when the RFCOMM write completed (TX_SENT), not when the device answered. */
  write(frame: Uint8Array): Promise<void>;
  /** Resolves on the device's own reply for this exact command, or rejects on timeout. */
  awaitReply(frame: Uint8Array, command: '06:81' | '01:01'): Promise<void>;
  /** True while this device session still owns the transport. */
  settled(): boolean;
  meta(): P30iActionMeta;
  log(line: string): void;
}

export interface P30iActionRequest {
  mode: string;
  level: number;
  scene: AncScene;
  wind: boolean;
  /** Short human description used in the ANC_ACTION log line. */
  label: string;
}

export interface P30iActionResult {
  steps: number;
  before: Uint8Array;
  target: Uint8Array;
  after: Uint8Array;
  confirmed: boolean;
}

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

/** `plan` is injected so this module stays independent of the frame builder. */
export type P30iPlanner = (from: Uint8Array, to: Uint8Array) => Uint8Array[];
/** `match` is injected so this module stays independent of the response parser. */
export type P30iMatcher = (actual: Uint8Array, requested: Uint8Array) => boolean;

export async function runP30iAncAction(
  deps: P30iActionDeps,
  request: P30iActionRequest,
  plan: P30iPlanner,
  match: P30iMatcher,
): Promise<P30iActionResult> {
  const meta = deps.meta();
  const context =
    `MODEL=A3959 PROFILE=p30i MODE=${request.mode} LEVEL=${request.level} ` +
    `SCENE=${request.scene} WIND=${request.wind} RFCOMM_CHANNEL=${meta.channel ?? 'UNKNOWN'} ` +
    `SESSION=${meta.session ?? 'UNAVAILABLE'}`;

  // Request line first: it must be visible even when the state read is what fails.
  deps.log(`ANC_ACTION ${context} FRAME=NOT_CONSTRUCTED — request; fresh device state required before any A3959 write`);

  const before = await deps.readState('pre');
  if (!deps.settled()) throw new Error('Device session changed before the write');

  const target = deps.buildTarget(before);
  const steps = plan(before, target);

  for (const step of steps) {
    if (!deps.settled()) throw new Error('Device session changed mid-sequence');
    deps.log(`ANC_ACTION ${context} FRAME=${hex(step)} — source-derived one-field transition, physical effect unverified`);
    // Attach both handlers together: a reply can arrive before TX_SENT resolves.
    await Promise.all([deps.write(step), deps.awaitReply(step, '06:81')]);
    deps.log('Device 06:81 reply received — an acknowledgement is not a sound-mode report and not acoustic confirmation');
  }

  if (!deps.settled()) throw new Error('Device session changed before the confirmation read');
  deps.log(`ANC_ACTION ${context} FRAME=STATE_READ_BACK — verifying what the device actually reports`);

  const after = await deps.readState('post');
  return { steps: steps.length, before, target, after, confirmed: match(after, target) };
}
