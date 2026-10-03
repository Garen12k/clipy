import { useEffect, useMemo, useRef } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipStartTimes, timeToX, totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { CLIP_AREA_HEIGHT, TIMELINE_HEIGHT } from "../timelineLayout";
import { createScrubController } from "../timelineScroll";
import { AddClipTile } from "./AddClipTile";
import { ClipThumbStrip } from "./ClipThumbStrip";
import { CutMarker } from "./CutMarker";
import { MusicLane } from "./MusicLane";
import { OverlayLane } from "./OverlayLane";

type Props = { renderStripExtras?: (clipId: string, index: number) => React.ReactNode; onCutPress?: (index: number) => void };

/** Horizontal strip of clips. The playhead is fixed at the horizontal centre; scrolling scrubs. */
export function Timeline({ renderStripExtras, onCutPress }: Props) {
  const { width: screenW } = useWindowDimensions();
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const selectedId = useEditorStore((s) => s.selectedClipId);
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

  const offsetX = (e: NativeSyntheticEvent<NativeScrollEvent>) => e.nativeEvent.contentOffset.x;

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
      <View style={{ height: TIMELINE_HEIGHT, justifyContent: "center", backgroundColor: theme.colors.bgDeep }}>
        <ScrollView ref={scrollRef} testID="timeline-scroll" horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScrollBeginDrag={scrub.onBeginDrag}
          onMomentumScrollBegin={scrub.onMomentumBegin}
          onMomentumScrollEnd={(e) => scrub.onEnd(offsetX(e), pps)}
          onScrollEndDrag={(e) => scrub.onEnd(offsetX(e), pps)}
          onScroll={(e) => scrub.onScroll(offsetX(e), pps)}
          contentContainerStyle={{ paddingHorizontal: pad, height: TIMELINE_HEIGHT, flexDirection: "column" }}>
          <View style={{ height: CLIP_AREA_HEIGHT, flexDirection: "row", alignItems: "center" }}>
            {project.clips.map((clip, i) => (
              <ClipThumbStrip key={clip.id} clip={clip} pixelsPerSecond={pps} selected={clip.id === selectedId} missing={missing.includes(clip.sourceUri)}
                onPress={() => { select(clip.id === selectedId ? null : clip.id); seek(starts[i]); }}>
                {renderStripExtras?.(clip.id, i)}
              </ClipThumbStrip>
            ))}
            {project.clips.map((clip, i) =>
              i < project.clips.length - 1 && clip.transitionOut.type !== "none" ? (
                <CutMarker key={`cut-${clip.id}`} index={i} pixelsPerSecond={pps} onPress={onCutPress} />
              ) : null,
            )}
            {/* Out of the flow, inside the trailing padding: the scrubbable width still ends at the last clip. */}
            <AddClipTile left={timeToX(totalDuration(project), pps) + theme.space.sm} />
          </View>
          <OverlayLane />
          <MusicLane />
        </ScrollView>
        <View pointerEvents="none" style={{ position: "absolute", left: pad - 1, top: 8, width: 2, height: TIMELINE_HEIGHT - 16, backgroundColor: theme.colors.text, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}
