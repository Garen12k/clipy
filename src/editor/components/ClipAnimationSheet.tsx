import { useState } from "react";
import { ANIM_COMBO, ANIM_IN } from "@/src/editor/effects";
import { setAnimationForAllClips, setClipAnimation } from "@/src/editor/model/ops";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, COMBO_AS_MOTION, isPhoto, type AnimComboId, type AnimInId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { AnimationLength, AnimationTiles, animationStartX, edgeDuration } from "./AnimationTiles";

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
  // A photo's zoom and pan live in the Motion tool: its Combo row leaves those four out — unless the photo still holds one (an older
  // project), so it can be seen here and removed.
  const comboIds = isPhoto(clip) ? ANIM_COMBO_IDS.filter((id) => COMBO_AS_MOTION[id] === undefined || id === anim.combo) : ANIM_COMBO_IDS;

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
    <ToolStrip visible={visible} onClose={onClose} title="Animation"
      // "Apply to all" writes the main clips: it is not offered for a layer.
      action={layer ? undefined : { label: "Apply to all clips", onPress: () => { haptic("light"); apply((p) => setAnimationForAllClips(p, clip.animation)); } }}>
      <StripTiles key={tab} initialX={tab === "combo" ? animationStartX(comboIds, anim.combo) : animationStartX(ANIM_IN_IDS, edge?.id ?? null)} lead={TABS.map((t) => <Chip compact key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}>
        {tab === "combo"
          ? <AnimationTiles ids={comboIds} registry={ANIM_COMBO} selected={anim.combo} onPick={pickCombo} />
          : <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={edge?.id ?? null} onPick={(id) => pickEdge(tab, id)} />}
      </StripTiles>
      {tab === "combo" ? null : (
        <AnimationLength edge={edge} onStart={beginTransaction}
          onChange={(v) => { if (edge) applyTransient((p) => setClipAnimation(p, clip.id, { [tab]: { id: edge.id, duration: v } })); }} />
      )}
    </ToolStrip>
  );
}
