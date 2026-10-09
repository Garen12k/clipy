import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ASPECT_RATIOS, aspectLabel, DEFAULT_ASPECT_RATIO, frameAspect, type AspectRatio } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { RatioShape } from "@/src/ui/RatioShape";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import type { PickedAsset } from "./storage";

/** The photo library is still sliding away when the picked media arrives, and iOS drops a Modal presented during that: the sheet waits this long. */
export const AFTER_PICKER_MS = 350;
const PER_ROW = 3;
/** One choice: a box with the shape over its label. */
const OPTION = { width: 88, height: 76 } as const;
const ROWS = Array.from({ length: Math.ceil(ASPECT_RATIOS.length / PER_ROW) }, (_, i) => ASPECT_RATIOS.slice(i * PER_ROW, (i + 1) * PER_ROW));

type Props = {
  /** The media just picked for a new project; null = hidden. */ assets: PickedAsset[] | null;
  /** Closed without choosing: nothing is created. */ onCancel: () => void;
  onCreate: (ratio: AspectRatio) => void;
};

/** Asked once, when a project is created: the frame's shape. Auto (the first picked item's shape) is preselected. */
export function AspectRatioSheet({ assets, onCancel, onCreate }: Props) {
  const [ratio, setRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO);
  // Every new pick starts from Auto again.
  useEffect(() => { if (assets) setRatio(DEFAULT_ASPECT_RATIO); }, [assets]);
  // Keep drawing the last media while the sheet fades out, so Auto's shape does not jump.
  const last = useRef<PickedAsset[]>([]);
  if (assets) last.current = assets;
  const shown = assets ?? last.current;
  return (
    <Sheet visible={!!assets} onClose={onCancel} title="Aspect ratio">
      <View testID="aspect-options" style={{ gap: theme.space.sm }}>
        {ROWS.map((row) => (
          <View key={row[0]} style={{ height: OPTION.height, flexDirection: "row", justifyContent: "space-between" }}>
            {row.map((id) => {
              const selected = id === ratio;
              const tint = selected ? theme.colors.accent : theme.colors.text;
              return (
                <PressableScale key={id} lifted={selected} accessibilityRole="button" accessibilityLabel={aspectLabel(id)} accessibilityState={{ selected }} onPress={() => setRatio(id)}
                  style={[{ width: OPTION.width, height: OPTION.height, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center", gap: theme.space.sm,
                    backgroundColor: selected ? theme.screen.lifted : theme.screen.tile }, selected ? theme.ring : theme.ringClear]}>
                  <RatioShape aspect={frameAspect({ aspectRatio: id, clips: shown })} selected={selected} dashed={id === "auto"} />
                  <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: tint, fontSize: theme.type.small }}>{aspectLabel(id)}</Body>
                </PressableScale>
              );
            })}
          </View>
        ))}
      </View>
      <Body muted style={{ fontSize: theme.type.small, textAlign: "center" }}>Auto fits your first photo or video. You can change it later.</Body>
      <PrimaryButton title="Create" onPress={() => onCreate(ratio)} />
    </Sheet>
  );
}
