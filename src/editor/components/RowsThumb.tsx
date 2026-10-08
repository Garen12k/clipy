import { View } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { CLIP_AREA_HEIGHT, rowsThumb } from "../timelineLayout";

/** How far the timeline's rows are scrolled up (points). Transient: not saved, not undoable. Written only by the Timeline. */
export const useRowsScroll = create<{ y: number }>(() => ({ y: 0 }));

const WIDTH = 3, INSET = 2;

/**
 * The thin thumb at the timeline's right edge that says its rows scroll, and how far (`rowsThumb`); nothing when every row shows.
 * It is not in the scroll content — it stays at the screen's edge — takes no touches, and is the only subscriber of the rows'
 * position: scrolling the rows re-renders this view, not the timeline. A plain view placed by its style: nothing is animated.
 */
export function RowsThumb({ viewport, content }: { viewport: number; content: number }) {
  const y = useRowsScroll((s) => s.y);
  const thumb = rowsThumb({ y, viewport, content });
  if (!thumb) return null;
  return <View testID="timeline-rows-thumb" pointerEvents="none" style={{ position: "absolute", right: INSET, top: CLIP_AREA_HEIGHT + thumb.top, width: WIDTH, height: thumb.height, borderRadius: theme.radius.pill, backgroundColor: theme.colors.textMuted }} />;
}
