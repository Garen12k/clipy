import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { normaliseTransitions } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { activeCutout, clampExportSettings, DEFAULT_EXPORT_SETTINGS, EFFECT_END_SLACK, frameAspect, type Clip, type ExportSettings, type LayerClip, type Project } from "@/src/editor/model/types";
import { steadyOf } from "@/src/editor/model/steady";
import { addExportListener, cancelExport, exportTimeline, isCutoutAvailable, isNativeAvailable, isSoundAvailable, isSteadyAvailable, toExportAudioTrack, toExportClip, toExportEffect, toExportLayer, toExportOverlay, type ExportAudioTrack } from "@/modules/clipy-video";
import { EXPORT_INTERRUPTED, isBackgroundExportBuild } from "@/modules/clipy-video/background";
import { activeTimeout, whenActive } from "@/src/lib/activeTime";
import { expoFs } from "@/src/projects/expoFs";
import { beginRun, EXPORT_RESTARTED, type ExportRun, type RunOutcome } from "./backgroundExport";
import { useStayAwake } from "./exportAwake";
import { blursOriginal, CUTOUT_SHARE, cutoutBytesToMake, prepareCutouts, withCutout } from "./exportCutouts";
import { prepareSounds, SOUND_SHARE } from "./exportSounds";
import { prepareSteady, STEADY_SHARE, steadyBytesToMake, withSteady } from "./exportSteady";
import { estimateBytes, exportableAudio, exportableClips, exportableLayers, requestBitrate, RESOLUTIONS, type Resolution } from "./estimate";

export type ExportState = {
  status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string;
  /** Only while exporting, on the "background export" build: Clipy is in the background, where the video cannot be drawn. The export is still `exporting` and goes on by itself. */
  paused?: boolean;
  /** Only while exporting: one plain sentence about this export (`EXPORT_RESTARTED`). */
  note?: string;
};
/** How often one export is started again by itself after an interruption. After that an interruption is shown as the failure it is, with Try Again. */
export const MAX_RESTARTS = 2;
/**
 * After Clipy comes back to an export that was rendering: if the native export has not moved for this long (counted in front) it is
 * taken for stuck (the session did not survive the wait) and is started again like any interrupted one. The first step forward ends the watch.
 */
export const EXPORT_STALL_MS = 30000;
/** What a stuck export is ended with (it then restarts, or is shown once the restarts are used up). */
export const EXPORT_STUCK = "export interrupted: the export did not go on after Clipy came back";

export function useExport(project: Project | null, missingSourceUris: string[]) {
  const [state, setState] = useState<ExportState>({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 });
  // The screen stays on from the tap on Export (the preparations included) to the end, whatever the end is; unmounting lets it go too.
  useStayAwake(state.status === "exporting");
  const jobId = useRef<string | null>(null);
  /** One export from the tap to its end, restarts included, as the phone is told about it (inert on an older build). */
  const run = useRef<ExportRun | null>(null);
  const endRun = useCallback((outcome: RunOutcome) => { run.current?.end(outcome); run.current = null; }, []);
  /** What the tap asked for: an automatic restart exports the same again. */
  const asked = useRef<{ resolution: Resolution; chosen: ExportSettings } | null>(null);
  const restarts = useRef(0);
  /** Clipy has been in the background during the attempt that runs now. */
  const left = useRef(false);
  /** Calls off a restart that waits for Clipy to be in front / the watch for a stuck export. */
  const waiting = useRef<(() => void) | null>(null);
  const stall = useRef<(() => void) | null>(null);
  const shown = useRef(0);
  const attemptRef = useRef<(resolution: Resolution, chosen: ExportSettings) => Promise<void>>(async () => {});
  const cancelRef = useRef<() => void>(() => {});
  const unwatch = useCallback(() => { stall.current?.(); stall.current = null; }, []);
  /** Progress never runs backwards within one attempt (a restart begins again at 0, with its sentence). */
  const advance = useCallback((to: number, only?: () => boolean) => {
    setState((s) => {
      if (only && !(only() && s.status === "exporting")) return s;
      const progress = Math.max(s.progress, to);
      shown.current = progress;
      return { ...s, progress };
    });
  }, []);
  /** The export cannot run at all (nothing to export, no room): said as it always was, and nothing is started again. */
  const refuse = useCallback((message: string) => { endRun("error"); setState({ status: "error", progress: 0, message }); }, [endRun]);
  /**
   * An attempt ended with `message`. On the "background export" build one that was INTERRUPTED (the native side says so with `code`, or
   * Clipy was in the background during it) is not shown: the export starts again by itself as soon as Clipy is in front, with one
   * sentence, at most `MAX_RESTARTS` times (the copies already made are found on disk). Anything else, and everything on an older
   * build, is the error it always was.
   */
  const fail = useCallback((message: string, code?: string) => {
    unwatch();
    const again = asked.current;
    const interrupted = (code === EXPORT_INTERRUPTED || left.current) && isBackgroundExportBuild();
    if (!interrupted || !again || restarts.current >= MAX_RESTARTS) {
      endRun("error");
      setState({ status: "error", progress: 0, message });
      return;
    }
    restarts.current += 1;
    run.current?.restarted();
    jobId.current = null;
    console.log("background export: interrupted, starting again", JSON.stringify({ restart: restarts.current, message }));
    shown.current = 0;
    const away = AppState.currentState === "background";
    setState(away ? { status: "exporting", progress: 0, note: EXPORT_RESTARTED, paused: true } : { status: "exporting", progress: 0, note: EXPORT_RESTARTED });
    waiting.current?.();
    waiting.current = null;
    const off = whenActive(() => { waiting.current = null; void attemptRef.current(again.resolution, again.chosen); });
    if (away) waiting.current = off;
  }, [endRun, unwatch]);
  /** The part of the progress taken before the video export starts (preparing changed sounds and cut-out copies): 0 for a project without any. */
  const share = useRef(0);
  /**
   * Set only while changed sounds and cut-out copies are prepared (before `exportTimeline`, so there is no job id to cancel yet): Cancel marks it
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
      if (e.type === "progress") {
        const to = share.current + (1 - share.current) * e.progress;
        if (stall.current && to > shown.current) unwatch();   // it moves again: not stuck
        advance(to);
      } else if (e.type === "done") { unwatch(); endRun("done"); setState({ status: "done", progress: 1, fileUri: e.fileUri }); }
      else if (e.type === "error") fail(e.message, e.code);
      else { unwatch(); endRun("cancelled"); setState({ status: "idle", progress: 0 }); }
    });
    return () => sub.remove();
  }, [advance, endRun, fail, unwatch]);

  // Leaving and coming back, on the "background export" build only (an older build adds no listener and shows nothing new). The
  // native side holds the frames of the video while Clipy is in the background and goes on by itself; here the screen says so, and an
  // export that was rendering and does not move again after the return is taken for stuck (`EXPORT_STALL_MS`).
  useEffect(() => {
    if (!isBackgroundExportBuild()) return;
    const sub = AppState.addEventListener("change", (now) => {
      if (!run.current) return;
      if (now === "background") {
        left.current = true;
        run.current.left();
        setState((s) => (s.status === "exporting" && !s.paused ? { ...s, paused: true } : s));
      } else if (now === "active") {
        run.current.back();
        setState((s) => {
          if (s.status !== "exporting" || !s.paused) return s;
          const { paused: _paused, ...rest } = s;
          return rest;
        });
        const job = jobId.current;
        if (!job || !left.current || stall.current) return;
        stall.current = activeTimeout(() => {
          stall.current = null;
          if (jobId.current !== job) return;
          jobId.current = null;   // whatever that job still says is not for this screen any more
          try { cancelExport(job); } catch (e) { console.warn("export cancel failed", e); }
          fail(EXPORT_STUCK, EXPORT_INTERRUPTED);
        }, EXPORT_STALL_MS);
      }
    });
    return () => sub.remove();
  }, [fail]);
  // The display the phone has of the export follows the ring.
  useEffect(() => { if (state.status === "exporting") run.current?.report(state.progress); }, [state.status, state.progress]);
  // The screen goes away: nothing waits any more, and the phone is told the export is not this screen's any longer.
  useEffect(() => () => { waiting.current?.(); stall.current?.(); run.current?.end("cancelled"); run.current = null; }, []);

  /** One attempt at the export: the first one from the tap (`start`), a later one by itself after an interruption (`fail`). */
  const attempt = useCallback(async (resolution: Resolution, chosen: ExportSettings = project?.exportSettings ?? DEFAULT_EXPORT_SETTINGS) => {
    jobId.current = null;
    share.current = 0;
    left.current = false;
    shown.current = 0;
    stopPreparing();
    const settings = clampExportSettings(chosen);   // the native side traps on a non-whole fps / bitrate
    if (!project || !isNativeAvailable()) return;
    const filtered = exportableClips(project, missingSourceUris);
    if (filtered.length === 0) { refuse("Add at least one clip first."); return; }
    const clips = normaliseTransitions(filtered);
    setState(restarts.current > 0 ? { status: "exporting", progress: 0, note: EXPORT_RESTARTED } : { status: "exporting", progress: 0 });
    try {
      const total = clips.reduce((s, c) => s + clipDuration(c), 0);
      const layersOut = exportableLayers(project, missingSourceUris, total);
      /** Whether a clip or layer goes out from a cut-out copy (never on a build from before the tool: nothing can have been switched on there). */
      const cutting = isCutoutAvailable() && [...clips, ...layersOut].some(activeCutout);
      /** Whether a clip or layer goes out from a steady copy. The project is asked FIRST: one without the two settings makes no new call at all. */
      const steadying = [...clips, ...layersOut].some((c) => steadyOf(c) !== null) && isSteadyAvailable();
      // The copies still to be made are written before the video is: their room is asked for with the video's.
      const need = estimateBytes(total, resolution, settings) * 2 + (cutting ? await cutoutBytesToMake(project.id, [...clips, ...layersOut]) : 0) + (steadying ? await steadyBytesToMake(project.id, [...clips, ...layersOut]) : 0);
      if ((await expoFs.freeBytes()) < need) { refuse("Not enough free space on this iPhone for the export."); return; }
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
          const made = await prepareSounds(project.id, changed, (f) => advance(f * SOUND_SHARE, () => !run.stopped), () => run.stopped);
          made.forEach((uri, id) => copies.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
      // A clip or layer with Remove background is exported from its cut-out copy: same timing, same sound, another file. A copy
      // that is missing is rendered first. Without the tool (a build from before it) nothing can have been switched on there:
      // the clips go out as they are.
      const cutouts = new Map<string, string>();
      if (cutting) {
        const run = { stopped: false };
        preparing.current = run;
        const before = share.current;
        share.current = before + CUTOUT_SHARE;
        try {
          const made = await prepareCutouts(project.id, [...clips, ...layersOut], (f) => advance(before + f * CUTOUT_SHARE, () => !run.stopped), () => run.stopped);
          made.forEach((uri, id) => cutouts.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
      // A clip or layer with Stabilize or an active Smooth slow motion is exported from its steady copy: same timing, same sound,
      // another file. A copy that is missing is made first.
      const steadies = new Map<string, string>();
      if (steadying) {
        const run = { stopped: false };
        preparing.current = run;
        const before = share.current;
        share.current = before + STEADY_SHARE;
        try {
          const made = await prepareSteady(project.id, [...clips, ...layersOut], (f) => advance(before + f * STEADY_SHARE, () => !run.stopped), () => run.stopped);
          made.forEach((uri, id) => steadies.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
      /** With no copy of either kind both are the plain conversions, called exactly as before. */
      const noCopies = cutouts.size === 0 && steadies.size === 0;
      /** A cut-out main clip with a Blur background also names its original, on a build that reads it (never asked without a copy). */
      const backdrop = cutouts.size > 0 && blursOriginal(clips);
      const sendClip = (c: Clip) => withSteady(withCutout(toExportClip(c), c, cutouts.get(c.id), true, backdrop), c, steadies.get(c.id));
      const sendLayer = (l: LayerClip) => withSteady(withCutout(toExportLayer(l), l, cutouts.get(l.id), false), l, steadies.get(l.id));
      const audioTracks = copies.size === 0
        ? mixed.audioTracks.map((t) => toExportAudioTrack(mixed, t, total)).filter((t): t is ExportAudioTrack => t !== null)
        : mixed.audioTracks.flatMap((t): ExportAudioTrack[] => {
          const sent = toExportAudioTrack(mixed, t, total);
          return sent ? [{ ...sent, sourceUri: copies.get(t.id) ?? sent.sourceUri }] : [];
        });
      jobId.current = await exportTimeline({
        clips: noCopies ? clips.map(toExportClip) : clips.map(sendClip),
        // A layer running past the end is sent whole (the native side clips it); one starting at the end is dropped.
        layers: noCopies ? layersOut.map(toExportLayer) : layersOut.map(sendLayer),
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
    } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
  }, [project, missingSourceUris, stopPreparing, advance, fail, refuse]);
  attemptRef.current = attempt;

  /**
   * The tap on Export. Before anything else the phone is asked to keep Clipy alive for it (`beginRun`: the tap, with the app in
   * front, is the moment iOS wants that asked), only for an export that will really start, and not at all on an older build.
   */
  const start = useCallback(async (resolution: Resolution, chosen: ExportSettings = project?.exportSettings ?? DEFAULT_EXPORT_SETTINGS) => {
    waiting.current?.();
    waiting.current = null;
    unwatch();
    endRun("cancelled");
    restarts.current = 0;
    asked.current = { resolution, chosen };
    if (project && isNativeAvailable() && exportableClips(project, missingSourceUris).length > 0) {
      run.current = beginRun(`Exporting ${project.name}`, RESOLUTIONS.find((r) => r.value === resolution)?.label ?? "", () => cancelRef.current());
    }
    await attempt(resolution, chosen);
  }, [project, missingSourceUris, attempt, endRun, unwatch]);

  // While the sounds and the cut-out copies are prepared there is no native job yet: Cancel stops the preparation and the screen is idle at once. (A render
  // already running is left to finish — it is the copy the editor needs anyway, and the next export finds it.)
  // An export that waits to start again (Clipy is not in front) has neither a job nor a preparation: Cancel calls the restart off.
  const cancel = useCallback(() => {
    unwatch();
    if (jobId.current) { cancelExport(jobId.current); return; }
    const pending = waiting.current;
    waiting.current = null;
    pending?.();
    if (stopPreparing() || pending) { endRun("cancelled"); setState({ status: "idle", progress: 0 }); }
  }, [stopPreparing, endRun, unwatch]);
  cancelRef.current = cancel;
  const reset = useCallback(() => {
    jobId.current = null; stopPreparing(); unwatch();
    waiting.current?.(); waiting.current = null; asked.current = null;
    endRun("cancelled");
    setState({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 });
  }, [stopPreparing, endRun, unwatch]);
  return { state, start, cancel, reset };
}
