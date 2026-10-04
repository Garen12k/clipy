import { useMemo } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { gestureTransform, restingMagnets, type GestureValues, type Magnet } from "@/src/editor/model/clipGesture";
import { fitScale, placeClip, SNAP } from "@/src/editor/model/clipLayout";
import { clipBaseAt } from "@/src/editor/model/motion";
import { editClipTransformAt } from "@/src/editor/model/ops";
import { findItem, itemOffsetAt } from "@/src/editor/model/timeline";
import type { ClipTransform } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";

export type ClipGestureKind = "pan" | "pinch" | "rotate";
const FRAME_BORDER = 1;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
const NONE: GestureValues = { dx: 0, dy: 0, scale: 1, rotation: 0 };

/**
 * One touch sequence of pan / pinch / twist on clip `clipId` — a main clip or a layer — however many of the three run at once.
 * The first gesture to start snapshots the clip's base placement at the playhead (its keyframes there, or its
 * static transform — never the animated value); every update recomposes from that snapshot with the latest values
 * of all three (so update order doesn't matter and magnets don't stick), snaps, and applies it transiently through
 * `editClipTransformAt`: the static transform without keyframes, the pin at the playhead with them. The playhead's
 * offset is read once, at the start, so the whole sequence writes one pin.
 * The undo step opens only on the first real change, so a touch that changes nothing leaves none (and no pin).
 * A gesture that ends while others go on keeps its contribution (folded into `base`), so a fresh pan starts
 * from where the picture is. The sequence ends when the last started gesture finishes.
 */
export function createClipGestureSession(clipId: string, frameW: number, frameH: number) {
  const active = new Set<ClipGestureKind>();
  let start: ClipTransform | null = null;
  let offset = 0;
  let begun = false;
  let engaged: Magnet[] = [];
  let base: GestureValues = { ...NONE };
  let live: GestureValues = { ...NONE };

  const clipNow = () => { const p = useEditorStore.getState().project; return p ? findItem(p, clipId)?.clip ?? null : null; };

  const recompose = () => {
    const s = useEditorStore.getState();
    const clip = clipNow();
    if (!s.project || !clip || !start) return;
    const from = start, at = offset;
    const v = { dx: base.dx + live.dx, dy: base.dy + live.dy, scale: base.scale * live.scale, rotation: base.rotation + live.rotation };
    const r = gestureTransform(from, v, { width: clip.width, height: clip.height }, clip.crop, frameW, frameH);
    let patch = { x: r.transform.x, y: r.transform.y, scale: r.transform.scale, rotation: r.transform.rotation };
    let now = r.engaged;
    if (clip.keyframes.length > 0) {
      // A pin's values are interpolated, so they may sit inside a magnet zone or hold whole turns (720°). What the
      // gesture did not touch stays exactly as it was (no snap, no jump on the first frame); a twist adds its raw
      // angle to the snapshot — never wrapped, so more than half a turn keeps its direction — and snaps to the
      // nearest right angle.
      let rotation = from.rotation;
      if (v.rotation !== 0) {
        rotation = from.rotation + (v.rotation * 180) / Math.PI;
        const nearest = Math.round(rotation / 90) * 90;
        if (Math.abs(rotation - nearest) <= SNAP.rotationDeg) rotation = nearest;
      }
      patch = { x: v.dx === 0 ? from.x : patch.x, y: v.dy === 0 ? from.y : patch.y, scale: v.scale === 1 ? from.scale : patch.scale, rotation };
      now = restingMagnets({ ...from, ...patch }, fitScale({ width: clip.width, height: clip.height }, clip.crop, rotation, frameW, frameH));
    }
    if (now.some((m) => !engaged.includes(m))) haptic("light");
    engaged = now;
    // Nothing moved yet: write nothing (with keyframes even an unchanged value would add a pin).
    if (!begun && patch.x === from.x && patch.y === from.y && patch.scale === from.scale && patch.rotation === from.rotation) return;
    if (editClipTransformAt(s.project, clipId, at, patch) === s.project) return;
    if (!begun) { s.beginTransaction(); begun = true; }
    s.applyTransient((p) => editClipTransformAt(p, clipId, at, patch));
  };

  return {
    /** A gesture of `kind` begins receiving touches. If that kind is still marked active, its finalize never
     * arrived: the old sequence is stale, so drop it (the next `start` snapshots afresh). */
    begin(kind: ClipGestureKind) {
      if (active.has(kind)) { active.clear(); start = null; }
    },
    start(kind: ClipGestureKind) {
      if (active.has(kind)) { active.clear(); start = null; } // stale sequence (see `begin`): start a new one
      if (active.size === 0) {
        const s = useEditorStore.getState();
        const clip = clipNow();
        if (!s.project || !clip) return;
        const shown = itemOffsetAt(s.project, clipId, s.playhead);
        if (shown === null && clip.keyframes.length > 0) return; // no moment to pin (the picture is not shown then)
        offset = shown ?? 0;
        const at = clipBaseAt(clip, offset);
        start = { ...clip.transform, x: at.x, y: at.y, scale: at.scale, rotation: at.rotation };
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
 * Drag (one finger), pinch and twist the selected clip or layer directly on the preview, with a gold frame around the
 * picture's base placement (static, or keyframed at the playhead — not the animated one, so it stays put while an
 * animation plays). Only while the selected item is on screen at the playhead (a main clip: the one under it; a layer: one
 * showing then) and no overlay is selected.
 * A tap doesn't activate any of these, so it falls through to the preview's Pressable (play / deselect).
 * Rendered below the overlay layer: a touch that lands on an overlay never reaches this view.
 */
export function ClipGestures({ frameW, frameH }: { frameW: number; frameH: number }) {
  const clip = useEditorStore((s) => {
    if (!s.project || !s.selectedClipId || s.selectedOverlayId) return null;
    if (itemOffsetAt(s.project, s.selectedClipId, s.playhead) === null) return null;
    return findItem(s.project, s.selectedClipId)?.clip ?? null;
  });
  const clipId = clip?.id ?? null;
  // The playhead's offset in the item, followed only while it has keyframes (else the frame never depends on it).
  const offset = useEditorStore((s) => {
    if (!s.project || !s.selectedClipId || s.selectedOverlayId) return 0;
    if (!((findItem(s.project, s.selectedClipId)?.clip.keyframes.length ?? 0) > 0)) return 0;
    return itemOffsetAt(s.project, s.selectedClipId, s.playhead) ?? 0;
  });

  const gesture = useMemo(() => {
    if (!clipId) return null;
    const session = createClipGestureSession(clipId, frameW, frameH);
    const pan = Gesture.Pan().maxPointers(1).minDistance(2)
      .onBegin(() => session.begin("pan"))
      .onStart(() => session.start("pan"))
      .onUpdate((e) => session.update("pan", { dx: e.translationX, dy: e.translationY }))
      .onFinalize(() => session.finish("pan"))
      .runOnJS(true);
    const pinch = Gesture.Pinch()
      .onBegin(() => session.begin("pinch"))
      .onStart(() => session.start("pinch"))
      .onUpdate((e) => session.update("pinch", { scale: e.scale }))
      .onFinalize(() => session.finish("pinch"))
      .runOnJS(true);
    const rotate = Gesture.Rotation()
      .onBegin(() => session.begin("rotate"))
      .onStart(() => session.start("rotate"))
      .onUpdate((e) => session.update("rotate", { rotation: e.rotation }))
      .onFinalize(() => session.finish("rotate"))
      .runOnJS(true);
    return Gesture.Simultaneous(pan, pinch, rotate);
  }, [clipId, frameW, frameH]);

  if (!clip || !gesture) return null;
  const at = clipBaseAt(clip, offset);
  const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, { ...clip.transform, x: at.x, y: at.y, scale: at.scale, rotation: at.rotation }, frameW, frameH);
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
