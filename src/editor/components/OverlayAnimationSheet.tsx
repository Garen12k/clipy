import { useMemo, useState } from "react";
import { revealNeedsBuild } from "@/modules/clipy-video/reveal";
import { ANIM_IN, ANIM_LOOP, ANIM_REVEAL } from "@/src/editor/effects";
import { setOverlayAnimation } from "@/src/editor/model/ops";
import { ANIM_IN_IDS, ANIM_LOOP_IDS, ANIM_REVEAL_IDS, isRevealId, type AnimInId, type AnimLoopId, type OverlayAnimation, type RevealId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { REVEAL_TOOLS } from "@/src/lib/buildInfo";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { AnimationLength, AnimationTiles, animationStartX, edgeDuration } from "./AnimationTiles";

type Tab = "in" | "out" | "loop";
const TABS: { id: Tab; label: string }[] = [{ id: "in", label: "In" }, { id: "out", label: "Out" }, { id: "loop", label: "Loop" }];
/** A text's In row: the ten whole-text animations, then Typewriter and Word by word (texts only, In only — spec section 7). */
const TEXT_IN_IDS: readonly (AnimInId | RevealId)[] = [...ANIM_IN_IDS, ...ANIM_REVEAL_IDS];
const TEXT_IN = { ...ANIM_IN, ...ANIM_REVEAL };

/** The Length slider's patch: the open tab's edge with a new length; null while that edge is None. */
function lengthPatch(a: OverlayAnimation, tab: "in" | "out", v: number): Partial<OverlayAnimation> | null {
  if (tab === "in") return a.in ? { in: { id: a.in.id, duration: v } } : null;
  return a.out ? { out: { id: a.out.id, duration: v } } : null;
}

/** A text's or sticker's In, Out and Loop animations (independent of each other); a text's In may also be Typewriter or Word by word. Captions have none: the sheet renders nothing. */
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
      return tab === "loop" ? animationStartX(ANIM_LOOP_IDS, a.loop) : animationStartX<AnimInId | RevealId>(overlay.kind === "text" && tab === "in" ? TEXT_IN_IDS : ANIM_IN_IDS, a[tab]?.id ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, overlay?.id, tab],
  );
  if (!overlay || overlay.kind === "caption") return null;
  const anim = overlay.animation;
  const edge = tab === "loop" ? null : anim[tab];
  const inIds: readonly (AnimInId | RevealId)[] = overlay.kind === "text" ? TEXT_IN_IDS : ANIM_IN_IDS;

  const pickIn = (id: AnimInId | RevealId | null) => {
    if ((anim.in?.id ?? null) === id) return;
    if (id !== null && isRevealId(id) && revealNeedsBuild()) { useToast.getState().show(REVEAL_TOOLS); return; }
    haptic("light");
    const edge = id === null ? null : { id, duration: edgeDuration(anim.in) };
    apply((p) => setOverlayAnimation(p, overlay.id, { in: edge }));
  };
  const pickOut = (id: AnimInId | null) => {
    if ((anim.out?.id ?? null) === id) return;
    haptic("light");
    const edge = id === null ? null : { id, duration: edgeDuration(anim.out) };
    apply((p) => setOverlayAnimation(p, overlay.id, { out: edge }));
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
          : tab === "in"
            ? <AnimationTiles ids={inIds} registry={TEXT_IN} selected={anim.in?.id ?? null} onPick={pickIn} />
            : <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={anim.out?.id ?? null} onPick={pickOut} />}
      </StripTiles>
      {tab === "loop" ? null : (
        <AnimationLength edge={edge} onStart={beginTransaction}
          onChange={(v) => { const patch = lengthPatch(anim, tab, v); if (patch) applyTransient((p) => setOverlayAnimation(p, overlay.id, patch)); }} />
      )}
    </ToolStrip>
  );
}
