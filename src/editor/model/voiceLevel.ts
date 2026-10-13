/**
 * The numbers of the Record tab's countdown and level meter, and the meter's two rules. TypeScript only, no imports, nothing native:
 * the level is the recorder's own figure (expo-audio's `getStatus().metering` — on iOS `AVAudioRecorder.averagePower(forChannel: 0)`,
 * the average power in dBFS: 0 is full scale, silence is far below −100).
 */

/** The countdown before a voice-over starts: 3, 2, 1 — one number a second, then the recording begins. */
export const VOICE_COUNT = { from: 3, stepMs: 1000 } as const;

/**
 * The meter: `bars` bars spread evenly over `floorDb` … `topDb` (5.625 dB a bar), read every `sampleMs` (10 times a second — never
 * faster: each reading is one draw of the meter). −50 dB is under the hum of a quiet room, −5 dB is just short of clipping; a voice at
 * arm's length is expected around −30 … −15 dB, three to six bars. `quietMs`: how long no bar may light before the microphone is doubted.
 */
export const VOICE_LEVEL = { bars: 8, floorDb: -50, topDb: -5, sampleMs: 100, quietMs: 3000 } as const;

/** How many bars are lit at `db` dBFS: 0 at the floor and under, all at the top and over, the nearest whole bar between. Not a number = none. */
export function levelBars(db: number): number {
  if (Number.isNaN(db)) return 0;
  const share = (db - VOICE_LEVEL.floorDb) / (VOICE_LEVEL.topDb - VOICE_LEVEL.floorDb);
  return Math.round(Math.max(0, Math.min(1, share)) * VOICE_LEVEL.bars);
}

/**
 * The quiet rule's memory: when the stretch without sound began (ms), or null while sound is heard. "Quiet" is exactly "no bar lit",
 * so the words and the picture can never disagree. A reading that is not a number changes nothing.
 */
export function quietSince(since: number | null, db: number, nowMs: number): number | null {
  if (Number.isNaN(db)) return since;
  if (levelBars(db) > 0) return null;
  return since ?? nowMs;
}

/** True once the stretch without sound has lasted `quietMs`. */
export function tooQuiet(since: number | null, nowMs: number): boolean {
  return since !== null && nowMs - since >= VOICE_LEVEL.quietMs;
}
