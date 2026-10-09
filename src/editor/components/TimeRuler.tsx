import { memo, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { RULER, rulerMarks, rulerZoom } from "../timelineMarks";

/** The widest label is laid out in this much room; it starts right after its tick. */
const LABEL_W = 44, LABEL_LEAD = 3;
/** Out of the flow, at the clips' own start, with no size. */
const PLACE = { position: "absolute", left: 0, top: 0, width: 0, height: 0 } as const;

/**
 * The time marks along the top of the pinned clip area. Content of the timeline's own scroll view: it scrolls and zooms with the
 * clips by itself (every x is `timeToX`, as theirs), costs nothing while the timeline scrolls — it reads only the zoom and the
 * project's length, and is drawn again only when one of the two changes — and is out of the flow with no size and no touches, so it
 * changes neither the scroll width nor any height.
 *
 * `hold` (a pinch is going on): the marks are NOT built again on every frame. The ones there are stretch with the content — one plain
 * `scaleX` on this view, which has no width, so it stretches about the ruler's own start and every mark stays on its time — and are
 * built again only when the zoom has moved a step from the zoom they were built at (`rulerZoom`) and when the pinch ends. A style
 * value, not an animation: nothing here is timed or tweened.
 */
export const TimeRuler = memo(function TimeRuler({ hold = false }: { hold?: boolean }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  // Rounded to the millisecond the ops keep: a length that differs only in floating-point dust is not a new ruler.
  const duration = useEditorStore((s) => (s.project ? Math.round(totalDuration(s.project) * 1000) / 1000 : 0));
  // The zoom the marks on screen were built at: the zoom itself whenever no pinch holds it.
  const builtAt = useRef(pps);
  const built = rulerZoom(builtAt.current, pps, hold);
  builtAt.current = built;
  const marks = useMemo(() => rulerMarks(built, duration), [built, duration]);
  // The same elements while the marks are the same: a frame of a pinch changes this view's one style and nothing under it.
  const drawn = useMemo(() => (
    <>
      {marks.ticks.map((m) => (
        <View key={`t${m.t}`} testID="ruler-tick" style={{ position: "absolute", left: m.x, top: RULER.height - (m.major ? RULER.major : RULER.tick), width: 1, height: m.major ? RULER.major : RULER.tick, backgroundColor: m.major ? theme.colors.textMuted : theme.colors.track }} />
      ))}
      {marks.labels.map((m) => (
        <Text key={`l${m.t}`} testID="ruler-label" numberOfLines={1}
          style={{ position: "absolute", left: m.x + LABEL_LEAD, top: 0, width: LABEL_W, fontSize: theme.type.micro, color: theme.colors.textMuted, fontVariant: ["tabular-nums"] }}>{m.text}</Text>
      ))}
    </>
  ), [marks]);
  return (
    <View testID="time-ruler" pointerEvents="none" style={[PLACE, built === pps ? null : { transform: [{ scaleX: pps / built }] }]}>
      {drawn}
    </View>
  );
});
