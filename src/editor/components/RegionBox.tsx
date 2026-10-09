import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { activeEffects } from "@/src/editor/model/effectMath";
import { setEffectRect } from "@/src/editor/model/ops";
import { moveRect, resizeRectCorner, scaleRect, type RegionCorner } from "@/src/editor/model/regionRect";
import { isRegionEffect, type EffectItem, type EffectRect } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

export type RegionGestureKind = "pan" | "pinch" | RegionCorner;
type RegionValues = { panX: number; panY: number; scale: number; tlX: number; tlY: number; brX: number; brY: number };
/** What a gesture reports: a drag (the box body or a corner handle) in points, a pinch as its scale. */
export type RegionGestureUpdate = { dx: number; dy: number } | { scale: number };

/** Corner handles' touch target and the visible mark inside it. */
const HANDLE = 44;
const HANDLE_MARK = 14;
const SELECTED_BORDER = 2;
/** The mosaic box's checker: this many columns, and at most this many rows (a tall thin box would otherwise be hundreds of views). */
const CHECKER_COLUMNS = 4;
const CHECKER_MAX_ROWS = 12;
const CORNERS: { id: RegionCorner; label: string }[] = [{ id: "tl", label: "Top-left corner" }, { id: "br", label: "Bottom-right corner" }];
const NONE: RegionValues = { panX: 0, panY: 0, scale: 1, tlX: 0, tlY: 0, brX: 0, brY: 0 };
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
/** Claims the touch for the view it is on, so the preview's own Pressable never sees it as a tap. */
const claimTouch = () => true;

/**
 * One touch sequence on the selected blur / mosaic box `effectId`: a drag on its body, a pinch on it and drags on its two corner
 * handles, however many run at once. The first to start snapshots the box's rectangle; every update recomposes from that snapshot
 * with the latest values of all of them (move → scale about the centre → top-left corner → bottom-right corner), so updates never
 * stack and a box pushed against an edge comes back when the finger does. Points become fractions of the frame here. Writes go
 * through `setEffectRect` (which clamps), transiently, after one `beginTransaction` — opened only on the first real change, so a
 * touch that changes nothing leaves no undo step. A gesture that ends while others go on keeps its part (folded into `base`).
 * All state lives on one object that is only ever mutated: gesture callbacks get copies of reassigned captured variables.
 */
export function createRegionGestureSession(effectId: string, frameW: number, frameH: number) {
  const st = { active: new Set<RegionGestureKind>(), start: null as EffectRect | null, begun: false, base: { ...NONE }, live: { ...NONE } };
  const drop = () => { st.active.clear(); st.start = null; };

  const recompose = () => {
    const from = st.start;
    if (!from) return;
    const b = st.base, l = st.live;
    let rect = moveRect(from, (b.panX + l.panX) / frameW, (b.panY + l.panY) / frameH);
    rect = scaleRect(rect, b.scale * l.scale);
    rect = resizeRectCorner(rect, "tl", (b.tlX + l.tlX) / frameW, (b.tlY + l.tlY) / frameH);
    rect = resizeRectCorner(rect, "br", (b.brX + l.brX) / frameW, (b.brY + l.brY) / frameH);
    const s = useEditorStore.getState();
    if (!s.project || setEffectRect(s.project, effectId, rect) === s.project) return;   // nothing moved (or the effect is gone)
    if (!st.begun) { s.beginTransaction(); st.begun = true; }
    const next = rect;
    s.applyTransient((p) => setEffectRect(p, effectId, next));
  };

  return {
    /** A gesture of `kind` begins receiving touches. If that kind is still marked active, its finalize never arrived: the old
     * sequence is stale, so drop it (the next `start` snapshots afresh). */
    begin(kind: RegionGestureKind) {
      if (st.active.has(kind)) drop();
    },
    start(kind: RegionGestureKind) {
      if (st.active.has(kind)) drop();
      if (st.active.size === 0) {
        if (!(frameW > 0 && frameH > 0)) return;
        const effect = useEditorStore.getState().project?.effects.find((e) => e.id === effectId);
        if (!effect || !isRegionEffect(effect.type) || !effect.rect) return;
        st.start = { ...effect.rect };
        st.begun = false;
        st.base = { ...NONE }; st.live = { ...NONE };
      }
      st.active.add(kind);
    },
    update(kind: RegionGestureKind, v: RegionGestureUpdate) {
      if (!st.active.has(kind)) return;
      if ("scale" in v) {
        if (kind !== "pinch" || !Number.isFinite(v.scale)) return;
        st.live.scale = v.scale;
      } else {
        if (kind === "pinch" || !Number.isFinite(v.dx) || !Number.isFinite(v.dy)) return;
        if (kind === "pan") { st.live.panX = v.dx; st.live.panY = v.dy; }
        else if (kind === "tl") { st.live.tlX = v.dx; st.live.tlY = v.dy; }
        else { st.live.brX = v.dx; st.live.brY = v.dy; }
      }
      recompose();
    },
    finish(kind: RegionGestureKind) {
      if (!st.active.delete(kind)) return;
      const b = st.base, l = st.live;
      if (kind === "pan") { b.panX += l.panX; b.panY += l.panY; l.panX = 0; l.panY = 0; }
      else if (kind === "pinch") { b.scale *= l.scale; l.scale = 1; }
      else if (kind === "tl") { b.tlX += l.tlX; b.tlY += l.tlY; l.tlX = 0; l.tlY = 0; }
      else { b.brX += l.brX; b.brY += l.brY; l.brX = 0; l.brY = 0; }
      if (st.active.size === 0) st.start = null;
    },
  };
}

/** The coarse checker that tells a mosaic box from a blur box: every other square of a 4-column grid, sized from the box. */
function Checker({ id, width, height }: { id: string; width: number; height: number }) {
  const cellW = width / CHECKER_COLUMNS;
  if (!(cellW > 0 && height > 0)) return null;
  const rows = Math.min(CHECKER_MAX_ROWS, Math.max(1, Math.round(height / cellW)));
  const cellH = height / rows;
  const cells: { left: number; top: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = r % 2; c < CHECKER_COLUMNS; c += 2) cells.push({ left: c * cellW, top: r * cellH });
  return (
    <View testID={`region-checker-${id}`} pointerEvents="none" style={fill}>
      {cells.map((cell) => <View key={`${cell.left}:${cell.top}`} style={{ position: "absolute", left: cell.left, top: cell.top, width: cellW, height: cellH, backgroundColor: theme.colors.scrim }} />)}
    </View>
  );
}

/**
 * The blur / mosaic boxes of the effects covering the playhead, each a frosted rectangle at its place (Expo Go cannot blur or
 * pixelate the picture: this shows where the export will). They sit above the picture, the layers and the effect colours, below
 * text and stickers, and take no touches — except the selected one: it has a gold outline, a drag on it moves it, a pinch on it
 * resizes it keeping its shape, and its two corner handles resize it freely. Selecting a box stays on the timeline; a touch on
 * the selected box or its handles is claimed here, so it never reaches the preview's tap (play / deselect).
 * Nothing at all is rendered while no box covers the playhead.
 */
export function RegionBoxes({ frameW, frameH }: { frameW: number; frameH: number }) {
  const effects = useEditorStore((s) => s.project?.effects);
  const playhead = useEditorStore((s) => s.playhead);
  const selectedId = useEditorStore((s) => s.selectedEffectId);
  const boxes = useMemo(() => {
    if (!effects || effects.length === 0) return [];
    return activeEffects(effects, playhead).map((a) => a.effect).filter((e): e is EffectItem & { rect: EffectRect } => isRegionEffect(e.type) && e.rect !== null);
  }, [effects, playhead]);
  const selected = boxes.find((e) => e.id === selectedId) ?? null;
  const activeId = selected?.id ?? null;

  const gestures = useMemo(() => {
    if (!activeId || !(frameW > 0 && frameH > 0)) return null;
    const session = createRegionGestureSession(activeId, frameW, frameH);
    const drag = (kind: "pan" | RegionCorner) => Gesture.Pan().maxPointers(1).minDistance(2)
      .onBegin(() => session.begin(kind))
      .onStart(() => session.start(kind))
      .onUpdate((e) => session.update(kind, { dx: e.translationX, dy: e.translationY }))
      .onFinalize(() => session.finish(kind))
      .runOnJS(true);
    const pinch = Gesture.Pinch()
      .onBegin(() => session.begin("pinch"))
      .onStart(() => session.start("pinch"))
      .onUpdate((e) => session.update("pinch", { scale: e.scale }))
      .onFinalize(() => session.finish("pinch"))
      .runOnJS(true);
    return { box: Gesture.Simultaneous(drag("pan"), pinch), tl: drag("tl"), br: drag("br") };
  }, [activeId, frameW, frameH]);

  if (boxes.length === 0 || !(frameW > 0 && frameH > 0)) return null;
  const place = (r: EffectRect) => ({ left: r.x * frameW, top: r.y * frameH, width: r.w * frameW, height: r.h * frameH });
  const frost = { position: "absolute" as const, overflow: "hidden" as const, backgroundColor: theme.colors.scrim };
  const inner = (e: EffectItem & { rect: EffectRect }) => (e.type === "mosaicBox" ? <Checker id={e.id} width={e.rect.w * frameW} height={e.rect.h * frameH} /> : null);
  const at = selected && gestures ? place(selected.rect) : null;

  return (
    <View testID="region-boxes" pointerEvents="box-none" style={fill}>
      {boxes.filter((e) => e !== selected || !gestures).map((e) => (
        <View key={e.id} testID={`region-box-${e.id}`} pointerEvents="none"
          style={{ ...frost, ...place(e.rect), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.textMuted }}>
          {inner(e)}
        </View>
      ))}
      {selected && gestures && at ? (
        <GestureDetector key={selected.id} gesture={gestures.box}>
          <View testID={`region-box-${selected.id}`} accessibilityLabel={selected.type === "mosaicBox" ? "Mosaic box" : "Blur box"}
            onStartShouldSetResponder={claimTouch}
            style={{ ...frost, ...at, borderWidth: SELECTED_BORDER, borderColor: theme.colors.accent }}>
            {inner(selected)}
          </View>
        </GestureDetector>
      ) : null}
      {selected && gestures && at ? CORNERS.map(({ id, label }) => (
        <GestureDetector key={`handle-${id}`} gesture={gestures[id]}>
          <View testID={`region-handle-${id}`} accessibilityLabel={label} onStartShouldSetResponder={claimTouch}
            style={{
              position: "absolute", width: HANDLE, height: HANDLE, alignItems: "center", justifyContent: "center",
              left: at.left + (id === "br" ? at.width : 0) - HANDLE / 2,
              top: at.top + (id === "br" ? at.height : 0) - HANDLE / 2,
            }}>
            <View style={{ width: HANDLE_MARK, height: HANDLE_MARK, borderRadius: theme.radius.tile / 2, backgroundColor: theme.colors.accent }} />
          </View>
        </GestureDetector>
      )) : null}
    </View>
  );
}
