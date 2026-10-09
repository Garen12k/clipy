import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { CLIP_AREA_HEIGHT } from "../timelineLayout";
import { CUT, type CutMark } from "../timelineMarks";
import { openStrip } from "../toolStrip";

/**
 * What a tap on a cut's marker does — exactly what the Transition tool does for that cut: the clip BEFORE the cut is selected
 * (a transition is that clip's `transitionOut`), then the Transition strip is opened, so its key is that clip.
 */
export function openCutTransition(index: number): void {
  const s = useEditorStore.getState();
  const clip = s.project?.clips[index];
  if (!clip) return;
  s.select(clip.id);
  openStrip("transition");
}

type Props = { mark: CutMark; onPress?: (index: number) => void };

const DIAMOND = 8;

/**
 * The marker on the cut after clip `mark.index`: a gold diamond in a dark disc where the cut carries a transition, a "+" in a slate
 * disc where it has none. Either opens the Transition strip for that cut. Where it stands and how wide its target is come from
 * `cutMarks` (beside the trim handle at a selected clip's cuts, never on it); the target is 44 pt high and has no hit slop, so it is
 * exactly what is laid out. A tap only: it is a Pressable, with no gesture of its own to compete with a trim or a move.
 */
export const CutMarker = memo(function CutMarker({ mark, onPress }: Props) {
  const { index, x, width, has } = mark;
  return (
    <Pressable
      testID={`cut-marker-${index}`}
      accessibilityRole="button"
      accessibilityLabel={has ? `Transition after clip ${index}` : `Add transition after clip ${index}`}
      onPress={() => (onPress ?? openCutTransition)(index)}
      style={{ position: "absolute", left: x - width / 2, top: (CLIP_AREA_HEIGHT - CUT.targetHeight) / 2, width, height: CUT.targetHeight, alignItems: "center", justifyContent: "center" }}
    >
      <View testID={`cut-disc-${index}`} style={{ width: CUT.disc, height: CUT.disc, borderRadius: CUT.disc / 2, alignItems: "center", justifyContent: "center",
        backgroundColor: has ? theme.elevation.page : theme.elevation.tile, borderWidth: 1, borderColor: has ? theme.colors.accent : theme.colors.track }}>
        {has
          ? <View testID={`cut-diamond-${index}`} style={{ width: DIAMOND, height: DIAMOND, backgroundColor: theme.colors.accent, transform: [{ rotate: "45deg" }] }} />
          : <Ionicons testID={`cut-add-${index}`} name="add-outline" size={theme.size.icon.sm} color={theme.colors.text} />}
      </View>
    </Pressable>
  );
});
