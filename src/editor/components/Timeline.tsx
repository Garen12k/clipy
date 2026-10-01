import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipStartTimes, timeToX, xToTime } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT, TIMELINE_HEIGHT } from "../timelineLayout";
import { ClipThumbStrip } from "./ClipThumbStrip";

/** Horizontal strip of clips. The playhead is fixed at the horizontal centre; scrolling scrubs. */
export function Timeline({ renderStripExtras }: { renderStripExtras?: (clipId: string, index: number) => React.ReactNode }) {
  const { width: screenW } = useWindowDimensions();
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const missing = useEditorStore((s) => s.missingClipIds);
  const { seek, select, setZoom, setPlaying } = useEditorStore.getState();

  const scrollRef = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const [basePps, setBasePps] = useState(pps);
  const pad = screenW / 2;

  // Follow the playhead while playing or when it is changed programmatically.
  useEffect(() => {
    if (userScrolling.current) return;
    scrollRef.current?.scrollTo({ x: timeToX(playhead, pps), animated: false });
  }, [playhead, pps]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!userScrolling.current) return;
    seek(xToTime(e.nativeEvent.contentOffset.x, pps));
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => { setBasePps(useEditorStore.getState().pixelsPerSecond); })
    .onUpdate((e) => { setZoom(basePps * e.scale); })
    .runOnJS(true);

  if (!project) return null;
  const starts = clipStartTimes(project);

  return (
    <GestureDetector gesture={pinch}>
      <View style={{ height: TIMELINE_HEIGHT, justifyContent: "center" }}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScrollBeginDrag={() => { userScrolling.current = true; setPlaying(false); }}
          onMomentumScrollEnd={() => { userScrolling.current = false; }}
          onScrollEndDrag={(e) => { if (e.nativeEvent.velocity?.x === 0) userScrolling.current = false; }}
          onScroll={onScroll}
          contentContainerStyle={{ paddingHorizontal: pad, alignItems: "center", gap: 4, height: TIMELINE_HEIGHT }}>
          {project.clips.map((clip, i) => (
            <ClipThumbStrip key={clip.id} clip={clip} pixelsPerSecond={pps} selected={clip.id === selectedId} missing={missing.includes(clip.id)}
              onPress={() => { select(clip.id === selectedId ? null : clip.id); seek(starts[i]); }}>
              {renderStripExtras?.(clip.id, i)}
            </ClipThumbStrip>
          ))}
        </ScrollView>
        <View pointerEvents="none" style={{ position: "absolute", left: pad - 1, top: (TIMELINE_HEIGHT - STRIP_HEIGHT) / 2 - 8, width: 2, height: STRIP_HEIGHT + 16, backgroundColor: theme.colors.highlight, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}
