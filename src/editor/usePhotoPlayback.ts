import { useEffect } from "react";
import { clipAt, clipDuration, clipStartTimes } from "@/src/editor/model/timeline";
import { isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";

export const PHOTO_TICK_MS = 50;

/**
 * Where the playhead goes after `elapsed` seconds on the clip under `playhead`: forward within it, but never
 * past its end — at the end it lands exactly on the next clip's start, or on the project's end (`ended`).
 */
export function photoPlaybackStep(p: Project, playhead: number, elapsed: number): { playhead: number; ended: boolean } {
  const hit = clipAt(p, playhead);
  if (!hit) return { playhead, ended: true };
  const end = clipStartTimes(p)[hit.index] + clipDuration(hit.clip);
  const next = playhead + elapsed;
  if (next < end) return { playhead: next, ended: false };
  return { playhead: end, ended: hit.index === p.clips.length - 1 };
}

/**
 * While `active` (playing with a photo under the playhead), moves the playhead by real elapsed time
 * (`Date.now()` deltas, so a slow JS thread doesn't slow the photo) every 50 ms. Each tick only acts while
 * the store is playing and the clip under the playhead is still a photo, so it never fights the video path.
 */
export function usePhotoPlayback(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;
      const s = useEditorStore.getState();
      if (!s.isPlaying || !s.project) return;
      const hit = clipAt(s.project, s.playhead);
      if (!hit || !isPhoto(hit.clip)) return;
      const step = photoPlaybackStep(s.project, s.playhead, elapsed);
      s.seek(step.playhead);
      if (step.ended) s.setPlaying(false);
    }, PHOTO_TICK_MS);
    return () => clearInterval(id);
  }, [active]);
}
