import { Pressable } from "react-native";
import { setBackgroundForAllClips, setClipBackground } from "@/src/editor/model/ops";
import type { ClipBackground } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Body } from "@/src/ui/Text";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { CONTENT_BLACK, PALETTE } from "./ColorRow";

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
    <ToolStrip visible={visible} onClose={onClose} title="Background" action={{ label: "Apply to all", onPress: () => { haptic("light"); apply((p) => setBackgroundForAllClips(p, clip.background)); } }}>
      <StripTiles>
        <Pressable accessibilityRole="button" accessibilityLabel="Black" accessibilityState={{ selected: bg.type === "black" }} onPress={() => choose({ type: "black" })}
          style={[{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: CONTENT_BLACK, borderWidth: 1, borderColor: theme.colors.hairline }, ringOrClear(bg.type === "black")]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Blur" accessibilityState={{ selected: bg.type === "blur" }} onPress={() => choose({ type: "blur" })}
          style={[{ height: SWATCH, borderRadius: SWATCH / 2, paddingHorizontal: theme.space.md, justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, ringOrClear(bg.type === "blur")]}>
          <Body weight="semi">Blur</Body>
        </Pressable>
        {PALETTE.filter((c) => c.toUpperCase() !== CONTENT_BLACK).map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Color ${c}`} accessibilityState={{ selected: isColor(c) }} onPress={() => choose({ type: "color", color: c })}
            style={[{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: c }, ringOrClear(isColor(c))]} />
        ))}
      </StripTiles>
    </ToolStrip>
  );
}
