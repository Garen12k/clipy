import { useState } from "react";
import { View } from "react-native";
import { ANIM_COMBO, ANIM_IN } from "@/src/editor/effects";
import { setAnimationForAllClips, setClipAnimation } from "@/src/editor/model/ops";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, type AnimComboId, type AnimInId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { AnimationLength, AnimationTiles, edgeDuration } from "./AnimationTiles";

type Tab = "in" | "out" | "combo";
const TABS: { id: Tab; label: string }[] = [{ id: "in", label: "In" }, { id: "out", label: "Out" }, { id: "combo", label: "Combo" }];

/** A clip's In / Out or Combo animation. The op keeps edges and combo exclusive; the tabs only show what the clip holds. */
export function ClipAnimationSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [tab, setTab] = useState<Tab>("in");
  if (!clip) return null;
  const anim = clip.animation;
  const edge = tab === "combo" ? null : anim[tab];

  const pickEdge = (which: "in" | "out", id: AnimInId | null) => {
    if ((anim[which]?.id ?? null) === id) return;
    haptic("light");
    apply((p) => setClipAnimation(p, clip.id, { [which]: id === null ? null : { id, duration: edgeDuration(anim[which]) } }));
  };
  const pickCombo = (id: AnimComboId | null) => {
    if (anim.combo === id) return;
    haptic("light");
    apply((p) => setClipAnimation(p, clip.id, { combo: id }));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Animation"
      // "Apply to all" writes the main clips: it is not offered for a layer.
      action={layer ? undefined : { label: "Apply to all clips", onPress: () => { haptic("light"); apply((p) => setAnimationForAllClips(p, clip.animation)); } }}>
      <View style={{ flexDirection: "row", gap: theme.space.sm }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}
      </View>
      {tab === "combo" ? (
        <AnimationTiles ids={ANIM_COMBO_IDS} registry={ANIM_COMBO} selected={anim.combo} onPick={pickCombo} />
      ) : (
        <>
          <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={edge?.id ?? null} onPick={(id) => pickEdge(tab, id)} />
          <AnimationLength edge={edge} onStart={beginTransaction}
            onChange={(v) => { if (edge) applyTransient((p) => setClipAnimation(p, clip.id, { [tab]: { id: edge.id, duration: v } })); }} />
        </>
      )}
    </Sheet>
  );
}
