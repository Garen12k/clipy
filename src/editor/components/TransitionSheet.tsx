import { useRef, useState } from "react";
import { useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { TRANSITIONS } from "@/src/editor/effects";
import { setTransition, transitionCap } from "@/src/editor/model/ops";
import { TRANSITION_LIMITS, TRANSITION_TYPES, type TransitionType } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { STRIP, StripNote, StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

type Props = { clipIndex: number; visible: boolean; onClose: () => void };

/**
 * The chips' row. It lives inside the strip, so it is mounted afresh at every opening (`ToolStrip` renders nothing while closed) —
 * its measurements and the row's start begin again each time. Chips have different widths: each one's wrapper reports its place, and
 * ONCE — when the chip that was selected at opening and the last chip are both known — the row is started at that chip, one tile
 * from the left, never past the row's end (React Native does not clamp a ScrollView's contentOffset). Later picks never move the row.
 */
function TransitionChips({ current, onPick }: { current: TransitionType; onPick: (type: TransitionType) => void }) {
  const { width: windowW } = useWindowDimensions();
  const spots = useRef(new Map<TransitionType, { x: number; width: number }>()).current;
  const placed = useRef(false);
  const chosenAtOpening = useRef(current).current;
  const [startX, setStartX] = useState(0);
  const last = TRANSITION_TYPES[TRANSITION_TYPES.length - 1];
  const onChipLayout = (type: TransitionType) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    spots.set(type, { x, width });
    const chosen = spots.get(chosenAtOpening), end = spots.get(last);
    if (placed.current || !chosen || !end) return;
    placed.current = true;
    const rowEnd = end.x + end.width + theme.space.gutter - windowW;      // the content ends one gutter after the last chip
    setStartX(Math.max(0, Math.min(chosen.x - theme.size.toolColumn, rowEnd)));
  };
  return (
    <StripTiles initialX={startX}>
      {TRANSITION_TYPES.map((type) => (
        // As high as the row, so the chip's touch slop stays inside its parent (a chip is 36 pt, its target 44).
        <View key={type} testID={`transition-chip-${type}`} onLayout={onChipLayout(type)} style={{ height: STRIP.tiles, justifyContent: "center" }}>
          <Chip label={TRANSITIONS[type].label} selected={current === type} onPress={() => onPick(type)} />
        </View>
      ))}
    </StripTiles>
  );
}

export function TransitionSheet({ clipIndex, visible, onClose }: Props) {
  const project = useEditorStore((s) => s.project);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!project) return null;
  const clip = project.clips[clipIndex];
  if (!clip) return null;

  if (clipIndex >= project.clips.length - 1) {
    return (
      <ToolStrip visible={visible} onClose={onClose} title="Transition">
        <Body muted style={{ paddingHorizontal: theme.space.gutter }}>No clip after this one</Body>
      </ToolStrip>
    );
  }

  const cap = transitionCap(project, clipIndex);
  const current = clip.transitionOut;

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Transition" note={cap < TRANSITION_LIMITS.min ? <StripNote lines={2}>Clips are too short for a transition here</StripNote> : undefined}>
      <TransitionChips key={clip.id} current={current.type}
        onPick={(type) => { if (current.type !== type) haptic("light"); apply((p) => setTransition(p, clip.id, { type, duration: type === "none" ? 0 : Math.min(0.5, cap) })); }} />
      <StripSlider label="" value={`${current.duration.toFixed(2)} s`}>
        <Slider
          testID="transition-slider"
          minimumValue={TRANSITION_LIMITS.min}
          maximumValue={cap}
          step={0.05}
          value={current.duration}
          disabled={current.type === "none" || cap < 0.3}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setTransition(p, clip.id, { type: current.type, duration: v }))}
        />
      </StripSlider>
    </ToolStrip>
  );
}
