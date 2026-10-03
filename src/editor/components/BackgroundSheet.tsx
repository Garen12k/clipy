import { Pressable, View } from "react-native";
import { setBackgroundForAllClips, setClipBackground } from "@/src/editor/model/ops";
import type { ClipBackground } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { PALETTE } from "./ColorRow";

const SWATCH = 36;
const ringOrClear = (selected: boolean) => (selected ? theme.ring : { borderWidth: 2, borderColor: "transparent" });

export function BackgroundSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const apply = useEditorStore((s) => s.apply);
  if (!clip) return null;
  const bg = clip.background;
  const choose = (next: ClipBackground) => { haptic("light"); apply((p) => setClipBackground(p, clip.id, next)); };
  const isColor = (c: string) => bg.type === "color" && bg.color.toUpperCase() === c.toUpperCase();

  return (
    <Sheet visible={visible} onClose={onClose} title="Background" action={{ label: "Apply to all", onPress: () => apply((p) => setBackgroundForAllClips(p, clip.background)) }}>
      <Body muted>Shown around a clip that does not fill the frame.</Body>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: theme.space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Black" accessibilityState={{ selected: bg.type === "black" }} onPress={() => choose({ type: "black" })}
          style={[{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: theme.colors.bgDeep }, ringOrClear(bg.type === "black")]} />
        {PALETTE.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Color ${c}`} accessibilityState={{ selected: isColor(c) }} onPress={() => choose({ type: "color", color: c })}
            style={[{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: c }, ringOrClear(isColor(c))]} />
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Blur" accessibilityState={{ selected: bg.type === "blur" }} onPress={() => choose({ type: "blur" })}
          style={[{ height: SWATCH, borderRadius: SWATCH / 2, paddingHorizontal: theme.space.md, justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, ringOrClear(bg.type === "blur")]}>
          <Body weight="semi">Blur</Body>
        </Pressable>
      </View>
    </Sheet>
  );
}
