import type { DeviceKind } from '../types';
import { IconEarbudLeft, IconEarbudRight, IconHeadset, IconNeckband } from './Icons';

export function deviceKindLabel(kind: DeviceKind): string {
  if (kind === 'earbuds') return 'Earbuds';
  if (kind === 'neckband') return 'Neckband';
  return 'Headset';
}

/**
 * Device-family artwork is derived from the exact matched profile, not from
 * whether the Bluetooth link happens to be connected. This keeps a TWS pair
 * as separate left/right hardware and keeps a single-body neckband from being
 * presented as an over-ear headset.
 */
export function DeviceTypeVisual({ kind, size = 34 }: { kind: DeviceKind; size?: number }) {
  if (kind === 'earbuds') {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label="Left and right earbuds">
        <IconEarbudLeft size={size} />
        <IconEarbudRight size={size} />
      </span>
    );
  }

  if (kind === 'neckband') {
    return (
      <span role="img" aria-label="Neckband earphones">
        <IconNeckband size={size * 1.35} />
      </span>
    );
  }

  return (
    <span role="img" aria-label="Over-ear headset">
      <IconHeadset size={size * 1.15} />
    </span>
  );
}
