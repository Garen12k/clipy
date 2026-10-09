import type { TextStyle, ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** The box of all three button kinds: an explicit height (48, compact 36), a pill, a centred row. */
export const buttonBox = (compact?: boolean): ViewStyle => ({
  height: compact ? theme.size.controlCompact : theme.size.control, paddingHorizontal: compact ? theme.space.lg : theme.space.xl,
  borderRadius: theme.radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm,
});
/** The label of all three: semibold, as typed (title-style capitals are in the string), 17 pt (compact 15). The colour is the kind's. */
export const buttonLabel = (compact?: boolean): TextStyle => ({
  fontSize: compact ? theme.type.body : theme.type.headline, fontWeight: theme.weight.semi,
});
/** Compact is 36 pt high: 4 pt of slop each way makes its target 44 — where the parent is at least that high (slop never reaches outside it). */
const COMPACT_SLOP = { top: (theme.size.touch - theme.size.controlCompact) / 2, bottom: (theme.size.touch - theme.size.controlCompact) / 2 } as const;
/** The `hitSlop` of all three: none for a regular button (48), the vertical slop to 44 for a compact one. */
export const buttonSlop = (compact?: boolean) => (compact ? COMPACT_SLOP : undefined);
export const DISABLED_OPACITY = 0.4;
