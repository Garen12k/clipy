import { useEffect, useState } from "react";
import { View } from "react-native";
import { BEAT_EVERY, DEFAULT_BEAT_DENSITY, beatTimesFor, beatTrack, cutToBeats, placeBeats, type BeatDensity } from "@/src/editor/model/beats";
import { addBeatMarker, clearBeatMarkers, removeBeatMarkerNear } from "@/src/editor/model/ops";
import { totalDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { beatsOf } from "@/src/editor/musicBeats";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic, type HapticKind } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { ToolPanel } from "@/src/ui/ToolPanel";

/** What Find beats would listen to, as one string (so the panel re-renders only when the answer changes): `status|track id|title`. */
const findTarget = (p: Project | null, selectedAudioId: string | null): string => {
  const track = p ? beatTrack(p, selectedAudioId) : null;
  if (!track) return "none||";
  const found = beatsOf(track);
  return `${found.status}|${track.id}|${found.status === "own" ? "" : found.title}`;
};
/** The one sentence under the Find beats row: what it will do, or why it cannot. */
export function findHint(status: string, title: string): string {
  if (status === "ok") return `Find beats marks the beats of ${title}.`;
  if (status === "unsteady") return `${title} has no steady beat. Tap the beat with Tap instead.`;
  if (status === "own") return "Find beats works with the built-in music for now. For your own music, tap the beat with Tap.";
  return "Add music to find its beats.";
}
// A press that changes nothing says why, and each sentence is true whenever it is shown: `ALREADY_PLACED` only when the track has
// beats inside the video (and the project already holds them), `NO_BEATS_HERE` when it has none there (music past the video's
// end, a short trimmed piece on Fewer); `NOTHING_TO_CUT` covers both "every cut is on a beat" and "no cut can reach one".
const ALREADY_PLACED = "The beat markers are already in place.";
const NO_BEATS_HERE = "No beats in this part of the music.";
const NOTHING_TO_CUT = "Nothing more to cut.";
const CUT_DONE = "Clips cut to the beat. Undo brings them back.";
const asDensity = (v: number): BeatDensity => Math.min(2, Math.max(0, Math.round(v))) as BeatDensity;

/**
 * Beat markers. **Tap** drops a marker at the playhead (read from the store at press time: the panel does not re-render on every
 * tick). **Find beats** places the markers of the music track — the selected one, else the first — from the beats the bundled
 * tracks ship with (`musicBeats.ts`); the **Fewer / More** slider chooses every 4th, every 2nd or every beat, and after a Find
 * re-places them as it is dragged — only while the track found for is still the one Find would listen to (the hint names it). **Cut to beats** shortens the main clips so their cuts land on markers (`cutToBeats`).
 * Each press is one undo step, a slider drag is one; a press the model refuses does nothing to the project. Nothing here runs on
 * its own: not when the panel opens, not when the music is moved.
 */
export function BeatsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const count = useEditorStore((s) => s.project?.beatMarkers.length ?? 0);
  const clipCount = useEditorStore((s) => s.project?.clips.length ?? 0);
  const [status, targetId, title] = useEditorStore((s) => findTarget(s.project, s.selectedAudioId)).split("|");
  const [density, setDensity] = useState<BeatDensity>(DEFAULT_BEAT_DENSITY);
  /** The track Find beats placed markers for since the panel opened: the slider re-places for it. */
  const [foundFor, setFoundFor] = useState<string | null>(null);
  useEffect(() => { if (!visible) setFoundFor(null); }, [visible]);
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
  /** The track's markers at a density, or the same project when the track is gone or has no beats. */
  const placed = (p: Project, trackId: string, d: BeatDensity): Project => {
    const track = p.audioTracks.find((t) => t.id === trackId);
    const found = track ? beatsOf(track) : null;
    return track && found && found.status === "ok" ? placeBeats(p, track.id, found.beats, BEAT_EVERY[d]) : p;
  };
  const find = () => {
    const { project, selectedAudioId, apply } = useEditorStore.getState();
    const track = project ? beatTrack(project, selectedAudioId) : null;
    const found = track ? beatsOf(track) : null;
    if (!project || !track || !found || found.status !== "ok") return;
    setFoundFor(track.id);
    const next = placed(project, track.id, density);
    if (next === project) {
      const here = beatTimesFor(track, found.beats, BEAT_EVERY[density], totalDuration(project));
      useToast.getState().show(here.length > 0 ? ALREADY_PLACED : NO_BEATS_HERE);
      return;
    }
    haptic("medium");
    apply(() => next);
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
  const cutHint = count === 0 ? "Cut to beats needs beat markers." : clipCount < 2 ? "Cut to beats needs at least two clips." : null;
  const small = { fontSize: theme.type.small } as const;

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Beat markers">
      <PrimaryButton title="Tap" onPress={() => run(addBeatMarker, "light")} />
      <Body muted style={{ textAlign: "center" }}>{count === 1 ? "1 marker" : `${count} markers`}</Body>
      <View style={{ gap: theme.space.sm }}>
        {/* Compact pairs in rows 44 tall: the 36-pt buttons' hit slop has room, and each pair fits a 375-pt phone between its gutters. */}
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", height: theme.size.touch, gap: theme.space.md }}>
          <SecondaryButton compact title="Find beats" disabled={status !== "ok"} onPress={find} />
          <SecondaryButton compact title="Cut to beats" disabled={cutHint !== null} onPress={cut} />
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
              }} />
          </View>
          <Body muted style={small}>More</Body>
        </View>
        <Body muted style={[small, { textAlign: "center" }]}>{findHint(status, title)}</Body>
        {cutHint ? <Body muted style={[small, { textAlign: "center" }]}>{cutHint}</Body> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", height: theme.size.touch, gap: theme.space.md }}>
        <SecondaryButton compact title="Remove nearest" disabled={count === 0} onPress={() => run(removeBeatMarkerNear, "light")} />
        <SecondaryButton compact title="Clear all" disabled={count === 0} onPress={() => run((p) => clearBeatMarkers(p), "medium")} />
      </View>
    </ToolPanel>
  );
}
