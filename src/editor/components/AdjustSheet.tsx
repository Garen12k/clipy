import { useState } from "react";
import { View } from "react-native";
import { isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { lookKey, setStrength, useAutoLooks } from "@/src/editor/autoLook";
import { autoState, autoValues, valuesOf } from "@/src/editor/model/autoEnhance";
import { resetClipAdjust, setAdjustForAllClips, setClipAdjust } from "@/src/editor/model/ops";
import { ADJUST_KEYS, ADJUST_RANGE, isNeutralAdjust, type AdjustKey } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AUTO_WORDS, sourceOf, useAutoEnhance } from "@/src/editor/useAutoEnhance";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { QuietButton } from "@/src/ui/QuietButton";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

export const ADJUST_LABELS: Record<AdjustKey, string> = {
  brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", exposure: "Exposure", temperature: "Warmth", tint: "Tint",
  highlights: "Highlights", shadows: "Shadows", sharpen: "Sharpen", vignette: "Vignette", fade: "Fade", grain: "Grain",
};
/** 0: a two-sided control ticks lightly when a drag reaches or passes its centre. */
const CENTRE = [0] as const;
/** 100 %: Auto's strength at rest. */
const FULL = [1] as const;
/** Auto's row: in the slider row's place, as high (STRIP.slider). */
const ROW = { height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter } as const;
const step = (v: number): number => Math.round(v * 100) / 100 + 0;

export function AdjustSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [key, setKey] = useState<AdjustKey | "auto">("brightness");
  const auto = useAutoEnhance(clip?.id ?? null, visible);
  const look = clip ? lookKey(sourceOf(clip)) : "";
  const target = useAutoLooks((s) => s.targets[look]);
  const applied = useAutoLooks((s) => s.applied[look]);
  if (!clip) return null;
  const state = target && applied ? autoState(valuesOf(clip.adjust), target, applied.base, applied.strength) : null;
  const picked = key === "auto";

  const pickAuto = () => {
    if (!isFrameStatsAvailable()) { useToast.getState().show(AUTO_TOOLS); return; }   // the chip is not picked; nothing changes
    haptic("light");
    setKey("auto");
    void auto.run(clip.id);
  };
  // Main clips only, as the copy-to-all is: a layer's Adjust offers no Apply to All.
  const autoAll = layer ? null : <QuietButton compact title="Apply to All" onPress={() => { haptic("light"); void auto.runAll(); }} />;

  const note = !picked || auto.busy || !state ? undefined
    : state.kind === "set" ? <StripNote lines={2} accessibilityLabel={state.line}>{state.line}</StripNote>
    : <StripNote lines={2}>{AUTO_WORDS.good}</StripNote>;

  const autoRow = () => {
    if (auto.busy) {
      const words = auto.busy.all ? AUTO_WORDS.lookingAll(auto.busy.at, auto.busy.of) : AUTO_WORDS.looking;
      return (
        <View testID="auto-row" style={ROW}>
          <Spinner label={words} />
          <Body muted numberOfLines={1} style={{ flex: 1, fontSize: theme.type.small }}>{words}</Body>
          <QuietButton compact title="Cancel" onPress={auto.stop} />
        </View>
      );
    }
    if (state?.kind === "set" && target && applied) {
      const set = (v: number) => {
        const at = step(v);
        setStrength(look, at);
        applyTransient((p) => setClipAdjust(p, clip.id, autoValues(target, applied.base, at)));
      };
      return (
        <StripSlider label={AUTO_WORDS.strength} value={`${Math.round(state.strength * 100)}%`} trailing={autoAll}>
          <Slider testID="auto-strength" minimumValue={0} maximumValue={1} step={0.01} value={state.strength}
            onSlidingStart={beginTransaction} onValueChange={set} onSlidingComplete={(v) => setStrength(look, step(v))} detents={FULL} />
        </StripSlider>
      );
    }
    return (
      <View testID="auto-row" style={ROW}>
        <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{AUTO_WORDS.hint}</Body>
        {autoAll}
      </View>
    );
  };

  const adjustKey = picked ? "brightness" : key;
  const [lo, hi] = ADJUST_RANGE[adjustKey];
  const value = clip.adjust[adjustKey];
  const pct = Math.round(value * 100);
  const neutral = isNeutralAdjust(clip.adjust);

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Adjust" note={note}
      // "Apply to all" writes the main clips: it is not offered for a layer. While Auto is picked it is Auto's, in the row below.
      action={layer || picked ? undefined : { label: "Apply to All", onPress: () => { haptic("light"); apply((p) => setAdjustForAllClips(p, clip.adjust)); } }}>
      <StripTiles>
        <Chip key="auto" label="Auto" icon="color-wand-outline" selected={picked} onPress={pickAuto} />
        {ADJUST_KEYS.map((k) => (
          <Chip key={k} label={clip.adjust[k] !== 0 ? `${ADJUST_LABELS[k]} •` : ADJUST_LABELS[k]} accessibilityLabel={ADJUST_LABELS[k]} selected={key === k} onPress={() => setKey(k)} />
        ))}
      </StripTiles>
      {picked ? autoRow() : (
        <StripSlider label={ADJUST_LABELS[adjustKey]} value={`${lo < 0 && pct > 0 ? "+" : ""}${pct}`}
          trailing={<QuietButton compact title="Reset" disabled={neutral} onPress={() => { haptic("light"); apply((p) => resetClipAdjust(p, clip.id)); }} />}>
          <Slider
            testID="adjust-slider"
            minimumValue={lo} maximumValue={hi} step={0.01}
            value={value}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => applyTransient((p) => setClipAdjust(p, clip.id, { [adjustKey]: v }))}
            detents={lo < 0 ? CENTRE : undefined}
          />
        </StripSlider>
      )}
    </ToolStrip>
  );
}
