import { LinearGradient } from "expo-linear-gradient";
import type { Ref } from "react";
import { Image, Text, View } from "react-native";
import { COVER_FONT } from "@/src/editor/coverFont";
import { theme } from "@/src/theme/theme";

type Props = { uri: string | null; title: string; width: number; height: number; ref?: Ref<View> };

/**
 * The cover as it looks: the chosen frame with the title over a scrim at the bottom. Every size is a fraction of
 * the box, so the picture captured from this view (the `ref`) looks the same at any output size.
 */
export function CoverFrame({ uri, title, width, height, ref }: Props) {
  const shown = title.trim();
  return (
    // collapsable={false}: the view must exist natively to be captured.
    <View ref={ref} collapsable={false} testID="cover-frame" style={{ width, height, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt }}>
      {uri ? <Image testID="cover-image" source={{ uri }} resizeMode="cover" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
      {shown ? (
        <LinearGradient colors={["transparent", theme.colors.scrimStrong]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: height * 0.12, paddingBottom: height * 0.06, paddingHorizontal: width * 0.06 }}>
          <Text testID="cover-title" numberOfLines={2} style={{ fontFamily: COVER_FONT, color: theme.colors.text, fontSize: height * 0.07, textAlign: "center" }}>{shown}</Text>
        </LinearGradient>
      ) : null}
    </View>
  );
}
