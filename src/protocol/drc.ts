/**
 * Soundcore TWS dynamic-range compensation.
 *
 * The `02:83` equalizer frame used by the P20i / P25i / R50i / P30i / A20i
 * family carries **two** 10-band channels: the first is the curve the user
 * picked, the second is the same curve after the DSP's cross-band
 * compensation. Sending the raw curve twice is not equivalent — the device
 * applies the second channel.
 *
 * Ported from OpenSCQ30 `common/structures/volume_adjustments.rs`
 * (`VolumeAdjustments::apply_drc`) and validated against all 22 factory
 * presets captured live from a P20i in
 * victor-oliveira1/soundcore_anker_equalyzer: the computed second channel
 * matches those captures byte for byte (see scripts/verify-protocol.mjs).
 */

const SMALLER_COEFFICIENT = 0.85;
const LARGER_COEFFICIENT = 0.95;

/** 8×8 cross-band matrix, indexed [output band][input band]. */
const BAND_COEFFICIENTS: number[][] = [
  [1.26, -0.71 * SMALLER_COEFFICIENT, 0.177, -0.0494, 0.0345, -0.0197, 0.0075, -0.00217],
  [-0.71 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, 0.0, 0.204, -0.068, 0.045, -0.0235, 0.0075],
  [0.177, -0.81 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, -0.81 * SMALLER_COEFFICIENT, 0.208, -0.07, 0.045, -0.0197],
  [-0.0494, 0.204, 0.0, 1.73 * LARGER_COEFFICIENT, -0.82 * SMALLER_COEFFICIENT, 0.208, -0.068, 0.0345],
  [0.0345, -0.068, 0.208, -0.82 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, 0.0, 0.204, -0.0494],
  [-0.0197, 0.045, -0.07, 0.208, -0.81 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, -0.81 * SMALLER_COEFFICIENT, 0.177],
  [0.0075, -0.0235, 0.045, -0.068, 0.204, 0.0, 1.83 * LARGER_COEFFICIENT, -0.71 * SMALLER_COEFFICIENT],
  [-0.00217, 0.0075, -0.0197, 0.0345, -0.0494, 0.177, -0.71 * SMALLER_COEFFICIENT, 1.5],
];

/** Bands 9+ are not DRC-processed; these are the values the app restores. */
const BAND_DEFAULTS = [0, 0, 0, 0, 0, 0, 0, 0, 0, -120];

const MIN_ADJUSTMENT = -120;
const MAX_ADJUSTMENT = 134;

/** Tenths of a dB, exactly as they travel on the wire (byte − 120). */
export type BandAdjustments = number[];

function clampAdjustment(value: number): number {
  return Math.max(MIN_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, value));
}

/**
 * Apply the DSP compensation to an 8-band curve, returning 10 band values in
 * wire units. Input may be 8 or 10 entries; only the first 8 are processed.
 */
export function applyDrc(adjustments: BandAdjustments): BandAdjustments {
  const scaled = adjustments.slice(0, 8).map((value) => value / 10);
  while (scaled.length < 8) scaled.push(0);

  // Two output bands replace an input band's contribution with a subtraction
  // of that band's own scaled value instead of multiplying it.
  const lowsSubtraction = scaled[2] * 0.81 * SMALLER_COEFFICIENT;
  const highsSubtraction = scaled[5] * 0.81 * SMALLER_COEFFICIENT;

  const out: number[] = [];
  for (let band = 0; band < 8; band++) {
    const coefficients = BAND_COEFFICIENTS[band];
    let acc = 0;
    for (let i = 0; i < 8; i++) {
      if ((band === 1 || band === 3) && i === 2) {
        acc -= lowsSubtraction;
      } else if ((band === 4 || band === 6) && i === 5) {
        acc -= highsSubtraction;
      } else {
        acc += scaled[i] * coefficients[i];
      }
    }
    out.push(clampAdjustment(Math.round((acc / 10) * 10)));
  }
  for (let i = 8; i < 10; i++) out.push(BAND_DEFAULTS[i]);
  return out;
}

/** Wire byte for a band adjustment: `0x78` is 0 dB, 10 units per dB. */
export function adjustmentToByte(adjustment: number): number {
  return (clampAdjustment(Math.round(adjustment)) + 120) & 0xff;
}

/** Inverse of {@link adjustmentToByte}. */
export function byteToAdjustment(byte: number): number {
  return (byte & 0xff) - 120;
}
