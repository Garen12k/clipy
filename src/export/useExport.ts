import { useCallback, useEffect, useRef, useState } from "react";
import { totalDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { addExportListener, cancelExport, exportTimeline, isNativeAvailable } from "@/modules/clipy-video";
import { expoFs } from "@/src/projects/expoFs";
import { estimateBytes, type Resolution } from "./estimate";

export type ExportState = { status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string };

export function useExport(project: Project | null) {
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
    const clips = project.clips.filter((c) => c.trimEnd > c.trimStart);
    if (clips.length === 0) { setState({ status: "error", progress: 0, message: "Add at least one clip first." }); return; }
    setState({ status: "exporting", progress: 0 });
    try {
      const need = estimateBytes(totalDuration(project), resolution) * 2;
      if ((await expoFs.freeBytes()) < need) { setState({ status: "error", progress: 0, message: "Not enough free space on this iPhone for the export." }); return; }
      await expoFs.mkdir(`${expoFs.cacheDir}exports`);
      const outputPath = `${expoFs.cacheDir}exports/${project.id}-${Date.now()}.mp4`;
      jobId.current = await exportTimeline({ clips: clips.map((c) => ({ sourceUri: c.sourceUri, trimStart: c.trimStart, trimEnd: c.trimEnd })), aspectRatio: project.aspectRatio, resolution, outputPath });
    } catch (e) { setState({ status: "error", progress: 0, message: e instanceof Error ? e.message : String(e) }); }
  }, [project]);

  const cancel = useCallback(() => { if (jobId.current) cancelExport(jobId.current); }, []);
  const reset = useCallback(() => { jobId.current = null; setState({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 }); }, []);
  return { state, start, cancel, reset };
}
