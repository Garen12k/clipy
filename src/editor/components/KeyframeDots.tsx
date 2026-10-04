import { Pressable, View } from "react-native";
import { timeToX } from "@/src/editor/model/timeline";
import { theme } from "@/src/theme/theme";

const DOT = 8;

type Props = { times: number[]; width: number; pps: number; onPress: (time: number) => void };

/** Small diamonds at each time (seconds from the item's left edge). Absolutely positioned children: they never change the host's layout. */
export function KeyframeDots({ times, width, pps, onPress }: Props) {
  return (
    <>
      {times.map((t, index) => {
        const x = timeToX(t, pps);
        if (!(x >= 0 && x <= width)) return null;
        return (
          <Pressable key={index} testID={`keyframe-dot-${index}`} accessibilityRole="button" accessibilityLabel="Keyframe" hitSlop={8}
            onPress={() => onPress(t)} style={{ position: "absolute", left: x - DOT / 2, top: 4, width: DOT, height: DOT }}>
            <View style={{ width: DOT, height: DOT, transform: [{ rotate: "45deg" }], backgroundColor: theme.colors.accent, borderWidth: 1, borderColor: theme.colors.bg }} />
          </Pressable>
        );
      })}
    </>
  );
}
