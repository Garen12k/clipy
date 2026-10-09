import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { PostScreenBody } from "@/src/publish/components/PostScreenBody";
import { videoFromParams } from "@/src/publish/postParams";
import { EmptyState } from "@/src/ui/EmptyState";
import { Screen } from "@/src/ui/Screen";
import { ScreenBar } from "@/src/ui/ScreenBar";

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
      <ScreenBar title="Post" leading="back" onLeading={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <EmptyState emoji="🎞️" title="This video can't be posted." hint="Clipy couldn't read this video file. Go back and pick it again." />
    </Screen>
  );
}
