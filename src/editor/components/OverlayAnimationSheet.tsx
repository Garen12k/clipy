import { useState } from "react";
import { View } from "react-native";
import { ANIM_IN, ANIM_LOOP } from "@/src/editor/effects";
import { setOverlayAnimation } from "@/src/editor/model/ops";
import { ANIM_IN_IDS, ANIM_LOOP_IDS, type AnimInId, type AnimLoopId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { AnimationLength, AnimationTiles, edgeDuration } from "./AnimationTiles";

type Tab = "in" | "out" | "loop";
const TABS: { id: Tab; label: string }[] = [{ id: "in", label: "In" }, { id: "out", label: "Out" }, { id: "loop", label: "Loop" }];

/** A text's or sticker's In, Out and Loop animations (independent of each other). Captions have none: the sheet renders nothing. */
export function OverlayAnimationSheet({ overlayId, visible, onClose }: { overlayId: string | null; visible: boolean; onClose: () => void }) {
  const overlay = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [tab, setTab] = useState<Tab>("in");
  if (!overlay || overlay.kind === "caption") return null;
  const anim = overlay.animation;
  const edge = tab === "loop" ? null : anim[tab];

  const pickEdge = (which: "in" | "out", id: AnimInId | null) => {
    if ((anim[which]?.id ?? null) === id) return;
    haptic("light");
    apply((p) => setOverlayAnimation(p, overlay.id, { [which]: id === null ? null : { id, duration: edgeDuration(anim[which]) } }));
  };
  const pickLoop = (id: AnimLoopId | null) => {
    if (anim.loop === id) return;
    haptic("light");
    apply((p) => setOverlayAnimation(p, overlay.id, { loop: id }));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Animation">
      <View style={{ flexDirection: "row", gap: theme.space.sm }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}
      </View>
      {tab === "loop" ? (
        <AnimationTiles ids={ANIM_LOOP_IDS} registry={ANIM_LOOP} selected={anim.loop} onPick={pickLoop} />
      ) : (
        <>
          <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={edge?.id ?? null} onPick={(id) => pickEdge(tab, id)} />
          <AnimationLength edge={edge} onStart={beginTransaction}
            onChange={(v) => { if (edge) applyTransient((p) => setOverlayAnimation(p, overlay.id, { [tab]: { id: edge.id, duration: v } })); }} />
        </>
      )}
    </Sheet>
  );
}
