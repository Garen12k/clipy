import type { TextStyle, ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** The box of all three button kinds: an explicit height (48, compact 36), a pill, a centred row. */
export const buttonBox = (compact?: boolean): ViewStyle => ({
  height: compact ? theme.size.controlCompact : theme.size.control, paddingHorizontal: compact ? theme.space.lg : theme.space.xl,
  borderRadius: theme.radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm,
});
/** The label of all three: bold, upper case, 14 pt (compact 13). The colour is the kind's. */
export const buttonLabel = (compact?: boolean): TextStyle => ({
  fontFamily: theme.fonts.bodyBold, fontSize: compact ? theme.type.label : theme.type.body, letterSpacing: 1, textTransform: "uppercase",
});
export const DISABLED_OPACITY = 0.4;
