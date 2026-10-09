import { memo, useMemo } from "react";
import { Text, View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { RULER, rulerMarks } from "../timelineMarks";

/** The widest label is laid out in this much room; it starts right after its tick. */
const LABEL_W = 44, LABEL_LEAD = 3;

/**
 * The time marks along the top of the pinned clip area. Content of the timeline's own scroll view: it scrolls and zooms with the
 * clips by itself (every x is `timeToX`, as theirs), costs nothing while the timeline scrolls — it reads only the zoom and the
 * project's length, and is drawn again only when one of the two changes — and is out of the flow with no size and no touches, so it
 * changes neither the scroll width nor any height.
 */
export const TimeRuler = memo(function TimeRuler() {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  // Rounded to the millisecond the ops keep: a length that differs only in floating-point dust is not a new ruler.
  const duration = useEditorStore((s) => (s.project ? Math.round(totalDuration(s.project) * 1000) / 1000 : 0));
  const marks = useMemo(() => rulerMarks(pps, duration), [pps, duration]);
  return (
    <View testID="time-ruler" pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {marks.ticks.map((m) => (
        <View key={`t${m.t}`} testID="ruler-tick" style={{ position: "absolute", left: m.x, top: RULER.height - (m.major ? RULER.major : RULER.tick), width: 1, height: m.major ? RULER.major : RULER.tick, backgroundColor: m.major ? theme.colors.textMuted : theme.colors.track }} />
      ))}
      {marks.labels.map((m) => (
        <Text key={`l${m.t}`} testID="ruler-label" numberOfLines={1}
          style={{ position: "absolute", left: m.x + LABEL_LEAD, top: 0, width: LABEL_W, fontSize: theme.type.micro, color: theme.colors.textMuted, fontVariant: ["tabular-nums"] }}>{m.text}</Text>
      ))}
    </View>
  );
});
