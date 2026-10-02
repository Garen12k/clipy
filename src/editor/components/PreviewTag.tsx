import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";

/** Small chip shown over the preview when a filter or transition is affecting the current frame. */
export function PreviewTag({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View
      testID="preview-tag"
      pointerEvents="none"
      style={{
        position: "absolute", left: 8, top: 8, overflow: "hidden",
        borderWidth: 1, borderColor: theme.colors.hairline,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 8, paddingVertical: 3,
      }}
    >
      <View style={{ position: "absolute", inset: 0, backgroundColor: theme.colors.surfaceAlt, opacity: 0.8 }} />
      <Body style={{ fontSize: 12 }}>Preview</Body>
    </View>
  );
}
