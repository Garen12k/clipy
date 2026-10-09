import { memo, useRef, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { segmentPathOf, WAVE, waveSegments, type Peaks } from "@/src/editor/model/peaks";
import { timeToX } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_HEIGHT } from "../timelineLayout";
import { rulerZoom } from "../timelineMarks";

/** A bar's border: what lies inside it is this far from the bar's own edge. */
export const BAR_BORDER = 2;
const HEIGHT = LANE_HEIGHT - 2 * BAR_BORDER;
/** Inside the bar's border, clipped to it, under everything else the bar draws; never a touch target. */
const CLIP = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", borderRadius: theme.radius.chip - BAR_BORDER } as const;

/**
 * One piece of a file's outline: a hundred marks as ONE path. What it draws depends on the file, the zoom and its number only
 * (`segmentPathOf` remembers the path), so nothing that happens to a bar — a move, a trim, a split, a selection — and no tick of
 * the playhead draws it again.
 */
const WaveSegment = memo(function WaveSegment({ peaks, zoom, index }: { peaks: Peaks; zoom: number; index: number }) {
  const d = segmentPathOf(peaks, zoom, index, HEIGHT);
  return (
    <Svg testID="bar-wave-segment" width={WAVE.segment} height={HEIGHT} style={{ position: "absolute", left: index * WAVE.segment, top: 0 }}>
      <Path d={d} fill="none" stroke={theme.wave.ink} strokeOpacity={theme.wave.opacity} strokeWidth={WAVE.mark} />
    </Svg>
  );
});

type Props = {
  trackId: string; peaks: Peaks; trimStart: number;
  /** A pinch is going on: the segments are kept and stretched, as the time ruler's marks are. */
  hold?: boolean;
};

/**
 * The outline of a sound bar's file, drawn inside the bar (the bar renders it only when the outline is there).
 *
 * The row of segments is laid out in the FILE's time — segment i starts i × 300 pt from the file's own start — and the bar shows
 * its part of it: the row is shifted left by the trim-in (× the zoom: the bar's own time → x) and clipped by the bar. So the picture
 * is glued to the sound: moving the bar moves it along, trimming either end uncovers or covers it without building anything again,
 * and the two halves of a split bar draw the same segments.
 *
 * Only the segments on screen (and one screen-margin beside it) are mounted: the timeline's playhead stands at the middle of the
 * screen, so the playhead in the store IS where the timeline is scrolled to. The store is read through one selector that answers
 * with the first and last segment — a small string that changes when the scroll crosses a segment's edge, not on every tick — and
 * no scroll listener is added anywhere.
 *
 * During a pinch (`hold`) the segments stay the ones of the zoom they were built at and the row is stretched with one `scaleX`
 * (it has no width, so it stretches about the file's own start and every mark stays on its time); they are built again when the
 * zoom has moved a step (`rulerZoom`) and when the pinch ends. A style value, not an animation.
 */
export const BarWave = memo(function BarWave({ trackId, peaks, trimStart, hold = false }: Props) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const builtAt = useRef(pps);
  const zoom = rulerZoom(builtAt.current, pps, hold);
  builtAt.current = zoom;
  const half = useWindowDimensions().width / 2;
  const range = useEditorStore((s) => {
    const t = s.project?.audioTracks.find((v) => v.id === trackId);
    const r = t ? waveSegments({ playhead: s.playhead, start: t.start, trimStart: t.trimStart, trimEnd: t.trimEnd, duration: peaks.duration, zoom, pps: s.pixelsPerSecond, half }) : null;
    return r ? `${r.first}:${r.last}` : "";
  });
  if (!range) return null;
  const [first, last] = range.split(":").map(Number);
  const segments: ReactNode[] = [];
  for (let i = first; i <= last; i++) segments.push(<WaveSegment key={i} peaks={peaks} zoom={zoom} index={i} />);
  return (
    <View testID={`bar-wave-${trackId}`} pointerEvents="none" style={CLIP}>
      <View style={[{ position: "absolute", left: -timeToX(trimStart, pps) - BAR_BORDER, top: 0, width: 0, height: HEIGHT }, zoom === pps ? null : { transform: [{ scaleX: pps / zoom }] }]}>
        {segments}
      </View>
    </View>
  );
});
