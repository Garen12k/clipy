import { useCallback, useEffect, useRef, useState } from "react";
import { normaliseTransitions } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { clampExportSettings, DEFAULT_EXPORT_SETTINGS, EFFECT_END_SLACK, frameAspect, type ExportSettings, type Project } from "@/src/editor/model/types";
import { addExportListener, cancelExport, exportTimeline, isNativeAvailable, isSoundAvailable, toExportAudioTrack, toExportClip, toExportEffect, toExportLayer, toExportOverlay, type ExportAudioTrack } from "@/modules/clipy-video";
import { expoFs } from "@/src/projects/expoFs";
import { prepareSounds, SOUND_SHARE } from "./exportSounds";
import { estimateBytes, exportableAudio, exportableClips, exportableLayers, requestBitrate, type Resolution } from "./estimate";

export type ExportState = { status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string };

export function useExport(project: Project | null, missingSourceUris: string[]) {
  const [state, setState] = useState<ExportState>({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 });
  const jobId = useRef<string | null>(null);
  /** The part of the progress taken before the video export starts (preparing changed sounds): 0 for a project without any. */
  const share = useRef(0);
  /**
   * Set only while changed sounds are prepared (before `exportTimeline`, so there is no job id to cancel yet): Cancel marks it
   * stopped, and the `start` that owns it then asks for no further copy, sets no state and never starts the video export.
   */
  const preparing = useRef<{ stopped: boolean } | null>(null);
  const stopPreparing = useCallback((): boolean => {
    const run = preparing.current;
    if (!run) return false;
    run.stopped = true;
    preparing.current = null;
    return true;
  }, []);

  useEffect(() => {
    if (!isNativeAvailable()) return;
    // Contract with the native side (Task 14): `exportTimeline` always resolves with the job id
    // before any event for that job is emitted, so `jobId.current` is guaranteed to be set by
    // the time a matching event can arrive — this gate never drops a real event.
    const sub = addExportListener((e) => {
      if (e.jobId !== jobId.current) return;
      if (e.type === "progress") setState((s) => ({ ...s, progress: share.current + (1 - share.current) * e.progress }));
      else if (e.type === "done") setState({ status: "done", progress: 1, fileUri: e.fileUri });
      else if (e.type === "error") setState({ status: "error", progress: 0, message: e.message });
      else setState({ status: "idle", progress: 0 });
    });
    return () => sub.remove();
  }, []);

  const start = useCallback(async (resolution: Resolution, chosen: ExportSettings = project?.exportSettings ?? DEFAULT_EXPORT_SETTINGS) => {
    jobId.current = null;
    share.current = 0;
    stopPreparing();
    const settings = clampExportSettings(chosen);   // the native side traps on a non-whole fps / bitrate
    if (!project || !isNativeAvailable()) return;
    const filtered = exportableClips(project, missingSourceUris);
    if (filtered.length === 0) { setState({ status: "error", progress: 0, message: "Add at least one clip first." }); return; }
    const clips = normaliseTransitions(filtered);
    setState({ status: "exporting", progress: 0 });
    try {
      const total = clips.reduce((s, c) => s + clipDuration(c), 0);
      const need = estimateBytes(total, resolution, settings) * 2;
      if ((await expoFs.freeBytes()) < need) { setState({ status: "error", progress: 0, message: "Not enough free space on this iPhone for the export." }); return; }
      await expoFs.mkdir(`${expoFs.cacheDir}exports`);
      const outputPath = `${expoFs.cacheDir}exports/${project.id}-${Date.now()}.mp4`;
      // Only tracks that are exported take part in the mix (a voice-over whose file is gone does not duck the music);
      // each is clipped to the exported duration, and one wholly outside it is dropped.
      const mixed: Project = { ...project, audioTracks: exportableAudio(project, missingSourceUris) };
      // A track with a sound setting (Voice / Sound) is exported from its changed copy: same range, same gain curve, another file.
      // Only tracks that are inside the video are prepared; a copy that is missing is rendered first. Without the sound engine
      // (a build from before the sound tools) nothing can have been changed: the tracks go out as recorded.
      const changed = isSoundAvailable() ? mixed.audioTracks.filter((t) => t.sound && toExportAudioTrack(mixed, t, total) !== null) : [];
      const copies = new Map<string, string>();
      if (changed.length > 0) {
        const run = { stopped: false };
        preparing.current = run;
        share.current = SOUND_SHARE;
        try {
          const made = await prepareSounds(project.id, changed, (f) => setState((s) => (!run.stopped && s.status === "exporting" ? { ...s, progress: f * SOUND_SHARE } : s)), () => run.stopped);
          made.forEach((uri, id) => copies.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
      const audioTracks = copies.size === 0
        ? mixed.audioTracks.map((t) => toExportAudioTrack(mixed, t, total)).filter((t): t is ExportAudioTrack => t !== null)
        : mixed.audioTracks.flatMap((t): ExportAudioTrack[] => {
          const sent = toExportAudioTrack(mixed, t, total);
          return sent ? [{ ...sent, sourceUri: copies.get(t.id) ?? sent.sourceUri }] : [];
        });
      jobId.current = await exportTimeline({
        clips: clips.map(toExportClip),
        // A layer running past the end is sent whole (the native side clips it); one starting at the end is dropped.
        layers: exportableLayers(project, missingSourceUris, total).map(toExportLayer),
        overlays: project.overlays.filter((o) => o.end > o.start).map(toExportOverlay),
        effects: project.effects
          .map((e) => ({ ...e, start: Math.max(0, e.start), end: Math.min(total, e.end) }))
          .filter((e) => e.end - e.start >= EFFECT_END_SLACK)
          .map(toExportEffect),
        audioTracks,
        // The id as it is ("auto" included) and the frame's shape as a number: the native side takes a "w:h" id exactly and the
        // number for anything else. Always finite and above 0 (a null or NaN would be refused); six decimals are plenty for a pixel size.
        aspectRatio: project.aspectRatio, frameAspect: Math.round(frameAspect(project) * 1e6) / 1e6, resolution, fps: settings.fps, bitrate: requestBitrate(resolution, settings), outputPath,
      });
    } catch (e) { setState({ status: "error", progress: 0, message: e instanceof Error ? e.message : String(e) }); }
  }, [project, missingSourceUris, stopPreparing]);

  // While the sounds are prepared there is no native job yet: Cancel stops the preparation and the screen is idle at once. (A render
  // already running is left to finish — it is the copy the editor needs anyway, and the next export finds it.)
  const cancel = useCallback(() => {
    if (jobId.current) cancelExport(jobId.current);
    else if (stopPreparing()) setState({ status: "idle", progress: 0 });
  }, [stopPreparing]);
  const reset = useCallback(() => { jobId.current = null; stopPreparing(); setState({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 }); }, [stopPreparing]);
  return { state, start, cancel, reset };
}
