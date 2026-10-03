import { useMemo } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { gestureTransform, restingMagnets, type GestureValues, type Magnet } from "@/src/editor/model/clipGesture";
import { fitScale, placeClip } from "@/src/editor/model/clipLayout";
import { setClipTransform } from "@/src/editor/model/ops";
import { clipAt } from "@/src/editor/model/timeline";
import type { ClipTransform } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";

export type ClipGestureKind = "pan" | "pinch" | "rotate";
const FRAME_BORDER = 1;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
const NONE: GestureValues = { dx: 0, dy: 0, scale: 1, rotation: 0 };

/**
 * One touch sequence of pan / pinch / twist on clip `clipId`, however many of the three run at once.
 * The first gesture to start snapshots the clip's transform; every update recomposes from that snapshot with
 * the latest values of all three (so update order doesn't matter and magnets don't stick), snaps, and applies
 * it transiently. The undo step opens only on the first real change, so a touch that changes nothing leaves none.
 * A gesture that ends while others go on keeps its contribution (folded into `base`), so a fresh pan starts
 * from where the picture is. The sequence ends when the last started gesture finishes.
 */
export function createClipGestureSession(clipId: string, frameW: number, frameH: number) {
  const active = new Set<ClipGestureKind>();
  let start: ClipTransform | null = null;
  let begun = false;
  let engaged: Magnet[] = [];
  let base: GestureValues = { ...NONE };
  let live: GestureValues = { ...NONE };

  const clipNow = () => useEditorStore.getState().project?.clips.find((c) => c.id === clipId) ?? null;

  const recompose = () => {
    const s = useEditorStore.getState();
    const clip = clipNow();
    if (!s.project || !clip || !start) return;
    const v = { dx: base.dx + live.dx, dy: base.dy + live.dy, scale: base.scale * live.scale, rotation: base.rotation + live.rotation };
    const r = gestureTransform(start, v, { width: clip.width, height: clip.height }, clip.crop, frameW, frameH);
    if (r.engaged.some((m) => !engaged.includes(m))) haptic("light");
    engaged = r.engaged;
    if (setClipTransform(s.project, clipId, r.transform) === s.project) return;
    if (!begun) { s.beginTransaction(); begun = true; }
    s.applyTransient((p) => setClipTransform(p, clipId, r.transform));
  };

  return {
    start(kind: ClipGestureKind) {
      if (active.has(kind)) return;
      if (active.size === 0) {
        const clip = clipNow();
        if (!clip) return;
        start = { ...clip.transform };
        begun = false;
        base = { ...NONE }; live = { ...NONE };
        engaged = restingMagnets(start, fitScale({ width: clip.width, height: clip.height }, clip.crop, start.rotation, frameW, frameH));
      }
      active.add(kind);
    },
    update(kind: ClipGestureKind, values: Partial<GestureValues>) {
      if (!active.has(kind)) return;
      live = { ...live, ...values };
      recompose();
    },
    finish(kind: ClipGestureKind) {
      if (!active.delete(kind)) return;
      if (kind === "pan") { base.dx += live.dx; base.dy += live.dy; live.dx = 0; live.dy = 0; }
      if (kind === "pinch") { base.scale *= live.scale; live.scale = 1; }
      if (kind === "rotate") { base.rotation += live.rotation; live.rotation = 0; }
      if (active.size === 0) start = null;
    },
  };
}

/**
 * Drag (one finger), pinch and twist the selected clip directly on the preview, with a gold frame around the
 * placed picture. Only while the selected clip is the one under the playhead and no overlay is selected.
 * A tap doesn't activate any of these, so it falls through to the preview's Pressable (play / deselect).
 * Rendered below the overlay layer: a touch that lands on an overlay never reaches this view.
 */
export function ClipGestures({ frameW, frameH }: { frameW: number; frameH: number }) {
  const clip = useEditorStore((s) => {
    if (!s.project || !s.selectedClipId || s.selectedOverlayId) return null;
    const hit = clipAt(s.project, s.playhead);
    return hit && hit.clip.id === s.selectedClipId ? hit.clip : null;
  });
  const clipId = clip?.id ?? null;

  const gesture = useMemo(() => {
    if (!clipId) return null;
    const session = createClipGestureSession(clipId, frameW, frameH);
    const pan = Gesture.Pan().maxPointers(1).minDistance(2)
      .onStart(() => session.start("pan"))
      .onUpdate((e) => session.update("pan", { dx: e.translationX, dy: e.translationY }))
      .onFinalize(() => session.finish("pan"))
      .runOnJS(true);
    const pinch = Gesture.Pinch()
      .onStart(() => session.start("pinch"))
      .onUpdate((e) => session.update("pinch", { scale: e.scale }))
      .onFinalize(() => session.finish("pinch"))
      .runOnJS(true);
    const rotate = Gesture.Rotation()
      .onStart(() => session.start("rotate"))
      .onUpdate((e) => session.update("rotate", { rotation: e.rotation }))
      .onFinalize(() => session.finish("rotate"))
      .runOnJS(true);
    return Gesture.Simultaneous(pan, pinch, rotate);
  }, [clipId, frameW, frameH]);

  if (!clip || !gesture) return null;
  const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, clip.transform, frameW, frameH);
  return (
    <>
      <GestureDetector gesture={gesture}>
        <View testID="clip-gesture-area" style={fill} />
      </GestureDetector>
      <View
        testID="clip-selection-frame"
        pointerEvents="none"
        style={{
          position: "absolute",
          left: placed.centerX - placed.width / 2, top: placed.centerY - placed.height / 2, width: placed.width, height: placed.height,
          borderWidth: FRAME_BORDER, borderColor: theme.colors.accent,
          transform: [{ rotate: `${placed.rotation}deg` }],
        }}
      />
    </>
  );
}
