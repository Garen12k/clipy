import { useEffect, useMemo, useRef } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipStartTimes, timeToX, xToTime } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { CLIP_AREA_HEIGHT, TIMELINE_HEIGHT } from "../timelineLayout";
import { ClipThumbStrip } from "./ClipThumbStrip";
import { MusicLane } from "./MusicLane";
import { OverlayLane } from "./OverlayLane";

/** Horizontal strip of clips. The playhead is fixed at the horizontal centre; scrolling scrubs. */
export function Timeline({ renderStripExtras }: { renderStripExtras?: (clipId: string, index: number) => React.ReactNode }) {
  const { width: screenW } = useWindowDimensions();
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const { seek, select, setZoom, setPlaying } = useEditorStore.getState();

  const scrollRef = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const basePps = useRef(pps);
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

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => { basePps.current = useEditorStore.getState().pixelsPerSecond; })
        .onUpdate((e) => { setZoom(basePps.current * e.scale); })
        .runOnJS(true),
    [],
  );

  if (!project) return null;
  const starts = clipStartTimes(project);

  return (
    <GestureDetector gesture={pinch}>
      <View style={{ height: TIMELINE_HEIGHT, justifyContent: "center" }}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScrollBeginDrag={() => { userScrolling.current = true; setPlaying(false); }}
          onMomentumScrollBegin={() => { userScrolling.current = true; }}
          onMomentumScrollEnd={() => {
            userScrolling.current = false;
            scrollRef.current?.scrollTo({ x: timeToX(useEditorStore.getState().playhead, pps), animated: false });
          }}
          onScrollEndDrag={() => {
            userScrolling.current = false;
            scrollRef.current?.scrollTo({ x: timeToX(useEditorStore.getState().playhead, pps), animated: false });
          }}
          onScroll={onScroll}
          contentContainerStyle={{ paddingHorizontal: pad, height: TIMELINE_HEIGHT }}>
          <View style={{ height: CLIP_AREA_HEIGHT, flexDirection: "row", alignItems: "center" }}>
            {project.clips.map((clip, i) => (
              <ClipThumbStrip key={clip.id} clip={clip} pixelsPerSecond={pps} selected={clip.id === selectedId} missing={missing.includes(clip.sourceUri)}
                onPress={() => { select(clip.id === selectedId ? null : clip.id); seek(starts[i]); }}>
                {renderStripExtras?.(clip.id, i)}
              </ClipThumbStrip>
            ))}
          </View>
          <OverlayLane />
          <MusicLane />
        </ScrollView>
        <View pointerEvents="none" style={{ position: "absolute", left: pad - 1, top: 8, width: 2, height: TIMELINE_HEIGHT - 16, backgroundColor: theme.colors.highlight, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}
