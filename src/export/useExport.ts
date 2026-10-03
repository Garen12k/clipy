import { useCallback, useEffect, useRef, useState } from "react";
import { normaliseTransitions } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { addExportListener, cancelExport, exportTimeline, isNativeAvailable, toExportClip, toExportEffect, toExportOverlay } from "@/modules/clipy-video";
import { expoFs } from "@/src/projects/expoFs";
import { estimateBytes, exportableAudio, exportableClips, type Resolution } from "./estimate";

const MIN_EFFECT_SECONDS = 0.05;

export type ExportState = { status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string };

export function useExport(project: Project | null, missingSourceUris: string[]) {
  const [state, setState] = useState<ExportState>({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 });
  const jobId = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeAvailable()) return;
    // Contract with the native side (Task 14): `exportTimeline` always resolves with the job id
    // before any event for that job is emitted, so `jobId.current` is guaranteed to be set by
    // the time a matching event can arrive — this gate never drops a real event.
    const sub = addExportListener((e) => {
      if (e.jobId !== jobId.current) return;
      if (e.type === "progress") setState((s) => ({ ...s, progress: e.progress }));
      else if (e.type === "done") setState({ status: "done", progress: 1, fileUri: e.fileUri });
      else if (e.type === "error") setState({ status: "error", progress: 0, message: e.message });
      else setState({ status: "idle", progress: 0 });
    });
    return () => sub.remove();
  }, []);

  const start = useCallback(async (resolution: Resolution) => {
    jobId.current = null;
    if (!project || !isNativeAvailable()) return;
    const filtered = exportableClips(project, missingSourceUris);
    if (filtered.length === 0) { setState({ status: "error", progress: 0, message: "Add at least one clip first." }); return; }
    const clips = normaliseTransitions(filtered);
    setState({ status: "exporting", progress: 0 });
    try {
      const total = clips.reduce((s, c) => s + clipDuration(c), 0);
      const need = estimateBytes(total, resolution) * 2;
      if ((await expoFs.freeBytes()) < need) { setState({ status: "error", progress: 0, message: "Not enough free space on this iPhone for the export." }); return; }
      await expoFs.mkdir(`${expoFs.cacheDir}exports`);
      const outputPath = `${expoFs.cacheDir}exports/${project.id}-${Date.now()}.mp4`;
      const audioTrack = exportableAudio(project, missingSourceUris);
      jobId.current = await exportTimeline({
        clips: clips.map(toExportClip),
        overlays: project.overlays.filter((o) => o.end > o.start).map(toExportOverlay),
        effects: project.effects
          .map((e) => ({ ...e, start: Math.max(0, e.start), end: Math.min(total, e.end) }))
          .filter((e) => e.end - e.start >= MIN_EFFECT_SECONDS)
          .map(toExportEffect),
        audio: audioTrack ? { sourceUri: audioTrack.sourceUri, start: audioTrack.start, trimStart: audioTrack.trimStart, trimEnd: audioTrack.trimEnd, volume: audioTrack.volume } : null,
        aspectRatio: project.aspectRatio, resolution, outputPath,
      });
    } catch (e) { setState({ status: "error", progress: 0, message: e instanceof Error ? e.message : String(e) }); }
  }, [project, missingSourceUris]);

  const cancel = useCallback(() => { if (jobId.current) cancelExport(jobId.current); }, []);
  const reset = useCallback(() => { jobId.current = null; setState({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 }); }, []);
  return { state, start, cancel, reset };
}
