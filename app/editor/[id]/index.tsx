import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, View } from "react-native";
import { EditorTopBar } from "@/src/editor/components/EditorTopBar";
import type { Project } from "@/src/editor/model/types";
import { useAutosave } from "@/src/editor/useAutosave";
import { useLoadProject } from "@/src/editor/useLoadProject";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { Body, Heading } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoadProject(id);
  const save = useCallback((p: Project) => storage.saveProject(p), []);
  useAutosave(save);

  if (load.status === "loading") return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></View>;
  if (load.status === "error") return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 }}>
      <Heading>Can't open project</Heading><Body muted>{load.error}</Body>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <EditorTopBar onExport={() => router.push(`/editor/${id}/export`)} />
      <View testID="slot-preview" style={{ flex: 1 }} />
      <View testID="slot-timeline" style={{ height: 120 }} />
      <View testID="slot-toolbar" style={{ height: 88 }} />
      <ToastHost />
    </View>
  );
}
