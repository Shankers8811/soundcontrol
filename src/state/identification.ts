import { DEVICES } from '../protocol/devices';
import type { DeviceProfile } from '../types';

export type IdentificationState = 'not-connected' | 'uncertain' | 'mismatch' | 'verified';

/** A manual choice is a per-address candidate, never an authorization to send commands. */
export function verifiedCandidate(id: string): DeviceProfile | null {
  return DEVICES.find((d) => d.id === id && d.verified) ?? null;
}

/** Manual suggestions from another Bluetooth address cannot follow a device switch. */
export function candidateForAddress(
  candidates: Readonly<Record<string, string>>,
  mac: string | null,
): DeviceProfile | null {
  return mac ? verifiedCandidate(candidates[mac.toUpperCase()] ?? '') : null;
}

/** A newly confirmed automatic identity invalidates the manual suggestion for THIS address. */
export function discardCandidateOnAutomaticVerification(
  candidates: Readonly<Record<string, string>>,
  mac: string | null,
): Record<string, string> {
  if (!mac || !Object.hasOwn(candidates, mac.toUpperCase())) return candidates;
  const next = { ...candidates };
  delete next[mac.toUpperCase()];
  return next;
}

export function identificationState(
  connected: boolean,
  automatic: DeviceProfile,
  confirmedLayout: boolean,
  candidate: DeviceProfile | null,
): IdentificationState {
  if (!connected) return 'not-connected';
  // A candidate never displaces a subsequently confirmed automatic profile.
  if (automatic.verified && confirmedLayout) return 'verified';
  // A disagreement with a *tentative* automatic match stays visible until
  // validated telemetry either confirms the automatic profile or the user resets.
  if (candidate && automatic.verified && candidate.id !== automatic.id) return 'mismatch';
  return 'uncertain';
}
