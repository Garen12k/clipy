import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSpeech, isSpeechAvailable, isSpeechCancelled, speakToFile } from "@/modules/clipy-video";
import { LATEST_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { placeSpeech, speakableText, speechFileName, speechRate, speechRefusal, speechTracksOf } from "./model/speech";
import { isTextOverlay } from "./model/types";
import { useEditorStore } from "./store";

/** What the owner is told. */
export const READ_ALOUD = {
  unavailable: LATEST_TOOLS,
  notText: "Only a text can be read aloud.",
  noText: "There is nothing to read in this text.",
  tooLong: "This text is too long to read aloud.",
  limit: "You have reached the audio track limit.",
  noVoice: "Pick a voice first.",
  failed: "Could not read this text aloud.",
  done: "The voice is on the audio row, under the text.",
  // A reading that took an earlier bar's place sits where that bar was — which need not be under the text any more.
  replaced: "The voice was replaced on the audio row.",
} as const;
/** The longest one reading may take. After that the phone is told to stop and the reading counts as failed. */
export const SPEECH_DEADLINE_MS = 90000;

/** One reading under way. `halt` ends it now (Stop, leaving): the phone is told once, and `read` no longer waits for its answer. */
type Reading = { halt: () => void };

/**
 * Read aloud. `read(overlayId, voiceId, pace)` has the phone speak the text into a new file in the project's media folder and puts
 * ONE voice bar on the audio row for it (`placeSpeech`: a later reading of the same text replaces the earlier bar) — one undo step.
 * It then says where the voice is: under the text (`done`), or, when a bar was replaced, that it was (`replaced`).
 * It answers false after saying why not (a refusal is said before anything native runs, and leaves the preview as it was). The
 * preview is paused before the phone speaks and stays paused. The text stays selected. `busy` while the phone is speaking; a second
 * `read` is ignored meanwhile. `stop()` — and leaving — end the reading at once, whether or not the phone ever answers; so does
 * `SPEECH_DEADLINE_MS` without an answer (as a failure). An answer is dropped — nothing changed, nothing said, its file removed —
 * when it comes after Stop or after leaving, for another project, for a text that is gone, or for words that were changed meanwhile.
 * A failure is said once (`READ_ALOUD.failed`), its reason goes to the log, and no file is left behind.
 */
export function useReadAloud(): { read: (overlayId: string, voiceId: string | null, pace: number) => Promise<boolean>; stop: () => void; busy: boolean } {
  const [busy, setBusy] = useState(false);
  // The reading under way, readable synchronously: the second-tap guard cannot wait for a re-render.
  const reading = useRef<Reading | null>(null);
  const mounted = useRef(true);
  const stop = useCallback(() => { reading.current?.halt(); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reading.current?.halt(); };
  }, []);

  const read = useCallback(async (overlayId: string, voiceId: string | null, pace: number): Promise<boolean> => {
    if (reading.current) return false;
    const say = (message: string) => useToast.getState().show(message);
    if (!isSpeechAvailable()) { say(READ_ALOUD.unavailable); return false; }
    const first = useEditorStore.getState().project;
    if (!first) return false;
    const why = speechRefusal(first, overlayId);
    if (why) { say(READ_ALOUD[why]); return false; }
    if (!voiceId) { say(READ_ALOUD.noVoice); return false; }
    const overlay = first.overlays.find((o) => o.id === overlayId);
    if (!overlay || !isTextOverlay(overlay)) return false;
    const projectId = first.id;
    const text = speakableText(overlay.text);
    const dir = `${storage.projectDir(projectId)}/media`;
    const path = `${dir}/${speechFileName(overlayId, newId())}`;
    const jobId = newId();
    const forget = () => expoFs.remove(path).catch(() => {});
    let halted = false;
    let asked = false;   // the phone has been given the job: only then is there something to cancel
    let release: () => void = () => {};
    const stopped = new Promise<null>((resolve) => { release = () => resolve(null); });
    const tellPhone = () => {
      if (!asked) return;
      try { cancelSpeech(jobId); } catch (e) { console.warn("read aloud cancel failed", e instanceof Error ? e.message : String(e)); }
    };
    const mine: Reading = { halt: () => { if (halted) return; halted = true; tellPhone(); release(); } };
    reading.current = mine;
    setBusy(true);
    useEditorStore.getState().setPlaying(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let speaking: Promise<unknown> | null = null;
    let answered = false;
    try {
      await expoFs.mkdir(dir);
      if (halted) return false;   // stopped before the phone was asked: there is no job and no file
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`speech render: no answer after ${SPEECH_DEADLINE_MS / 1000} s`)), SPEECH_DEADLINE_MS);
      });
      const job = speakToFile({ jobId, text, voiceId, rate: speechRate(pace), outputPath: path });
      asked = true;
      speaking = job;
      // Whichever comes first: the phone's answer, Stop / leaving, or the deadline. Nothing here waits for the phone for ever.
      const made = await Promise.race([job.finally(() => { answered = true; }), stopped, late]);
      if (halted || made === null) { await forget(); return false; }
      // The project as it is NOW (the speech took a moment): another project, the text gone or its words changed, and the answer is dropped.
      const now = useEditorStore.getState().project;
      const target = now && now.id === projectId ? now.overlays.find((o) => o.id === overlayId) : undefined;
      if (!now || !target || !isTextOverlay(target) || speakableText(target.text) !== text) { await forget(); return false; }
      // Asked of the project the bar goes into: a bar read from this text that is there NOW is the one `placeSpeech` replaces.
      const replaces = speechTracksOf(now, overlayId).length > 0;
      const placed = placeSpeech(now, overlayId, { id: newId(), sourceUri: path, seconds: made.seconds });
      if (placed === now) {
        // The op returns the same project when it refuses: no room any more, or an answer without a length.
        await forget();
        const refusal = speechRefusal(now, overlayId);
        if (!refusal) console.warn("read aloud failed", `speech render: an answer of ${String(made.seconds)} s`);
        say(refusal ? READ_ALOUD[refusal] : READ_ALOUD.failed);
        return false;
      }
      haptic("light");
      useEditorStore.getState().apply(() => placed);
      say(replaces ? READ_ALOUD.replaced : READ_ALOUD.done);
      return true;
    } catch (e) {
      await forget();
      if (halted || isSpeechCancelled(e)) return false;
      console.warn("read aloud failed", e instanceof Error ? e.message : String(e));
      if (!answered) tellPhone();   // the deadline: a reading that never answered is told to stop
      say(READ_ALOUD.failed);
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
      // Given up on (Stop, leaving, the deadline) while the phone may still be writing: whenever it does end, its file goes.
      if (speaking && !answered) speaking.then(forget, forget);
      if (reading.current === mine) reading.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return { read, stop, busy };
}
