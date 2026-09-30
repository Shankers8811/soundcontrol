import { DEVICES } from '../protocol/devices';
import type { DeviceProfile } from '../types';

export type IdentificationState = 'not-connected' | 'uncertain' | 'mismatch' | 'verified';

/** A manual choice is a per-address candidate, never an authorization to send commands. */
export function verifiedCandidate(id: string): DeviceProfile | null {
  return DEVICES.find((d) => d.id === id && d.verified) ?? null;
}

export function identificationState(
  connected: boolean,
  automatic: DeviceProfile,
  confirmedLayout: boolean,
  candidate: DeviceProfile | null,
): IdentificationState {
  if (!connected) return 'not-connected';
  if (candidate && automatic.verified && candidate.id !== automatic.id) return 'mismatch';
  return automatic.verified && confirmedLayout ? 'verified' : 'uncertain';
}
