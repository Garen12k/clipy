import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { PostScreenBody } from "@/src/publish/components/PostScreenBody";
import { videoFromParams } from "@/src/publish/postParams";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "@/src/ui/EmptyState";
import { IconButton } from "@/src/ui/IconButton";
import { Screen } from "@/src/ui/Screen";

/**
 * /post?fileUri=…&durationSec=…[&mimeType=…&projectId=…&title=…&coverMs=…]
 * Deep links (clipy://post?…) can reach this route, so the params are validated in videoFromParams, never trusted.
 */
export default function PostScreen() {
  const p = useLocalSearchParams<{ fileUri?: string; durationSec?: string; mimeType?: string; projectId?: string; title?: string; coverMs?: string }>();
  // Keyed on the values (the params object itself is new on every render) so `video` keeps its identity for usePost.
  const target = useMemo(() => videoFromParams(p), [p.fileUri, p.durationSec, p.mimeType, p.projectId, p.title, p.coverMs]);
  if (target) return <PostScreenBody target={target} />;
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm }}>
        <IconButton name="chevron-back-outline" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
      <EmptyState emoji="🎞️" title="This video can't be posted." hint="Clipy couldn't read this video file. Go back and pick it again." />
    </Screen>
  );
}
