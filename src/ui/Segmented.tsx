import { Pressable, Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "./buttonStyle";
import { useSurfaces } from "./tone";

export type Segment<T> = { value: T; label: string; disabled?: boolean };
type Props<T> = { options: readonly Segment<T>[]; value: T; onChange: (value: T) => void; testID?: string };

/** The track is one touch target high; the segments sit inside its padding and reach its edges with their slop. */
const INSET = theme.space.xs;
const SLOP = { top: INSET, bottom: INSET } as const;

/**
 * A pick-one row of segments: one rounded track (a tile step of the family it is drawn in), equal segments, the picked one a
 * lighter step with semibold text. Each segment is a button that says whether it is selected; a disabled one is dimmed and inert.
 * Nothing animates — the pick just moves — so it is a plain Pressable, not PressableScale. Labels are shown as typed.
 */
export function Segmented<T extends string | number>({ options, value, onChange, testID }: Props<T>) {
  const s = useSurfaces();
  return (
    <View testID={testID} style={{ flexDirection: "row", height: theme.size.touch, padding: INSET, gap: INSET, borderRadius: theme.radius.field, backgroundColor: s.tile }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{ selected, disabled: !!o.disabled }}
            disabled={o.disabled} onPress={() => onChange(o.value)} hitSlop={SLOP}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.chip, opacity: o.disabled ? DISABLED_OPACITY : 1, ...(selected ? { backgroundColor: s.lifted } : null) }}>
            <Text numberOfLines={1} style={{ fontSize: theme.type.body, fontWeight: selected ? theme.weight.semi : theme.weight.regular, color: s.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
