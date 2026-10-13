import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type AudioRecorder, type RecordingOptions } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { askPermission, readPermission } from "@/src/auth/permissions";
import { RECORDING_AUDIO_MODE, restorePlaybackAudioMode } from "@/src/editor/audioMode";
import { addAudioTrack } from "@/src/editor/model/ops";
import { levelBars, quietSince, tooQuiet, VOICE_COUNT, VOICE_LEVEL } from "@/src/editor/model/voiceLevel";
import { totalDuration } from "@/src/editor/model/timeline";
import { AUDIO_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useVoiceLive } from "@/src/editor/voiceLive";
import { storage } from "@/src/projects";
import { audioDuration } from "@/src/projects/audioInfo";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";

/** `counting`: the 3 … 1 before a recording. Nothing of a recording exists yet — no session, no muted preview, no `recording` flag. */
export type VoiceRecorderState = "idle" | "counting" | "starting" | "recording" | "saving";
/**
 * What the recorder is made with: the package's HIGH_QUALITY preset, every field as it is — so the FILE is what it always was — plus
 * the one switch that makes the recorder report its input level (`getStatus().metering`). The switch is not an encoder setting:
 * natively it is `AVAudioRecorder.isMeteringEnabled`, set beside the settings that make the file.
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
/** `count`: the number the countdown shows (3, 2, 1), 0 outside it. `begin` counts down and then calls `start`; `cancelCount` ends a countdown and nothing else. */
export type VoiceRecorder = { state: VoiceRecorderState; elapsed: number; count: number; begin(): void; cancelCount(): void; start(): Promise<void>; stop(): Promise<void>; cancel(): Promise<void> };

const ELAPSED_TICK_MS = 200;
/** How long the save waits for the recorded file's own length before going with the recorder's figure. */
const MEASURE_TIMEOUT_MS = 2000;
const LIMIT_MESSAGE = "You've reached the audio track limit.";
const MIC_MESSAGE = "Microphone access is needed to record.";
const START_FAILED = "Couldn't start recording.";
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** One recording, from the moment the preview is muted until the session is released. */
type Session = { projectId: string; startAt: number; startedMs: number };

/** What the recorder says it has recorded, in seconds; 0 when it says nothing (or has been released). */
function recordedSeconds(recorder: AudioRecorder): number {
  try {
    const t = recorder.currentTime;
    if (Number.isFinite(t) && t > 0) return t;
    const ms = recorder.getStatus().durationMillis;
    if (Number.isFinite(ms) && ms > 0) return ms / 1000;
  } catch { /* released */ }
  return 0;
}

/** The length of the file at `uri` in seconds, or null when it cannot be read (in time). Never throws. */
function measuredSeconds(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    audioDuration(uri)
      .then((d) => resolve(Number.isFinite(d) && d > 0 ? d : null), () => resolve(null))
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Records a voice-over onto the timeline while the video plays: `start` mutes the preview (the store's `recording` flag), pauses
 * playback if it was running, allows recording in the audio session, starts the recorder and then playback; `stop` saves the file
 * into the project as a `voice` track beginning where the playhead was when the recorder started, as long as the recorder said —
 * or as the saved file measures, when that is shorter. Playback ending (the project's end, or anything else pausing it) stops the recording too.
 * Every way out — stop, cancel, an error, unmount — un-mutes the preview and puts the audio session back to its playback mode.
 * The `recording` flag outlives the recorder by the save: it is cleared when the track is in (or refused), so whatever waits for
 * it (the tool store's closer, Export) waits for the save too; the preview stays muted for that moment.
 *
 * `begin` is what the record button calls: the same refusals as `start`, said at the tap; then the MICROPHONE is settled, still at the
 * tap and before any counting — read first (`readPermission`, never an alert): allowed → the countdown at once; not asked yet →
 * Apple's question now, the state `starting` (the button's disabled look) and no number, and the countdown only after a yes; refused
 * (now or earlier) → the refusal, no countdown. Then `VOICE_COUNT.from` … 1, a number every `VOICE_COUNT.stepMs`, and only then the
 * start — which, coming from the countdown, never asks: it reads, and a microphone taken away meanwhile is the same refusal. (`start`
 * called directly still asks, as it always did.) The countdown is plain timers and a number in state — nothing is muted,
 * played, asked or recorded during it — and `cancelCount` or an unmount ends it without a trace; an unmount while Apple's alert is up
 * ends the flow too (`settling`): the answer then starts and says nothing. While recording, the input level is
 * read from the recorder every `VOICE_LEVEL.sampleMs` and written to `useVoiceLive`, never to this hook's state: a level draws the
 * meter again, not whoever uses this hook.
 *
 * `onDismiss` is called before any toast and after a successful save, so that a hosting sheet (a native Modal, which would cover
 * the toast) can close. Neither happens once the hook has unmounted: a save still under way then adds its track silently.
 */
export function useVoiceRecorder(opts: { onDismiss?: () => void } = {}): VoiceRecorder {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  // The state, readable synchronously: re-entry guards cannot wait for a re-render.
  const phase = useRef<VoiceRecorderState>("idle");
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The tap's flow while the microphone is being read or asked for: a new object per tap, null once it is settled or given up.
  const settling = useRef<object | null>(null);
  const mounted = useRef(true);
  // Counts unmounts: a start / stop that began in an earlier life of the hook shows nothing when it ends.
  const life = useRef(0);
  const onDismiss = useRef(opts.onDismiss);
  onDismiss.current = opts.onDismiss;

  const setPhase = (next: VoiceRecorderState) => { phase.current = next; if (mounted.current) setState(next); };
  /** Ends the elapsed tick and the level reading, and puts the meter back to nothing. */
  const stopTimer = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (levelTimer.current) { clearInterval(levelTimer.current); levelTimer.current = null; }
    useVoiceLive.getState().setLevel(0, false);
  };
  const stopCount = () => {
    if (countTimer.current) { clearTimeout(countTimer.current); countTimer.current = null; }
    useVoiceLive.getState().setCounting(false);
  };
  // A sentence that starts "Couldn't" is a failure; the others say why not.
  const notify = (message: string) => { onDismiss.current?.(); useToast.getState().show(message, message.startsWith("Couldn't") ? { kind: "problem" } : undefined); };

  /**
   * Ends the session: recorder stopped if asked (it may already be released), playback mode restored, and — unless a save follows,
   * which then clears it itself — the `recording` flag cleared (preview sound back on). Never throws.
   */
  const release = async (stopRecorder: boolean, saveFollows = false) => {
    stopTimer();
    session.current = null;
    if (stopRecorder) { try { await recorder.stop(); } catch { /* released, or never started */ } }
    if (!saveFollows) useEditorStore.getState().setRecording(false);
    await restorePlaybackAudioMode();
  };

  /** `settled`: the microphone was settled at the tap (`begin`) — the start then only READS it, and never shows Apple's alert. */
  const run = async (settled: boolean) => {
    if (phase.current !== "idle") return;
    const before = useEditorStore.getState().project;
    if (!before) return;
    if (totalDuration(before) <= 0) { notify("Add a clip before recording."); return; }
    if (before.audioTracks.length >= AUDIO_LIMITS.maxTracks) { notify(LIMIT_MESSAGE); return; }   // before recording something nobody can keep
    setPhase("starting");
    const born = life.current;
    let started = false;
    let message: string | null = null;
    try {
      if (settled) {
        // A phone that cannot say is not a refusal: the tap had its yes, and a recorder without a microphone fails by itself below.
        const now = await readPermission("microphone");
        if (now === "denied" || now === "notAsked") { message = MIC_MESSAGE; return; }
      } else {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) { message = MIC_MESSAGE; return; }
      }
      const s = useEditorStore.getState();
      if (!mounted.current || !s.project || s.project.id !== before.id) return;
      // Playback waits for the recorder: whatever time it takes to get ready must not pass on the timeline.
      if (s.isPlaying) s.setPlaying(false);
      if (s.playhead >= totalDuration(s.project)) s.seek(0);
      const mine: Session = { projectId: before.id, startAt: useEditorStore.getState().playhead, startedMs: Date.now() };
      session.current = mine;
      s.setRecording(true);
      await setAudioModeAsync(RECORDING_AUDIO_MODE);
      await recorder.prepareToRecordAsync();
      if (session.current !== mine) return;   // unmounted meanwhile: the cleanup has already restored everything
      recorder.record();
      // The track begins where the playhead is now that the recorder runs — not where it was when the button was pressed.
      mine.startAt = useEditorStore.getState().playhead;
      mine.startedMs = Date.now();
      started = true;
      setElapsed(0);
      setPhase("recording");
      timer.current = setInterval(() => { if (mounted.current) setElapsed((Date.now() - mine.startedMs) / 1000); }, ELAPSED_TICK_MS);
      // The level: the recorder's own figure, into its own store. Silence counts from the start of the recording; a recorder that
      // reports no level lights nothing and is never called too quiet.
      let silentSince: number | null = mine.startedMs;
      levelTimer.current = setInterval(() => {
        let db: unknown;
        try { db = recorder.getStatus().metering; } catch { return; /* released */ }
        if (typeof db !== "number" || Number.isNaN(db)) return;
        const now = Date.now();
        silentSince = quietSince(silentSince, db, now);
        useVoiceLive.getState().setLevel(levelBars(db), tooQuiet(silentSince, now));
      }, VOICE_LEVEL.sampleMs);
      useEditorStore.getState().setPlaying(true);
    } catch (e) {
      console.warn(e);
      message = START_FAILED;
    } finally {
      if (!started) {
        if (session.current) await release(true);
        setPhase("idle");
        if (message && life.current === born) notify(message);
      }
    }
  };

  const start = () => run(false);

  /** 3 … 1, then the start. Only ever called with the microphone allowed. */
  const countDown = () => {
    setPhase("counting");
    useVoiceLive.getState().setCounting(true);
    const step = (n: number) => {
      setCount(n);
      countTimer.current = setTimeout(() => {
        countTimer.current = null;
        if (phase.current !== "counting") return;
        if (n > 1) { step(n - 1); return; }
        stopCount();
        setCount(0);
        setPhase("idle");   // in the same batch as the start's own "starting": the idle button is never drawn between them
        void run(true);
      }, VOICE_COUNT.stepMs);
    };
    step(VOICE_COUNT.from);
  };

  /**
   * The reasons `start` refuses before it asks for anything — said at the tap, so nobody counts down to a refusal — and then the
   * microphone, also at the tap. While the phone is only being READ the guard is the ref alone (no disabled look for a moment
   * nobody sees); while Apple's alert is up the state is `starting`.
   */
  const begin = () => {
    if (phase.current !== "idle") return;
    const project = useEditorStore.getState().project;
    if (!project) return;
    if (totalDuration(project) <= 0) { notify("Add a clip before recording."); return; }
    if (project.audioTracks.length >= AUDIO_LIMITS.maxTracks) { notify(LIMIT_MESSAGE); return; }
    phase.current = "starting";
    const mine = {};
    settling.current = mine;
    void (async () => {
      // Neither call throws. A phone that cannot say is asked, as the start always asked: iOS shows its alert only if it never has.
      let mic = await readPermission("microphone");
      if (settling.current !== mine) return;
      if (mic === "notAsked" || mic === "unavailable") {
        setPhase("starting");
        mic = await askPermission("microphone");
        if (settling.current !== mine) return;   // closed while the alert was up: nothing starts, nothing is said
      }
      settling.current = null;
      if (mic === "granted") { countDown(); return; }
      setPhase("idle");
      notify(mic === "unavailable" ? START_FAILED : MIC_MESSAGE);
    })();
  };

  const cancelCount = () => {
    if (phase.current !== "counting") return;
    stopCount();
    setCount(0);
    setPhase("idle");
  };

  const finish = async (save: boolean) => {
    const ses = session.current;
    if (phase.current !== "recording" || !ses) return;
    setPhase("saving");   // before pausing playback: the subscription below must not call back in
    const born = life.current;
    let message: string | null = null;
    let saved = false;
    try {
      let uri: string | null = null;
      let seconds = 0;
      try {
        useEditorStore.getState().setPlaying(false);
        const wallClock = (Date.now() - ses.startedMs) / 1000;
        const reported = recordedSeconds(recorder);   // read first: the native recorder zeroes its clock when it stops
        await recorder.stop();
        uri = recorder.uri;
        seconds = Math.max(reported, recordedSeconds(recorder)) || wallClock;
      } finally {
        await release(false, true);
      }
      if (!save) return;
      if (useEditorStore.getState().project?.id !== ses.projectId) return;   // the editor moved on while recording
      if (!uri) throw new Error("The recorder returned no file");
      // The recorder's clock can run past what reached the file: the track is never longer than the file itself.
      const measured = await measuredSeconds(uri);
      if (measured !== null) seconds = Math.min(seconds, measured);
      if (seconds < AUDIO_LIMITS.minDuration) { message = "That recording was too short."; return; }
      const imported = await storage.importAudio(ses.projectId, { uri, title: "Voice-over", durationSec: r3(seconds) }, "voice");
      const { project, apply, selectAudio } = useEditorStore.getState();
      if (!project || project.id !== ses.projectId) return;   // …or while the file was copied
      // The op returns the same project when it refuses.
      const next = addAudioTrack(project, { ...imported, start: r3(ses.startAt) });
      if (next === project) { message = LIMIT_MESSAGE; return; }
      apply(() => next);
      selectAudio(imported.id);
      haptic("light");
      saved = true;
    } catch (e) {
      console.warn(e);
      if (save) message = "Couldn't save that recording.";
    } finally {
      setPhase("idle");
      // The flag drops last, after the host was told to close: until then the tool store leaves the host alone, so a selection
      // change during the save cannot take it — and the message — away. An unmount meanwhile has cleared the flag already.
      try {
        if (life.current === born) {
          if (message) notify(message);
          else if (saved) onDismiss.current?.();
        }
      } finally {
        if (life.current === born) useEditorStore.getState().setRecording(false);
      }
    }
  };
  const stop = () => finish(true);
  const cancel = () => finish(false);

  // Playback stopping by itself (the project's end) ends the recording. `finish` flips the phase before it pauses playback, so its
  // own pause never lands here; nothing in this effect sets state.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => useEditorStore.subscribe((s, prev) => {
    if (prev.isPlaying && !s.isPlaying && phase.current === "recording") void stopRef.current();
  }), []);

  // Unmount while counting down, or while the microphone is being asked for: it ends, nothing was begun. Unmount with a session open (starting or recording): nothing is saved, everything is put back. useAudioRecorder releases the
  // native recorder in its own cleanup, which runs before this one — stopping a released recorder throws, so swallow it.
  // Unmount during a save: the save goes on silently, but the flag it still holds is given back now.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      life.current += 1;
      stopTimer();
      stopCount();
      if (phase.current === "counting") phase.current = "idle";
      if (settling.current) { settling.current = null; phase.current = "idle"; }
      if (phase.current === "saving") useEditorStore.getState().setRecording(false);
      if (!session.current) return;
      session.current = null;
      phase.current = "idle";
      const s = useEditorStore.getState();
      s.setPlaying(false);
      try { recorder.stop().catch(() => {}); } catch { /* released */ }
      s.setRecording(false);
      void restorePlaybackAudioMode();
    };
  }, [recorder]);

  return { state, elapsed, count, begin, cancelCount, start, stop, cancel };
}
