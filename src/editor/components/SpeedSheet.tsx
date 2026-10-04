import Slider from "@react-native-community/slider";
import { useState } from "react";
import { View } from "react-native";
import { SPEED_CURVES } from "@/src/editor/effects";
import { formatSpeed } from "@/src/lib/format";
import { forClips, mainClipIds, setClipSpeed, setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { SPEED_CURVE_IDS, SPEED_LIMITS, type Clip, type Project, type SpeedCurveId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PressableScale } from "@/src/ui/PressableScale";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

type Tab = "normal" | "curve";
const TABS: { id: Tab; label: string }[] = [{ id: "normal", label: "Normal" }, { id: "curve", label: "Curve" }];

/** Tile geometry (points), matching the animation tiles: the column a tile takes, its rounded box and the sparkline inside it. */
const TILE_WIDTH = 68;
const TILE_BOX = 44;
const SPARK_HEIGHT = 24;
const BAR_WIDTH = 3;
const BAR_GAP = 1;
/** The width eight bars take, so the flat line of "None" is as wide as a preset's sparkline. */
const SPARK_WIDTH = 8 * BAR_WIDTH + 7 * BAR_GAP;
const FLAT_LINE = 2;
const LABEL_SIZE = 11;
const CAPTION_SIZE = 12;
const clearRing = { borderWidth: theme.ring.borderWidth, borderColor: "transparent" };

/** A preset's shape as bars (height = speed / the top speed, of the sparkline's height); "None" (no shape) is a flat line. */
function Sparkline({ id, shape, color }: { id: string; shape: readonly number[] | null; color: string }) {
  if (!shape) {
    return (
      <View testID={`curve-spark-${id}`} style={{ height: SPARK_HEIGHT, justifyContent: "center" }}>
        <View testID={`curve-flat-${id}`} style={{ width: SPARK_WIDTH, height: FLAT_LINE, borderRadius: FLAT_LINE / 2, backgroundColor: color }} />
      </View>
    );
  }
  return (
    <View testID={`curve-spark-${id}`} style={{ height: SPARK_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: BAR_GAP }}>
      {shape.map((speed, i) => (
        <View key={i} testID={`curve-bar-${id}-${i}`} style={{ width: BAR_WIDTH, height: (speed / SPEED_LIMITS[1]) * SPARK_HEIGHT, borderRadius: BAR_WIDTH / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}
function CurveTile({ id, label, shape, selected, onPress }: { id: string; label: string; shape: readonly number[] | null; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs }}>
      <View testID={`curve-tile-${id}`} style={[{ width: TILE_BOX, height: TILE_BOX, borderRadius: theme.radius.card, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, selected ? theme.ring : clearRing]}>
        <Sparkline id={id} shape={shape} color={selected ? theme.colors.accent : theme.colors.textMuted} />
      </View>
      <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: selected ? theme.colors.accent : theme.colors.text, fontSize: LABEL_SIZE, marginTop: theme.space.xs }}>{label}</Body>
    </PressableScale>
  );
}

const LAYER_REFUSED = "That speed doesn't fit this layer.";

/**
 * A clip's or layer's speed: one constant speed (Normal) or a speed-curve preset (Curve). The ops keep the two exclusive.
 * `clipIds` (multi-select): every change is written to all of these main clips (the ops skip photos, and clips a curve would leave
 * too short); `clipId` is the clip whose values are shown.
 */
export function SpeedSheet({ clipId, clipIds, visible, onClose }: { clipId: string | null; clipIds?: string[]; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const count = useEditorStore((s) => (clipIds && s.project ? mainClipIds(s.project, clipIds).length : 0));
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={clipIds ? `Speed · ${count} ${count === 1 ? "clip" : "clips"}` : "Speed"}>
      {/* Mounted only while the sheet is open (and per clip), so it opens on the tab the clip's speed lives on. */}
      <SpeedBody key={clip.id} clip={clip} clipIds={clipIds} layer={layer} onClose={onClose} />
    </Sheet>
  );
}

function SpeedBody({ clip, clipIds, layer, onClose }: { clip: Clip; clipIds?: string[]; layer: boolean; onClose: () => void }) {
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const curveId = clip.speedCurve?.id ?? null;
  const [tab, setTab] = useState<Tab>(curveId ? "curve" : "normal");
  const sliderTint = curveId ? theme.colors.textMuted : theme.colors.accent;
  /** One clip op on the shown clip, or on every clip of the multi-selection (one project out, so one undo step). */
  const write = (p: Project, op: (p: Project, id: string) => Project) => (clipIds ? forClips(p, clipIds, op) : op(p, clip.id));

  const pickCurve = (id: SpeedCurveId | null) => {
    const project = useEditorStore.getState().project;
    if (!project) return;
    // Picking the active preset again is not skipped: the op re-spreads it over the clip's current trim.
    const next = write(project, (p, cid) => setClipSpeedCurve(p, cid, id));
    if (next === project) {
      // The same project for the tile that is already selected: nothing to change — silently.
      if (id === curveId) return;
      // Otherwise the op refused: the preset would leave the clip shorter than a clip may be (a layer: or break the layer rules).
      // (For a multi-selection: no selected clip could take it. Clips that can are changed; the others are skipped silently.)
      // The toast lives on the screen under this sheet's Modal, so the sheet closes first.
      onClose(); useToast.getState().show(clipIds ? "These clips are too short for a speed curve." : layer ? LAYER_REFUSED : "This clip is too short for a speed curve."); return;
    }
    haptic("light");
    apply(() => next);
  };

  const pickSpeed = (speed: number) => {
    const project = useEditorStore.getState().project;
    if (!project) return;
    const next = write(project, (p, cid) => setClipSpeed(p, cid, speed));
    // A layer whose new length would break the layer rules (too short, or a third video at once) is refused: the same project for
    // a speed that is not the current one. A main clip is never refused here (its speed is capped instead).
    if (next === project) { if (layer && (curveId !== null || speed !== clip.speed)) { onClose(); useToast.getState().show(LAYER_REFUSED); } return; }
    apply(() => next);
  };

  return (
    <>
      <View style={{ flexDirection: "row", gap: theme.space.sm }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}
      </View>
      {tab === "normal" ? (
        <>
          {curveId
            ? <Body muted>A curve is active — moving this slider removes it.</Body>
            : <Body muted>Current speed: {formatSpeed(clip.speed)}</Body>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
            {PRESETS.map((s) => <Chip key={s} label={formatSpeed(s)} selected={!curveId && clip.speed === s} onPress={() => pickSpeed(s)} />)}
          </View>
          {/* With a curve the clip's constant speed is 1, so the slider rests at 1× (muted); setClipSpeed clears the curve. */}
          <Slider testID="speed-slider" minimumValue={SPEED_LIMITS[0]} maximumValue={SPEED_LIMITS[1]} step={0.05} value={clip.speed}
            onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient((p) => write(p, (q, cid) => setClipSpeed(q, cid, v)))}
            minimumTrackTintColor={sliderTint} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={sliderTint} />
          {curveId ? null : <Body muted style={{ fontSize: CAPTION_SIZE }}>Audio keeps its pitch in the exported video.</Body>}
        </>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: theme.space.xs }}>
          <CurveTile id="none" label="None" shape={null} selected={curveId === null} onPress={() => pickCurve(null)} />
          {SPEED_CURVE_IDS.map((id) => <CurveTile key={id} id={id} label={SPEED_CURVES[id].label} shape={SPEED_CURVES[id].shape} selected={curveId === id} onPress={() => pickCurve(id)} />)}
        </View>
      )}
      <Body muted style={{ fontSize: CAPTION_SIZE }}>Clip length {clipDuration(clip).toFixed(1)} s</Body>
    </>
  );
}
