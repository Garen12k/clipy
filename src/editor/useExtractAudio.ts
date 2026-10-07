import { useCallback, useRef, useState } from "react";
import { isSoundAvailable, soundInfo } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { extractClipAudio, extractedTrackOf, extractRefusal } from "./model/ops";
import { findItem } from "./model/timeline";
import { useEditorStore } from "./store";

/** What the owner is told. `already` is shown here when the bar was there before; `moved` is shown by the toolbar (it knows which tool was tapped). */
export const EXTRACT_MESSAGES = {
  noSound: "This clip has no sound to extract.",
  speed: "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed.",
  limit: "You have reached the audio track limit.",
  silent: "This clip has no sound.",
  already: "The sound of this clip is already on the audio row.",
  moved: "The sound of this clip is now its own bar.",
} as const;

/** The audio track that holds the clip's sound, and whether this call made it (false: it was there already). */
export type Extracted = { trackId: string; made: boolean };

/**
 * Extract audio. `extract(clipId)` puts the clip's sound on the audio row (one undo step) and selects the new bar — or selects the
 * bar that already holds it, changing nothing and saying so — or answers null after saying why not. Where the engine is linked the
 * file is asked first whether it has sound at all; where it is not (Expo Go, an old build) the bar is made without asking.
 * `busy` while that question is open.
 */
export function useExtractAudio(): { extract: (clipId: string) => Promise<Extracted | null>; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const extract = useCallback(async (clipId: string): Promise<Extracted | null> => {
    if (lock.current) return null;
    const say = (message: string) => useToast.getState().show(message);
    const first = useEditorStore.getState().project;
    if (!first) return null;
    const existing = extractedTrackOf(first, clipId);
    if (existing) {
      useEditorStore.getState().selectAudio(existing.id);
      say(EXTRACT_MESSAGES.already);
      return { trackId: existing.id, made: false };
    }
    const why = extractRefusal(first, clipId);
    if (why) { say(EXTRACT_MESSAGES[why]); return null; }
    const item = findItem(first, clipId);
    if (!item) return null;
    if (isSoundAvailable()) {
      lock.current = true;
      setBusy(true);
      try {
        const info = await soundInfo(item.clip.sourceUri);
        if (!info.hasSound) { say(EXTRACT_MESSAGES.silent); return null; }
      } catch {
        // The file could not be asked: go on. A bar without sound is harmless (the export skips it).
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    // The project as it is NOW (the question above took a moment).
    const now = useEditorStore.getState().project;
    if (!now) return null;
    const trackId = newId();
    const next = extractClipAudio(now, clipId, trackId);
    if (next === now) return null;
    haptic("light");
    useEditorStore.getState().apply(() => next);
    useEditorStore.getState().selectAudio(trackId);
    return { trackId, made: true };
  }, []);
  return { extract, busy };
}
