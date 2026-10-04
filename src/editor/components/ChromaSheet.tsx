import Slider from "@react-native-community/slider";
import { Switch, View } from "react-native";
import { setClipChroma } from "@/src/editor/model/ops";
import { CHROMA, CHROMA_PRESETS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
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
    <Sheet visible={visible} onClose={onClose} title="Green screen">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body>Remove a colour</Body>
        <Switch accessibilityLabel="Green screen" value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />
      </View>
      <View pointerEvents={on ? "auto" : "none"} style={{ opacity: on ? 1 : 0.4, gap: theme.space.sm, marginTop: theme.space.sm }}>
        <View style={{ flexDirection: "row", gap: theme.space.sm }}>
          {CHROMA_PRESETS.map((hex, i) => <Chip key={hex} label={PRESET_LABELS[i]} selected={on && same(color, hex)} disabled={!on} onPress={() => pickColor(hex)} />)}
        </View>
        <ColorRow value={color} onChange={pickColor} />
        <Slider
          testID="chroma-strength"
          minimumValue={0} maximumValue={1} step={0.01}
          value={strength} disabled={!on}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setClipChroma(p, clip.id, { color, strength: v }))}
          minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
        />
        <Body muted style={{ fontSize: 12 }}>Strength {Math.round(strength * 100)} %</Body>
      </View>
      <Body muted style={{ fontSize: 12, marginTop: theme.space.sm }}>Shows in the exported video</Body>
    </Sheet>
  );
}
