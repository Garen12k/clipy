import { useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { sourceAfter, xToTime } from "@/src/editor/model/timeline";
import { trimClip } from "@/src/editor/model/ops";
import { clampNum, isPhoto, MIN_CLIP_SECONDS, PHOTO, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT } from "../timelineLayout";

const snap = (t: number) => Math.round(t * 10) / 10;

export function trimFromDrag(clip: Clip, edge: "start" | "end", startValue: number, translationX: number, pps: number) {
  // The drag is an output-seconds delta; timeline.ts turns it into a source time (speed and speed curves live there).
  const raw = snap(sourceAfter(clip, startValue, xToTime(translationX, pps)));
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
  const startRef = useRef(edge === "start" ? clip.trimStart : clip.trimEnd);
  const pan = Gesture.Pan().activeOffsetX([-4, 4])
    .onStart(() => { const c = useEditorStore.getState().project?.clips.find((x) => x.id === clip.id); startRef.current = edge === "start" ? (c?.trimStart ?? 0) : (c?.trimEnd ?? 0); store.beginTransaction(); })
    .onUpdate((e) => {
      const c = useEditorStore.getState().project?.clips.find((x) => x.id === clip.id);
      if (!c) return;
      const { trimStart, trimEnd } = trimFromDrag(c, edge, startRef.current, e.translationX, pps);
      store.applyTransient((p) => trimClip(p, clip.id, trimStart, trimEnd));
    })
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
