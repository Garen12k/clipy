import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "./buttonStyle";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Title } from "./Text";
import { useSurfaces } from "./tone";

type Props = {
  title: string;
  /** What the round button at the leading edge is: a back chevron (a pushed screen) or a close X (a sheet). */
  leading: "back" | "close";
  onLeading: () => void;
  /** Dimmed and inert (e.g. Close while an export runs). */
  leadingDisabled?: boolean;
  /** The button's accessibility label. Defaults to "Back" / "Close". */
  leadingLabel?: string;
};

/** The circle that is drawn; `SLOP` each way makes its target 44 pt — the bar's own height, so the slop stays inside it. */
const CIRCLE = theme.size.controlCompact;
const SLOP = (theme.size.touch - CIRCLE) / 2;
/** The symbol in the circle. */
export const LEADING_ICON = { back: "chevron-back-outline", close: "close-outline" } as const;
const LABELS = { back: "Back", close: "Close" } as const;

/**
 * The small top bar of a screen: a round back or close button at the leading edge and the title centred — nothing trailing
 * (an empty box as wide as the button keeps the title in the middle). The circle is a step of the family the screen wears
 * (tone.ts), so the bar is right on a navy screen and on an editor-tone one. Nothing here is animated.
 */
export function ScreenBar({ title, leading, onLeading, leadingDisabled, leadingLabel }: Props) {
  const s = useSurfaces();
  return (
    <View testID="screen-bar" style={{ height: theme.size.header, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={leadingLabel ?? LABELS[leading]} accessibilityState={{ disabled: !!leadingDisabled }}
        disabled={leadingDisabled} onPress={onLeading} hitSlop={SLOP}
        style={{ width: CIRCLE, height: CIRCLE, borderRadius: theme.radius.pill, backgroundColor: s.tile, alignItems: "center", justifyContent: "center", opacity: leadingDisabled ? DISABLED_OPACITY : 1 }}>
        <Icon name={LEADING_ICON[leading]} size={theme.size.icon.md} color={s.text} />
      </PressableScale>
      <Title size={theme.type.headline} accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>{title}</Title>
      <View testID="screen-bar-trailing" style={{ width: CIRCLE }} />
    </View>
  );
}
