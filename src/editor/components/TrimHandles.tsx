import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipDuration, clipStartTimes, sourceAfter, timeToX, xToTime } from "@/src/editor/model/timeline";
import { trimClip } from "@/src/editor/model/ops";
import { clampNum, isPhoto, MIN_CLIP_SECONDS, PHOTO, type Clip, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { createSnapper, sameTime } from "../snapping";
import { STRIP_HEIGHT } from "../timelineLayout";

const snap = (t: number) => Math.round(t * 10) / 10;

/** Where clip `id` ends on the timeline (null: not a main clip). */
const clipEndOf = (p: Project, id: string): number | null => {
  const i = p.clips.findIndex((c) => c.id === id);
  return i < 0 ? null : clipStartTimes(p)[i] + clipDuration(p.clips[i]);
};

/** `exact` (the drag has snapped to a target): the dragged value is not rounded to 0.1 s, which would pull it off the target. The bounds are the same. */
export function trimFromDrag(clip: Clip, edge: "start" | "end", startValue: number, translationX: number, pps: number, exact = false) {
  // The drag is an output-seconds delta; timeline.ts turns it into a source time (speed and speed curves live there).
  const dragged = sourceAfter(clip, startValue, xToTime(translationX, pps));
  const raw = exact ? dragged : snap(dragged);
  // A photo has no start to trim: its end handle sets its length.
  if (isPhoto(clip)) return { trimStart: 0, trimEnd: clampNum(raw, PHOTO.minSeconds, PHOTO.maxSeconds) };
  if (edge === "start") {
    const trimStart = Math.max(0, Math.min(raw, snap(sourceAfter(clip, clip.trimEnd, -MIN_CLIP_SECONDS))));
    return { trimStart, trimEnd: clip.trimEnd };
  }
  const trimEnd = Math.min(clip.sourceDuration, Math.max(raw, snap(sourceAfter(clip, clip.trimStart, MIN_CLIP_SECONDS))));
  return { trimStart: clip.trimStart, trimEnd };
}

function Handle({ clip, edge }: { clip: Clip; edge: "start" | "end" }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  // The trim value and the clip's end on the timeline when the drag began (one object: gesture callbacks get copies of reassigned variables).
  const startRef = useRef({ value: edge === "start" ? clip.trimStart : clip.trimEnd, end: 0 });
  const snapper = useRef(createSnapper()).current;
  useEffect(() => () => snapper.end(), [snapper]);   // removed mid-drag: the guide goes with the handle
  const pan = Gesture.Pan().activeOffsetX([-4, 4])
    .onStart(() => {
      const p = useEditorStore.getState().project, c = p?.clips.find((x) => x.id === clip.id);
      startRef.current = { value: edge === "start" ? (c?.trimStart ?? 0) : (c?.trimEnd ?? 0), end: (p && clipEndOf(p, clip.id)) ?? 0 };
      store.beginTransaction();
      snapper.begin(null, true); snapper.rest(startRef.current.end);
    })
    .onUpdate((e) => {
      const p = useEditorStore.getState().project, c = p?.clips.find((x) => x.id === clip.id);
      if (!p || !c) return;
      // Either handle moves the clip's END on the timeline (the track ripples): the start handle the other way. That end is what
      // snaps; its snapped time goes back into a drag distance. A snap the trim would clamp away is not taken, and a frame that
      // does not snap keeps the finger's own distance and the 0.1 s rounding, exactly as before.
      const { value, end } = startRef.current, way = edge === "end" ? 1 : -1;
      const txOf = (to: number) => timeToX((to - end) * way, pps);
      const lands = (s: number, target: number) => {
        const r = trimFromDrag(c, edge, value, txOf(s), pps, true), at = clipEndOf(trimClip(p, clip.id, r.trimStart, r.trimEnd), clip.id);
        return at !== null && sameTime(at, target);
      };
      const to = snapper.time(end + way * xToTime(e.translationX, pps), lands);
      const { trimStart, trimEnd } = snapper.snapped() ? trimFromDrag(c, edge, value, txOf(to), pps, true) : trimFromDrag(c, edge, value, e.translationX, pps);
      store.applyTransient((q) => trimClip(q, clip.id, trimStart, trimEnd));
    })
    .onFinalize(() => snapper.end())
    .runOnJS(true);
  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={`${edge === "start" ? "Trim start" : "Trim end"} handle`} hitSlop={{ left: 12, right: 12, top: 12, bottom: 12 }}
        style={{ position: "absolute", [edge === "start" ? "left" : "right"]: -2, top: -2, width: 14, height: STRIP_HEIGHT + 4, backgroundColor: theme.colors.accent,
          borderTopLeftRadius: edge === "start" ? 8 : 0, borderBottomLeftRadius: edge === "start" ? 8 : 0, borderTopRightRadius: edge === "end" ? 8 : 0, borderBottomRightRadius: edge === "end" ? 8 : 0,
          alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 2, height: 20, backgroundColor: theme.colors.onAccent, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}

export function TrimHandles({ clip }: { clip: Clip }) {
  return (<>{!isPhoto(clip) && <Handle clip={clip} edge="start" />}<Handle clip={clip} edge="end" /></>);
}
