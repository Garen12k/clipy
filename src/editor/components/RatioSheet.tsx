import { View } from "react-native";
import { setAspectRatio } from "@/src/editor/model/ops";
import { ASPECT_RATIOS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

export function RatioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useEditorStore((s) => s.project?.aspectRatio);
  const apply = useEditorStore((s) => s.apply);
  return (
    <Sheet visible={visible} onClose={onClose} title="Aspect ratio">
      <Body muted>9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.</Body>
      <View style={{ flexDirection: "row", gap: theme.space.md }}>
        {ASPECT_RATIOS.map((r) => <Chip key={r} label={r} selected={r === current} onPress={() => { apply((p) => setAspectRatio(p, r)); onClose(); }} />)}
      </View>
    </Sheet>
  );
}
