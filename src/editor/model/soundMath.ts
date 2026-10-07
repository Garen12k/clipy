/**
 * The sample maths of a sound render. Twin: modules/clipy-video/ios/SoundMath.swift — keep the constants and formulas identical
 * (guarded by __tests__/soundMath.parity.test.ts). The app never runs this on samples; it is here so the numbers are tested.
 */
/** Even out loudness: the RMS level a sound is brought to, the level under which a block counts as silence, and how far the gain may go. */
export const LEVEL = { targetDb: -18, gateDb: -45, maxBoostDb: 18, maxCutDb: 6, blockSeconds: 0.4 } as const;
/** The peak guard: samples up to `knee` pass unchanged, louder ones bend towards `ceiling` and never pass it. */
export const SOFT_CLIP = { knee: 0.9, ceiling: 0.98 } as const;

export const dbToGain = (db: number): number => (Number.isFinite(db) ? Math.pow(10, db / 20) : 1);

/**
 * The gain in dB that brings a sound to LEVEL.targetDb. `blocks` = the mean square of each LEVEL.blockSeconds of the mono mix.
 * Blocks that are not a number or not above the gate are left out; none left → 0 (silence is not boosted).
 */
export function levelGainDb(blocks: readonly number[]): number {
  const gate = Math.pow(10, LEVEL.gateDb / 10);
  let sum = 0, count = 0;
  for (const b of blocks) if (Number.isFinite(b) && b > gate) { sum += b; count += 1; }
  if (count === 0) return 0;
  const measured = 10 * Math.log10(sum / count);
  return Math.min(LEVEL.maxBoostDb, Math.max(-LEVEL.maxCutDb, LEVEL.targetDb - measured));
}

/** One sample through the peak guard. Not a number → 0. */
export function softClip(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const a = Math.abs(x);
  if (a <= SOFT_CLIP.knee) return x;
  const room = SOFT_CLIP.ceiling - SOFT_CLIP.knee;
  const y = SOFT_CLIP.knee + room * Math.tanh((a - SOFT_CLIP.knee) / room);
  return x < 0 ? -y : y;
}
