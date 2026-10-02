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
        borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong,
        paddingHorizontal: 8, paddingVertical: 3,
      }}
    >
      <Body weight="semi" style={{ fontSize: 10, color: theme.colors.accent }}>Preview</Body>
    </View>
  );
}
