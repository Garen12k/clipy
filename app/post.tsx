import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { PostScreenBody } from "@/src/publish/components/PostScreenBody";
import { videoFromParams } from "@/src/publish/usePostForm";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "@/src/ui/EmptyState";
import { IconButton } from "@/src/ui/IconButton";
import { Screen } from "@/src/ui/Screen";

/** /post?fileUri=…&durationSec=…[&fileSize=…&mimeType=…&projectId=…&title=…] */
export default function PostScreen() {
  const p = useLocalSearchParams<{ fileUri?: string; durationSec?: string; fileSize?: string; mimeType?: string; projectId?: string; title?: string }>();
  // Keyed on the values (the params object itself is new on every render) so `video` keeps its identity for usePost.
  const target = useMemo(() => videoFromParams(p), [p.fileUri, p.durationSec, p.fileSize, p.mimeType, p.projectId, p.title]);
  if (target) return <PostScreenBody target={target} />;
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm }}>
        <IconButton name="chevron-back" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
      <EmptyState emoji="🎞️" title="This video can't be posted." hint="Clipy couldn't read its length or size. Go back and pick it again." />
    </Screen>
  );
}
