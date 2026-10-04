/** The preview players (expo-audio, expo-video) cap volume at 1; values above 1 are only honoured in the export. */
export const PREVIEW_VOLUME_CAP = 1;
/** A volume this close to the one last written is not written again: a fade would otherwise write on every playhead tick. */
export const VOLUME_WRITE_STEP = 0.01;

/**
 * Whether `next` must be written to a player whose volume was last written as `last` (null: never written).
 * Written when it moved by more than VOLUME_WRITE_STEP, or when it arrives at exactly 0 or the cap (so a fade always ends
 * on silence / full volume, never 0.01 short of it).
 */
export function shouldWriteVolume(last: number | null, next: number): boolean {
  if (last === null) return true;
  if (Math.abs(next - last) > VOLUME_WRITE_STEP) return true;
  return (next === 0 || next === PREVIEW_VOLUME_CAP) && last !== next;
}
