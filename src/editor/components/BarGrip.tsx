import { View } from "react-native";
import { theme } from "@/src/theme/theme";

/** What a bar's handle adds to its style so the grip sits in its middle. */
export const GRIP_BOX = { alignItems: "center", justifyContent: "center" } as const;

/** The grip line on a selected bar's white handle: dark on white, drawing only — the handle's gesture and size are untouched. */
export function BarGrip() {
  return <View testID="bar-grip" pointerEvents="none" style={{ width: 2, height: 12, borderRadius: 1, backgroundColor: theme.colors.onKind }} />;
}
