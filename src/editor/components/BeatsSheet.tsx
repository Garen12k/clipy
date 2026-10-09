import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { isBeatEnvelopeAvailable } from "@/modules/clipy-video";
import { BEAT_EVERY, DEFAULT_BEAT_DENSITY, beatCutState, beatTimesFor, beatTrack, beatsLeftOut, cutToBeats, placeBeats, type BeatCutState, type BeatDensity } from "@/src/editor/model/beats";
import { addBeatMarker, clearBeatMarkers, removeBeatMarkerNear } from "@/src/editor/model/ops";
import { totalDuration } from "@/src/editor/model/timeline";
import { BEAT_LIMITS, type Project } from "@/src/editor/model/types";
import type { TrackBeats } from "@/src/editor/musicBeats";
import { foundBeats, listenForBeats, stopListening, useOwnBeats } from "@/src/editor/ownBeats";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic, type HapticKind } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { ToolPanel } from "@/src/ui/ToolPanel";

/** What Find beats would listen to, as one string (so the panel re-renders only when the answer changes): `status|track id`. */
const findTarget = (p: Project | null, selectedAudioId: string | null, found: Record<string, TrackBeats | null>): string => {
  const track = p ? beatTrack(p, selectedAudioId) : null;
  return track ? `${foundBeats(found, track).status}|${track.id}` : "none|";
};
/** Said for things only a listening can say. `gaveUp`: it ended on its own (the deadline) while the panel was open. */
export const BEAT_MESSAGES = {
  tooShort: "This sound is too short to find a beat in.",
  failed: "Could not listen to this sound.",
  ownNeedsBuild: "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.",
  gaveUp: "Couldn't finish listening to this song. Try a shorter piece.",
} as const;
/** The one sentence under the Find beats row: what it will do, or why it cannot. `canListen`: the installed app can listen to a file of the owner's. */
export function findHint(status: string, title: string, canListen = true): string {
  if (status === "ok") return `Find beats marks the beats of ${title}.`;
  if (status === "unsteady") return `${title} has no steady beat. Tap the beat with Tap instead.`;
  if (status === "own") return canListen ? `Find beats listens to ${title} for a few seconds.` : BEAT_MESSAGES.ownNeedsBuild;
  return "Add music to find its beats.";
}
// A press that changes nothing says why, and each sentence is true whenever it is shown: `ALREADY_PLACED` only when the track has
// beats inside the video (and the project already holds them), `NO_BEATS_HERE` when it has none there (music past the video's
// end, a short trimmed piece on Fewer); `NOTHING_TO_CUT` covers both "every cut is on a beat" and "no cut can reach one".
const ALREADY_PLACED = "The beat markers are already in place.";
const NO_BEATS_HERE = "No beats in this part of the music.";
/** Shown instead of anything else a Find would say when the project is at its marker limit and some beats of the track were not placed (`beatsLeftOut`): the later ones, or all of them when the project was full already. */
const LEFT_OUT = `Only ${BEAT_LIMITS.max} markers fit. The last beats were left out.`;
const NOTHING_TO_CUT = "Nothing more to cut.";
/** Why Cut to beats is off, by the one rule of the model (`beatCutState`); null = on. */
const CUT_HINT: Record<BeatCutState, string | null> = { noMarkers: "Cut to beats needs beat markers.", oneClip: "Cut to beats needs at least two clips.", ready: null };
const CUT_DONE = "Clips cut to the beat. Undo brings them back.";
const asDensity = (v: number): BeatDensity => Math.min(2, Math.max(0, Math.round(v))) as BeatDensity;

/**
 * Beat markers. **Tap** drops a marker at the playhead (read from the store at press time: the panel does not re-render on every
 * tick). **Find beats** places the markers of the music track — the selected one, else the first — from the beats the bundled
 * tracks ship with (`musicBeats.ts`), or — for any other sound — from what the phone finds by listening to the file (`ownBeats.ts`: a few seconds, a spinner, then the same placing); the **Fewer / More** slider chooses every 4th, every 2nd or every beat, and after a Find
 * re-places them as it is dragged — only while the track found for is still the one Find would listen to (the hint names it). A Find
 * (or such a drag, when it is let go) that cannot place every beat under the 300-marker limit says so in one toast. **Cut to beats** shortens the main clips so their cuts land on markers (`cutToBeats`).
 * Each press is one undo step, a slider drag is one; a press the model refuses does nothing to the project. Nothing here runs on
 * its own: not when the panel opens, not when the music is moved.
 */
export function BeatsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const count = useEditorStore((s) => s.project?.beatMarkers.length ?? 0);
  const cutState = useEditorStore((s): BeatCutState => (s.project ? beatCutState(s.project) : "noMarkers"));
  const found = useOwnBeats((s) => s.found);
  const [status, targetId] = useEditorStore((s) => findTarget(s.project, s.selectedAudioId, found)).split("|");
  const title = useEditorStore((s) => (s.project ? beatTrack(s.project, s.selectedAudioId)?.title ?? "" : ""));
  /** The phone is listening to a file (own music): the button is off and the hint's place shows the spinner. */
  const [busy, setBusy] = useState(false);
  /** The track whose listening ended on its own, unanswered: the hint's place says so until the next tap or until the panel closes. */
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  /** Whether the panel is on screen, for an answer that arrives late. */
  const shown = useRef(visible);
  const [density, setDensity] = useState<BeatDensity>(DEFAULT_BEAT_DENSITY);
  /** The track Find beats placed markers for since the panel opened: the slider re-places for it. */
  const [foundFor, setFoundFor] = useState<string | null>(null);
  useEffect(() => {
    shown.current = visible;
    if (visible) return;
    setFoundFor(null);
    setBusy(false);
    setGaveUp(null);
    stopListening();
  }, [visible]);
  useEffect(() => () => { shown.current = false; stopListening(); }, []);
  /** The track a slider drag re-places for: the found one, while it is still the target. Otherwise (an undo or a redo changed which track is first) the slider only sets the next Find. */
  const live = foundFor !== null && foundFor === targetId ? foundFor : null;

  const run = (op: (p: Project, playhead: number) => Project, feel: HapticKind) => {
    const { project, playhead, apply } = useEditorStore.getState();
    if (!project) return;
    // The ops return the same project when they refuse.
    const next = op(project, playhead);
    if (next === project) return;
    haptic(feel);
    apply(() => next);
  };
  /** The track and its beats when it has any (bundled, or listened to), else null. */
  const known = (p: Project, trackId: string) => {
    const track = p.audioTracks.find((t) => t.id === trackId);
    const got = track ? foundBeats(useOwnBeats.getState().found, track) : null;
    return track && got && got.status === "ok" ? { track, beats: got.beats } : null;
  };
  /** The track's markers at a density, or the same project when the track is gone or has no beats. */
  const placed = (p: Project, trackId: string, d: BeatDensity): Project => {
    const k = known(p, trackId);
    return k ? placeBeats(p, k.track.id, k.beats, BEAT_EVERY[d]) : p;
  };
  /** How many beats of the track do not fit under the marker limit at a density (0 when the track is gone or has no beats). */
  const leftOut = (p: Project, trackId: string, d: BeatDensity): number => {
    const k = known(p, trackId);
    return k ? beatsLeftOut(p, k.track.id, k.beats, BEAT_EVERY[d]) : 0;
  };
  const find = () => {
    const { project, selectedAudioId, apply } = useEditorStore.getState();
    const track = project ? beatTrack(project, selectedAudioId) : null;
    const k = project && track ? known(project, track.id) : null;
    if (!project || !track || !k) return;
    setFoundFor(track.id);
    const next = placed(project, track.id, density);
    // One toast at most per press: the limit first (with beats left out, "already in place" would not be true).
    const over = leftOut(project, track.id, density) > 0;
    if (next === project) {
      const here = beatTimesFor(track, k.beats, BEAT_EVERY[density], totalDuration(project));
      useToast.getState().show(over ? LEFT_OUT : here.length > 0 ? ALREADY_PLACED : NO_BEATS_HERE);
      return;
    }
    haptic("medium");
    apply(() => next);
    if (over) useToast.getState().show(LEFT_OUT);
  };
  /**
   * Find beats for a sound of the owner's own: the phone listens (a few seconds; the spinner shows), and when it has found a steady
   * beat the ordinary Find runs — for the same track, in the same project, while the panel is still open. Anything else places nothing:
   * too short and a file that cannot be read say so in a toast, no steady beat is said by the hint, and a listening that ended
   * unanswered with the panel still open (the deadline — closing the panel is the only stop there is) by one sentence in the hint's place.
   */
  const listen = async () => {
    const { project, selectedAudioId } = useEditorStore.getState();
    const track = project ? beatTrack(project, selectedAudioId) : null;
    if (!project || !track || busy) return;
    if (!isBeatEnvelopeAvailable()) { useToast.getState().show(BEATS_BACKGROUND_TOOLS); return; }
    setBusy(true);
    setGaveUp(null);
    try {
      const answer = await listenForBeats(track);
      if (!shown.current) return;
      if (answer === "short") { useToast.getState().show(BEAT_MESSAGES.tooShort); return; }
      if (answer === "unavailable") { useToast.getState().show(BEATS_BACKGROUND_TOOLS); return; }
      if (answer === "stopped") { setGaveUp(track.id); return; }
      if (answer !== "ok") return;
      const now = useEditorStore.getState();
      if (now.project && now.project.id === project.id && beatTrack(now.project, now.selectedAudioId)?.id === track.id) find();
    } catch (e) {
      console.warn("find beats failed", e);
      if (shown.current) useToast.getState().show(BEAT_MESSAGES.failed);
    } finally {
      if (shown.current) setBusy(false);
    }
  };
  const cut = () => {
    const { project, apply } = useEditorStore.getState();
    if (!project) return;
    const next = cutToBeats(project);
    if (next === project) { useToast.getState().show(NOTHING_TO_CUT); return; }
    haptic("medium");
    apply(() => next);
    useToast.getState().show(CUT_DONE);
  };
  const cutHint = CUT_HINT[cutState];
  const small = { fontSize: theme.type.small } as const;
  const hint = gaveUp !== null && gaveUp === targetId && status === "own" ? BEAT_MESSAGES.gaveUp : findHint(status, title, isBeatEnvelopeAvailable());

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Beat markers">
      <PrimaryButton title="Tap" onPress={() => run(addBeatMarker, "light")} />
      <Body muted style={{ textAlign: "center" }}>{count === 1 ? "1 marker" : `${count} markers`}</Body>
      <View style={{ gap: theme.space.sm }}>
        {/* Compact pairs in rows 44 tall: the 36-pt buttons' hit slop has room, and each pair fits a 375-pt phone between its gutters. */}
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", height: theme.size.touch, gap: theme.space.md }}>
          <SecondaryButton compact title="Find Beats" disabled={busy || (status !== "ok" && status !== "own")} onPress={status === "own" ? () => { void listen(); } : find} />
          <SecondaryButton compact title="Cut to Beats" disabled={cutHint !== null} onPress={cut} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", height: theme.size.touch, gap: theme.space.md }}>
          <Body muted style={small}>Fewer</Body>
          <View style={{ flex: 1, height: theme.size.touch, justifyContent: "center" }}>
            <Slider testID="beats-density" accessibilityLabel="How many beats" minimumValue={0} maximumValue={2} step={1} value={density} detents={[DEFAULT_BEAT_DENSITY]}
              disabled={status !== "ok"}
              onSlidingStart={() => { if (live) useEditorStore.getState().beginTransaction(); }}
              onValueChange={(v) => {
                const d = asDensity(v);
                setDensity(d);
                if (live) useEditorStore.getState().applyTransient((p) => placed(p, live, d));
              }}
              // Said once, when the slider is let go — never while it is dragged, and only for a drag that re-placed markers.
              onSlidingComplete={(v) => {
                const { project } = useEditorStore.getState();
                if (live && project && leftOut(project, live, asDensity(v)) > 0) useToast.getState().show(LEFT_OUT);
              }} />
          </View>
          <Body muted style={small}>More</Body>
        </View>
        {/* A row of fixed height: the spinner takes the place of the sentence while the phone listens, and nothing below it moves. */}
        <View style={{ height: theme.size.controlCompact, alignItems: "center", justifyContent: "center" }}>
          {busy
            ? <Spinner label="Listening to the music" />
            : <Body muted numberOfLines={2} style={[small, { textAlign: "center" }]}>{hint}</Body>}
        </View>
        {cutHint ? <Body muted style={[small, { textAlign: "center" }]}>{cutHint}</Body> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", height: theme.size.touch, gap: theme.space.md }}>
        <SecondaryButton compact title="Remove Nearest" disabled={count === 0} onPress={() => run(removeBeatMarkerNear, "light")} />
        <SecondaryButton compact title="Clear All" disabled={count === 0} onPress={() => run((p) => clearBeatMarkers(p), "medium")} />
      </View>
    </ToolPanel>
  );
}
