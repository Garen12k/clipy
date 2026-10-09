import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipStartTimes, timeToX, totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { barIds, barRow, CLIP_AREA_HEIGHT, laneModel, rowScrollTarget, timelineFrame } from "../timelineLayout";
import { cutMarks } from "../timelineMarks";
import { createScrubController } from "../timelineScroll";
import { AddClipTile } from "./AddClipTile";
import { AudioLane } from "./AudioLane";
import { BeatTicks } from "./BeatTicks";
import { ClipThumbStrip } from "./ClipThumbStrip";
import { CutMarker } from "./CutMarker";
import { EffectLane } from "./EffectLane";
import { LayerLane } from "./LayerLane";
import { OverlayLane } from "./OverlayLane";
import { RowsThumb, useRowsScroll } from "./RowsThumb";
import { TimeRuler } from "./TimeRuler";
import { SnapGuide } from "./SnapGuide";

type Props = { renderStripExtras?: (clipId: string, index: number) => React.ReactNode; onCutPress?: (index: number) => void };

const offsetX = (e: NativeSyntheticEvent<NativeScrollEvent>) => e.nativeEvent.contentOffset.x;

/**
 * Horizontal strip of clips. The playhead is fixed at the horizontal centre; scrolling scrubs.
 * The clip area (`CLIP_AREA_HEIGHT`) holds, top to bottom, the time ruler, the beat ticks and the clips (`timelineMarks.ts` has the
 * division); the ruler and the cut markers are out of the flow, so they change no height and no scroll width.
 * Its height is `timelineFrame`: the clip area and the rows under it up to a cap. The rows sit in ONE vertical scroll view that is a
 * child of the horizontal one's content, under the clip area — so there is still a single sideways scroll (the scrub controller and
 * every bar's x are untouched), the clips stay where they are while the rows go up and down under them, and the two directions are
 * told apart by iOS itself (nested scroll views: a drag belongs to the one that scrolls its way). That rows view is always mounted —
 * with rows that fit it is as high as they are and cannot scroll, so a small project is exactly what it was — and it reaches through
 * the side paddings (negative margin, the same padding inside) so a bar past the last clip is still drawn there.
 * Bars need nothing new: their gestures are gesture-handler recognizers, which never run together with a scroll view's own — a bar
 * move (after its long press) or a handle (3 pt sideways) that has begun ends the scroll views' drag for that touch, both ways.
 */
export function Timeline({ renderStripExtras, onCutPress }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const selectedId = useEditorStore((s) => s.selectedClipId);
  /** Whatever is selected (one thing at a time: the store clears the others) — a bar under the clips, or a main clip. */
  const chosen = useEditorStore((s) => s.selectedClipId ?? s.selectedOverlayId ?? s.selectedAudioId ?? s.selectedEffectId);
  /** Multi-select mode: a tap on a clip toggles it (no seek, no single selection) and the gold border marks the chosen clips. */
  const multi = useEditorStore((s) => s.multiSelect);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const { seek, select, setZoom } = useEditorStore.getState();

  const scrollRef = useRef<ScrollView>(null);
  const basePps = useRef(pps);
  const pad = screenW / 2;
  const scrub = useRef(createScrubController({
    scrollTo: (x) => scrollRef.current?.scrollTo({ x, animated: false }),
    seek: (t) => useEditorStore.getState().seek(t),
    pause: () => useEditorStore.getState().setPlaying(false),
  })).current;

  // Follow the playhead while playing or when it is changed programmatically (never while the user scrolls).
  useEffect(() => { scrub.follow(playhead, pps); }, [playhead, pps, scrub]);

  // Only the lanes that hold something are shown (laneModel is the one rule). Lanes change the height only — never the scroll width or paddings.
  const model = laneModel(project);
  // How much of that height is on screen (timelineFrame is the one rule): past its cap the rows scroll and the height stops.
  const { height, viewport, content, scrolls } = timelineFrame(model, screenH);

  // The rows' own up-and-down scroll. Where it is lives in a ref (and in the thumb's store) — never in this component's state.
  const rowsRef = useRef<ScrollView>(null);
  const rowsY = useRef(0);
  const seen = useRef<{ project: string | null; chosen: string | null; bars: string[] }>({ project: null, chosen: null, bars: [] });
  const audioTracks = project?.audioTracks, layers = project?.layers, overlays = project?.overlays, effects = project?.effects;
  const bars = useMemo(() => barIds(audioTracks && layers && overlays && effects ? { audioTracks, layers, overlays, effects } : null), [audioTracks, layers, overlays, effects]);
  const barsKey = bars.join("|");
  useEffect(() => { useRowsScroll.setState({ y: 0 }); }, []);
  /**
   * Brings a row into view, in one jump (no animation): the row of a bar that was just ADDED (a new layer, sound, text, effect —
   * also by Undo), else the row of the bar that has just been SELECTED. Nothing else moves the rows: not a drag (it changes neither
   * which bars there are nor the selection), not a slider, not the playhead, not opening the project. It also brings the rows back
   * inside what there is when rows were removed under them.
   */
  useEffect(() => {
    const was = seen.current, p = useEditorStore.getState().project;
    seen.current = { project: p?.id ?? null, chosen, bars };
    const same = !!p && was.project === p.id;
    const added = same ? bars.filter((id) => !was.bars.includes(id)) : [];
    const show = added.length ? added[added.length - 1] : same && chosen !== was.chosen ? chosen : null;
    const to = rowScrollTarget({ y: rowsY.current, viewport, content, row: show ? barRow(p, show) : null });
    if (to === rowsY.current) return;
    rowsY.current = to;
    useRowsScroll.setState({ y: to });
    rowsRef.current?.scrollTo({ y: to, animated: false });
    // `bars` is read through its key: the same ids in a new array are not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, barsKey, viewport, content]);

  // True from the moment a pinch is recognised (not from a first finger: a tap or a scroll never sets it) until it is over, however
  // it ends. Only the ruler reads it: it keeps its marks and stretches them instead of building them again on every frame.
  const [pinching, setPinching] = useState(false);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => { basePps.current = useEditorStore.getState().pixelsPerSecond; })
        .onStart(() => { setPinching(true); })
        .onUpdate((e) => { setZoom(basePps.current * e.scale); })
        .onFinalize(() => { setPinching(false); })
        .runOnJS(true),
    [],
  );
  const clips = project?.clips;
  // The same marks (and so the same markers) while the cuts, the zoom and the selection are the same: the playhead draws none again.
  const inMulti = multi !== null;
  const marks = useMemo(() => (clips ? cutMarks({ clips }, pps, selectedId, inMulti) : []), [clips, pps, selectedId, inMulti]);

  if (!project) return null;
  const starts = clipStartTimes(project);
  const { lanes } = model;

  return (
    <GestureDetector gesture={pinch}>
      <View testID="timeline-root" style={{ height, justifyContent: "center", backgroundColor: theme.colors.timeline }}>
        <ScrollView ref={scrollRef} testID="timeline-scroll" horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScrollBeginDrag={scrub.onBeginDrag}
          onMomentumScrollBegin={scrub.onMomentumBegin}
          onMomentumScrollEnd={(e) => scrub.onEnd(offsetX(e), pps)}
          onScrollEndDrag={(e) => scrub.onEnd(offsetX(e), pps)}
          onScroll={(e) => scrub.onScroll(offsetX(e), pps)}
          contentContainerStyle={{ paddingHorizontal: pad, height, flexDirection: "column" }}>
          <View testID="timeline-clips" style={{ height: CLIP_AREA_HEIGHT, flexDirection: "row", alignItems: "center" }}>
            {/* The time marks along the top: out of the flow, drawn only when the zoom or the length changes — and during a pinch only stretched. */}
            <TimeRuler hold={pinching} />
            {project.clips.map((clip, i) => (
              <ClipThumbStrip key={clip.id} clip={clip} pixelsPerSecond={pps} selected={multi ? multi.includes(clip.id) : clip.id === selectedId} missing={missing.includes(clip.sourceUri)}
                onPress={multi ? () => useEditorStore.getState().toggleMultiSelect(clip.id) : () => { select(clip.id === selectedId ? null : clip.id); seek(starts[i]); }}>
                {renderStripExtras?.(clip.id, i)}
              </ClipThumbStrip>
            ))}
            {/* On the cuts, after the clips (so above them): a diamond where there is a transition, "+" where there is none (cutMarks). */}
            {marks.map((mark) => <CutMarker key={`cut-${project.clips[mark.index].id}`} mark={mark} onPress={onCutPress} />)}
            {/* Out of the flow, inside the trailing padding: the scrubbable width still ends at the last clip. */}
            <AddClipTile left={timeToX(totalDuration(project), pps) + theme.space.sm} />
            <BeatTicks />
          </View>
          {/* The rows under the clips, in their own up-and-down scroll (see above). Always mounted, whether or not there is a row. */}
          <ScrollView ref={rowsRef} testID="timeline-rows" scrollEnabled={scrolls} bounces={false} directionalLockEnabled scrollsToTop={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16}
            onScroll={(e) => { const y = e.nativeEvent.contentOffset.y; rowsY.current = y; useRowsScroll.setState({ y }); }}
            style={{ height: viewport, flexGrow: 0, flexShrink: 0, marginHorizontal: -pad }} contentContainerStyle={{ paddingHorizontal: pad }}>
            {/* Keyed by the lane: one that appears or goes leaves the others (and the scroll views) mounted. They stack in the model's order; the layers lane is as many rows as there are layers. */}
            {lanes.map(({ id }) =>
              id === "layers" ? <LayerLane key={id} /> : id === "overlays" ? <OverlayLane key={id} /> : id === "effects" ? <EffectLane key={id} /> : <AudioLane key={id} kind={id} />,
            )}
          </ScrollView>
          <SnapGuide left={pad} height={height} />
        </ScrollView>
        <View testID="timeline-playhead" pointerEvents="none" style={{ position: "absolute", left: pad - 1, top: 8, width: 2, height: height - 16, backgroundColor: theme.colors.text, borderRadius: 1 }} />
        <RowsThumb viewport={viewport} content={content} />
      </View>
    </GestureDetector>
  );
}
