import { View } from "react-native";
import type { EffectItem } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { EffectPill } from "./EffectPill";

const NONE: EffectItem[] = [];

/** Third timeline lane: one pill per timeline effect. Adds height only; pills are out of the flow. */
export function EffectLane() {
  const effects = useEditorStore((s) => s.project?.effects ?? NONE);
  const selectedId = useEditorStore((s) => s.selectedEffectId);
  const { selectEffect } = useEditorStore.getState();
  return (
    <View testID="effect-lane" style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {effects.map((e) => (
        <EffectPill key={e.id} effect={e} selected={e.id === selectedId} onPress={() => selectEffect(e.id)} />
      ))}
    </View>
  );
}
