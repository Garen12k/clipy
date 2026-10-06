import { useMemo, useState } from "react";
import { ANIM_IN, ANIM_LOOP } from "@/src/editor/effects";
import { setOverlayAnimation } from "@/src/editor/model/ops";
import { ANIM_IN_IDS, ANIM_LOOP_IDS, type AnimInId, type AnimLoopId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { AnimationLength, AnimationTiles, animationStartX, edgeDuration } from "./AnimationTiles";

type Tab = "in" | "out" | "loop";
const TABS: { id: Tab; label: string }[] = [{ id: "in", label: "In" }, { id: "out", label: "Out" }, { id: "loop", label: "Loop" }];

/** A text's or sticker's In, Out and Loop animations (independent of each other). Captions have none: the sheet renders nothing. */
export function OverlayAnimationSheet({ overlayId, visible, onClose }: { overlayId: string | null; visible: boolean; onClose: () => void }) {
  const overlay = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [tab, setTab] = useState<Tab>("in");
  // Where the row starts: the selected tile in view. Worked out when the strip opens, for another overlay and for another tab (the
  // row is keyed to the tab) — NOT on every pick: a
  // ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => {
      if (!overlay || overlay.kind === "caption") return 0;
      const a = overlay.animation;
      return tab === "loop" ? animationStartX(ANIM_LOOP_IDS, a.loop) : animationStartX(ANIM_IN_IDS, a[tab]?.id ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, overlay?.id, tab],
  );
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
    <ToolStrip visible={visible} onClose={onClose} title="Animation">
      <StripTiles key={tab} initialX={startX} lead={TABS.map((t) => <Chip compact key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}>
        {tab === "loop"
          ? <AnimationTiles ids={ANIM_LOOP_IDS} registry={ANIM_LOOP} selected={anim.loop} onPick={pickLoop} />
          : <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={edge?.id ?? null} onPick={(id) => pickEdge(tab, id)} />}
      </StripTiles>
      {tab === "loop" ? null : (
        <AnimationLength edge={edge} onStart={beginTransaction}
          onChange={(v) => { if (edge) applyTransient((p) => setOverlayAnimation(p, overlay.id, { [tab]: { id: edge.id, duration: v } })); }} />
      )}
    </ToolStrip>
  );
}
