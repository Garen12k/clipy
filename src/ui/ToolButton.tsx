import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

/**
 * The editor's bottom bar in points: the capsule's height, a tool's height inside it and the group button's width. A tool is at
 * least `theme.size.control` wide (above the 44-pt target) and at most `theme.size.toolColumn` plus its own inset.
 */
export const TOOLBAR = { height: 64, tool: 56, group: 52 } as const;
/** The group button's chevron: as high as its 11-pt name. */
const CHEVRON = 12;

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean;
  /**
   * `tile` (default): the symbol in a square tile over its label — a strip's row of tools. `bar`: the bottom bar's tool — the symbol
   * over its label with nothing behind it; `active` adds a lighter capsule behind both (and the gold). `group`: the bar's group
   * button — a `bar` tool on its own tile, with a small chevron after the name.
   */
  variant?: "tile" | "bar" | "group";
  /** A destructive tool (Delete): red symbol, red label. `bar` only. */
  danger?: boolean;
  /** What VoiceOver reads when it is not the label. */
  accessibilityLabel?: string; testID?: string };

export function ToolButton({ label, icon, onPress, disabled, active, variant = "tile", danger, accessibilityLabel, testID }: Props) {
  if (variant !== "tile") {
    const group = variant === "group";
    const ink = danger ? theme.colors.danger : active ? theme.colors.accent : theme.colors.text;
    const text = danger ? theme.colors.dangerText : active ? theme.colors.accent : theme.colors.text;
    return (
      <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
        disabled={disabled} onPress={onPress} style={[{ height: TOOLBAR.tool, alignItems: "center", justifyContent: "center", gap: theme.space.xs, borderRadius: theme.radius.box,
          opacity: disabled ? 0.35 : 1, backgroundColor: group ? theme.elevation.tile : active ? theme.elevation.lifted : undefined },
          group ? { width: TOOLBAR.group } : { minWidth: theme.size.control, maxWidth: theme.size.toolColumn + theme.space.sm, paddingHorizontal: theme.space.xs }]}>
        <Ionicons name={icon} size={theme.size.icon.lg} color={ink} />
        {group ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flexShrink: 1, fontWeight: theme.weight.semi, color: text, fontSize: theme.type.micro }}>{label}</Text>
            <Ionicons name="chevron-down-outline" size={CHEVRON} color={theme.colors.text} />
          </View>
        ) : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontWeight: active ? theme.weight.semi : theme.weight.regular, color: text, fontSize: theme.type.small }}>{label}</Text>}
      </PressableScale>
    );
  }
  return (
    <PressableScale lifted={!!active} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled} onPress={onPress} style={{ alignItems: "center", width: theme.size.toolColumn, paddingVertical: theme.space.xs, gap: theme.space.xs, opacity: disabled ? 0.35 : 1 }}>
      <View style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: active ? theme.elevation.lifted : theme.elevation.tile }, active ? theme.ring : theme.ringClear]}>
        <Ionicons name={icon} size={theme.size.icon.md} color={active ? theme.colors.accent : theme.colors.text} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontWeight: active ? theme.weight.semi : theme.weight.regular, color: active ? theme.colors.accent : theme.colors.text, fontSize: theme.type.small }}>{label}</Text>
    </PressableScale>
  );
}
