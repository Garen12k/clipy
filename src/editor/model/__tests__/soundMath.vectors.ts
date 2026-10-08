/** Shared by soundMath.test.ts and soundMath.parity.test.ts. `blocks` are mean squares of 0.4 s blocks. */
export const LEVEL_VECTORS: { blocks: number[]; db: number }[] = [
  { blocks: [], db: 0 },
  { blocks: [1e-6, 1e-7], db: 0 },                 // everything under the gate
  { blocks: [0.001, 0.001], db: 12 },
  { blocks: [0.001, 1e-6, 0.001], db: 12 },        // a silent block is ignored
  { blocks: [0.01, 0.02, 0.03], db: -1.0103 },
  { blocks: [0.25], db: -6 },                      // never cut by more than 6 dB
  { blocks: [1e-4], db: 18 },                      // never boosted by more than 18 dB
  { blocks: [0.001, NaN, Infinity], db: 12 },      // not a number: ignored
];
export const CLIP_VECTORS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: -0.3, y: -0.3 }, { x: 0.9, y: 0.9 },
  { x: 0.95, y: 0.944368 }, { x: 1, y: 0.967863 }, { x: 1.5, y: 0.98 }, { x: 2, y: 0.98 }, { x: -1, y: -0.967863 },
];
