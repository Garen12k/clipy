import { useMemo, useState } from "react";
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
import { Slider } from "@/src/ui/Slider";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { StripNote, StripSlider, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

type Tab = "normal" | "curve";
const TABS: { id: Tab; label: string }[] = [{ id: "normal", label: "Normal" }, { id: "curve", label: "Curve" }];

/** A speed chip is about this wide (its text varies a little); only used to start the row near the selected one. */
const PRESET_WIDTH = 64;
/** The sparkline inside a curve tile's box (points). */
const SPARK_HEIGHT = 24;
const BAR_WIDTH = 3;
const BAR_GAP = 1;
/** The width eight bars take, so the flat line of "None" is as wide as a preset's sparkline. */
const SPARK_WIDTH = 8 * BAR_WIDTH + 7 * BAR_GAP;
const FLAT_LINE = 2;
/** 1×: the slider ticks lightly when a drag reaches or passes it. */
const REST = [1] as const;

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
    <Tile label={label} selected={selected} onPress={onPress} boxTestID={`curve-tile-${id}`}>
      <Sparkline id={id} shape={shape} color={selected ? theme.colors.accent : theme.colors.textMuted} />
    </Tile>
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
  if (!clip || !visible) return null;
  // Mounted only while the strip is open (and per clip), so it opens on the tab the clip's speed lives on.
  return <SpeedBody key={clip.id} clip={clip} clipIds={clipIds} layer={layer} onClose={onClose}
    title={clipIds ? `Speed · ${count} ${count === 1 ? "clip" : "clips"}` : "Speed"} />;
}

/** Renders the strip itself: it owns the tab, and the header's note depends on it. */
function SpeedBody({ clip, clipIds, layer, onClose, title }: { clip: Clip; clipIds?: string[]; layer: boolean; onClose: () => void; title: string }) {
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const curveId = clip.speedCurve?.id ?? null;
  const [tab, setTab] = useState<Tab>(curveId ? "curve" : "normal");
  // True from the slider's drag start to its end (two renders per drag, none per frame): the preset chips' ring follows the live
  // speed, and their lift must not spring while the slider is dragged.
  const [dragging, setDragging] = useState(false);
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
      // The strip closes first, so the bar and the message show.
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

  // While the curve warning shows it takes the header's room (two lines), so the clip length steps aside.
  const warn = tab === "normal" && curveId !== null;
  // Where the row starts: the selected chip or tile in view. Worked out when the strip opens (this body is mounted per opening and
  // per clip) and for another tab (the row is keyed to the tab) — NOT on every pick: a
  // ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => (tab === "normal" ? tilesStartX(PRESETS.findIndex((s) => !curveId && clip.speed === s), PRESET_WIDTH) : tilesStartX(curveId ? SPEED_CURVE_IDS.indexOf(curveId) + 1 : 0, TILE_WIDTH)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab],
  );

  return (
    <ToolStrip visible onClose={onClose} title={title}
      note={<>
        {warn ? null : <StripNote>Clip length {clipDuration(clip).toFixed(1)} s</StripNote>}
        {tab === "normal" ? <StripNote lines={warn ? 2 : 1}>{curveId ? "A curve is active — moving this slider removes it." : "Audio keeps its pitch in the exported video."}</StripNote> : null}
      </>}>
      <StripTiles key={tab} initialX={startX} lead={TABS.map((t) => <Chip compact key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}>
        {tab === "normal" ? (
          PRESETS.map((s) => <Chip key={s} still={dragging} label={formatSpeed(s)} selected={!curveId && clip.speed === s} onPress={() => pickSpeed(s)} />)
        ) : (
          <>
            <CurveTile id="none" label="None" shape={null} selected={curveId === null} onPress={() => pickCurve(null)} />
            {SPEED_CURVE_IDS.map((id) => <CurveTile key={id} id={id} label={SPEED_CURVES[id].label} shape={SPEED_CURVES[id].shape} selected={curveId === id} onPress={() => pickCurve(id)} />)}
          </>
        )}
      </StripTiles>
      {tab === "normal" ? (
        <StripSlider label={curveId ? "Speed" : "Current speed:"} value={curveId ? undefined : formatSpeed(clip.speed)}>
          {/* With a curve the clip's constant speed is 1, so the slider rests at 1× (muted); setClipSpeed clears the curve. */}
          <Slider testID="speed-slider" minimumValue={SPEED_LIMITS[0]} maximumValue={SPEED_LIMITS[1]} step={0.05} value={clip.speed}
            onSlidingStart={() => { setDragging(true); beginTransaction(); }} onValueChange={(v) => applyTransient((p) => write(p, (q, cid) => setClipSpeed(q, cid, v)))}
            onSlidingComplete={() => setDragging(false)}
            minimumTrackTintColor={sliderTint} thumbTintColor={sliderTint} detents={REST} />
        </StripSlider>
      ) : null}
    </ToolStrip>
  );
}
