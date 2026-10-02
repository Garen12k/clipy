import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { Clip } from "@/src/editor/model/types";
import { formatSpeed } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT, stripWidth, thumbInterval, thumbTimes } from "../timelineLayout";
import { getThumb } from "./thumbnails";

type Props = { clip: Clip; pixelsPerSecond: number; selected: boolean; missing: boolean; onPress: () => void; children?: React.ReactNode };

export function ClipThumbStrip({ clip, pixelsPerSecond, selected, missing, onPress, children }: Props) {
  const width = stripWidth(clip, pixelsPerSecond);
  const times = thumbTimes(clip, pixelsPerSecond);
  const slotWidth = thumbInterval(pixelsPerSecond) * pixelsPerSecond;
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (missing) return;
    let alive = true;
    times.forEach((t) => getThumb(clip.sourceUri, t).then((uri) => { if (alive) setThumbs((s) => (s[t] ? s : { ...s, [t]: uri })); }).catch(() => {}));
    return () => { alive = false; };
  }, [clip.sourceUri, missing, times.join(",")]);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Clip ${clip.id}`} accessibilityState={{ selected }}
      style={{ width, height: STRIP_HEIGHT, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt,
        borderWidth: 2, borderColor: selected ? theme.colors.accent : "transparent",
        borderRightWidth: 2, borderRightColor: theme.colors.bgDeep, flexDirection: "row" }}>
      {times.map((t, i) => (
        <View key={t} style={{ width: Math.min(slotWidth, width - i * slotWidth), height: STRIP_HEIGHT, overflow: "hidden" }}>
          {thumbs[t] ? <Image source={{ uri: thumbs[t] }} style={{ width: slotWidth, height: STRIP_HEIGHT }} resizeMode="cover" /> : null}
        </View>
      ))}
      {missing && (
        <View style={{ position: "absolute", top: 4, left: 4, backgroundColor: theme.colors.danger, borderRadius: 999, padding: 2 }}>
          <Ionicons name="warning" size={14} color={theme.colors.text} />
        </View>
      )}
      <View style={{ position: "absolute", bottom: 4, left: 4, flexDirection: "row", gap: 4 }}>
        {clip.speed !== 1 && (
          <View style={{ backgroundColor: theme.colors.accent, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ fontSize: 10, color: theme.colors.onAccent, fontWeight: "700" }}>{formatSpeed(clip.speed)}</Text>
          </View>
        )}
        {clip.filter && (
          <View style={{ backgroundColor: theme.colors.sea, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ fontSize: 10, color: theme.colors.text, fontWeight: "700" }}>f</Text>
          </View>
        )}
      </View>
      {children}
    </Pressable>
  );
}
