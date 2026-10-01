import { useCallback, useRef, useState } from "react";
import { cancelTranscribe, isNativeAvailable, transcribe } from "@/modules/clipy-video";
import { linesToCaptions, mergeSegmentsIntoLines, segmentsToOutput, type Segment } from "@/src/editor/model/captions";
import { replaceCaptions } from "@/src/editor/model/ops";
import { clipStartTimes } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";

export type CaptionsState = { status: "idle" | "unavailable" | "running" | "done" | "error"; clipIndex: number; clipCount: number; message?: string; skipped: string[] };

export function useCaptions() {
  const [state, setState] = useState<CaptionsState>({ status: isNativeAvailable() ? "idle" : "unavailable", clipIndex: 0, clipCount: 0, skipped: [] });
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    const s = useEditorStore.getState();
    const p = s.project;
    if (!p || !isNativeAvailable()) return;
    cancelled.current = false;
    const clips = p.clips.filter((c) => !s.missingSourceUris.includes(c.sourceUri));
    const starts = clipStartTimes(p);
    setState({ status: "running", clipIndex: 0, clipCount: clips.length, skipped: [] });
    const all: Segment[] = []; const skipped: string[] = [];
    try {
      for (let i = 0; i < clips.length; i++) {
        if (cancelled.current) { setState((st) => ({ ...st, status: "idle" })); return; }
        setState((st) => ({ ...st, clipIndex: i }));
        const c = clips[i];
        const segs = await transcribe(c.sourceUri, c.trimStart, c.trimEnd);
        if (segs.length === 0) skipped.push(c.id);
        all.push(...segmentsToOutput(c, starts[p.clips.indexOf(c)], segs));
      }
      if (cancelled.current) { setState((st) => ({ ...st, status: "idle" })); return; }
      const lines = mergeSegmentsIntoLines(all.sort((a, b) => a.start - b.start));
      useEditorStore.getState().apply((proj) => replaceCaptions(proj, linesToCaptions(lines, newId)));
      setState({ status: "done", clipIndex: clips.length, clipCount: clips.length, skipped });
    } catch (e) {
      setState({ status: "error", clipIndex: 0, clipCount: clips.length, message: e instanceof Error ? e.message : String(e), skipped });
    }
  }, []);

  const cancel = useCallback(() => { cancelled.current = true; cancelTranscribe(); }, []);
  const reset = useCallback(() => setState({ status: isNativeAvailable() ? "idle" : "unavailable", clipIndex: 0, clipCount: 0, skipped: [] }), []);
  return { state, run, cancel, reset };
}
