import type { AudioTrack } from "@/src/editor/model/types";
import { ensureSound } from "@/src/editor/soundRenders";

/** The share of the export's progress that preparing the sounds takes (only when a track has a sound setting). */
export const SOUND_SHARE = 0.1;

/**
 * The changed copies of the tracks that have a sound setting: track id → the copy's uri. A copy that exists is used; a missing one
 * is rendered first, one after the other. `onProgress` runs 0 → 1 across them. A copy that cannot be rendered stops the export —
 * it never goes out with a different sound from the one that was chosen. `stopped` (Cancel) is asked before each copy and after it:
 * once it answers true no further copy is asked for and nothing more is reported; what was gathered so far is returned.
 */
export async function prepareSounds(projectId: string, tracks: readonly AudioTrack[], onProgress: (fraction: number) => void, stopped: () => boolean = () => false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const changed = tracks.filter((t) => t.sound);
  for (let i = 0; i < changed.length; i++) {
    const t = changed[i];
    if (!t.sound) continue;
    if (stopped()) return out;
    try {
      out.set(t.id, await ensureSound(projectId, t.sourceUri, t.sound, (f) => { if (!stopped()) onProgress((i + f) / changed.length); }));
    } catch (e) {
      throw new Error(`Could not prepare a sound for the export: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (stopped()) return out;
    onProgress((i + 1) / changed.length);
  }
  return out;
}
