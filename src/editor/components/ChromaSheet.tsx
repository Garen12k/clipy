import { Switch, View } from "react-native";
import { isKeyable } from "@/src/editor/model/chroma";
import { setClipChroma } from "@/src/editor/model/ops";
import { CHROMA, CHROMA_PRESETS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Slider } from "@/src/ui/Slider";
import { StripNote, StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { ColorRow } from "./ColorRow";

const PRESET_LABELS = ["Green", "Blue"] as const;
const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** The selected clip's or layer's green screen: a switch, the colour to remove (Green, Blue or any colour) and how strongly. One undo step per change or drag. */
export function ChromaSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  const { beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  const key = clip.chroma;
  const on = key !== null;
  const color = key?.color ?? CHROMA_PRESETS[0];
  const strength = key?.strength ?? CHROMA.defaultStrength;
  const toggle = (next: boolean) => apply((p) => setClipChroma(p, clip.id, next ? { color: CHROMA_PRESETS[0], strength: CHROMA.defaultStrength } : null));
  /** A colour pick keeps the strength; ignored while the switch is off. */
  const pickColor = (hex: string) => { if (key) apply((p) => setClipChroma(p, clip.id, { color: hex, strength: key.strength })); };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Green screen"
      note={on && !isKeyable(color) ? <StripNote numberOfLines={2}>This colour is too grey to remove. Pick a stronger colour.</StripNote> : <StripNote>Shows in the exported video</StripNote>}>
      <StripTiles lead={<Switch accessibilityLabel="Green screen" value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />}>
        <View pointerEvents={on ? "auto" : "none"} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, opacity: on ? 1 : 0.4 }}>
          {CHROMA_PRESETS.map((hex, i) => <Chip key={hex} label={PRESET_LABELS[i]} selected={on && same(color, hex)} disabled={!on} onPress={() => pickColor(hex)} />)}
          <ColorRow compact value={color} onChange={pickColor} />
        </View>
      </StripTiles>
      <StripSlider label="Strength" value={`${Math.round(strength * 100)} %`}>
        <Slider
          testID="chroma-strength"
          minimumValue={0} maximumValue={1} step={0.01}
          value={strength} disabled={!on}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setClipChroma(p, clip.id, { color, strength: v }))}
        />
      </StripSlider>
    </ToolStrip>
  );
}
