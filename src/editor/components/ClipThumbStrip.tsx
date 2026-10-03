import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { isPhoto, type Clip } from "@/src/editor/model/types";
import { formatSpeed } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT, stripWidth, thumbInterval, thumbTimes } from "../timelineLayout";
import { getThumb } from "./thumbnails";

const thumbKey = (uri: string, t: number) => `${uri}@${t}`;

type Props = { clip: Clip; pixelsPerSecond: number; selected: boolean; missing: boolean; onPress: () => void; children?: React.ReactNode };

export function ClipThumbStrip({ clip, pixelsPerSecond, selected, missing, onPress, children }: Props) {
  const width = stripWidth(clip, pixelsPerSecond);
  const times = thumbTimes(clip, pixelsPerSecond);
  const slotWidth = thumbInterval(pixelsPerSecond) * pixelsPerSecond;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const photo = isPhoto(clip);

  useEffect(() => {
    if (missing || photo) return;
    let alive = true;
    // Keyed by source as well as time: Replace keeps the clip id (and this component), so old thumbnails must not satisfy the new source.
    times.forEach((t) => {
      const key = thumbKey(clip.sourceUri, t);
      getThumb(clip.sourceUri, t).then((uri) => { if (alive) setThumbs((s) => (s[key] ? s : { ...s, [key]: uri })); }).catch(() => {});
    });
    return () => { alive = false; };
  }, [clip.sourceUri, missing, photo, times.join(",")]);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Clip ${clip.id}`} accessibilityState={{ selected }}
      style={{ width, height: STRIP_HEIGHT, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt,
        borderWidth: 2, borderColor: selected ? theme.colors.accent : "transparent",
        borderRightWidth: 2, borderRightColor: theme.colors.bgDeep, flexDirection: "row" }}>
      {times.map((t, i) => {
        // A photo is its own thumbnail in every slot.
        const src = missing ? undefined : photo ? clip.sourceUri : thumbs[thumbKey(clip.sourceUri, t)];
        return (
          <View key={t} style={{ width: Math.min(slotWidth, width - i * slotWidth), height: STRIP_HEIGHT, overflow: "hidden" }}>
            {src ? <Image testID="thumb-image" source={{ uri: src }} style={{ width: slotWidth, height: STRIP_HEIGHT }} resizeMode="cover" /> : null}
          </View>
        );
      })}
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
        {clip.reversed && (
          <View style={{ backgroundColor: theme.colors.accent, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ fontSize: 10, color: theme.colors.onAccent, fontWeight: "700" }}>◀</Text>
          </View>
        )}
        {photo && (
          <View accessibilityLabel="Photo" style={{ backgroundColor: theme.colors.sea, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, justifyContent: "center" }}>
            <Ionicons name="image" size={10} color={theme.colors.text} />
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
