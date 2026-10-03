import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { useProjects } from "@/src/projects/useProjects";
import type { ProjectSummary } from "@/src/projects";
import { pickVideoForPost } from "@/src/publish/pickVideo";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "@/src/ui/EmptyState";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { Title } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function ProjectsScreen() {
  const { projects, loading, create, rename, duplicate, remove } = useProjects();
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null);
  const insets = useSafeAreaInsets();

  const confirmDelete = (p: ProjectSummary) => Alert.alert("Delete project?", "This can't be undone.", [
    { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { haptic("medium"); remove(p.id); } }]);
  const promptRename = (p: ProjectSummary) => Alert.prompt("Rename project", undefined, (name) => name && rename(p.id, name), "plain-text", p.name);

  const picking = useRef(false);
  async function onPostVideo() {
    if (picking.current) return; // the picker is already up
    picking.current = true;
    try {
      const v = await pickVideoForPost();
      if (v) router.push({ pathname: "/post", params: { fileUri: v.fileUri, durationSec: String(v.durationSec), mimeType: v.mimeType } }); // size is re-read from disk
    } finally { picking.current = false; }
  }

  async function onNew() {
    const id = await create();
    if (id) router.push(`/editor/${id}`);
  }

  return (
    <Screen>
      <View style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.sm, marginBottom: theme.space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Title size={26} accessibilityRole="header">Your voyages</Title>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton name="paper-plane" accessibilityLabel="Post a video" onPress={onPostVideo} />
          <IconButton name="person-circle" accessibilityLabel="Accounts" onPress={() => router.push("/accounts")} />
        </View>
      </View>
      {loading ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} /> : projects.length === 0 ? (
        <EmptyState emoji="🏝️" title="No clips yet" hint="Pick some photos or videos from your library and start your first edit." />
      ) : (
        <FlatList data={projects} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: theme.space.sm, paddingBottom: 120 + insets.bottom }}
          renderItem={({ item, index }) => <ProjectCard summary={item} index={index} onPress={() => (item.broken ? setActionsFor(item) : router.push(`/editor/${item.id}`))} onLongPress={() => { haptic("light"); setActionsFor(item); }} />} />
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + theme.space.lg, alignItems: "center" }}>
        <PrimaryButton title="New clip" icon={<Ionicons name="add" size={18} color={theme.colors.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onNew} />
      </View>
      <ProjectActionsSheet project={actionsFor} onClose={() => setActionsFor(null)} onRename={promptRename} onDuplicate={(p) => duplicate(p.id)} onDelete={confirmDelete} />
      <ToastHost />
    </Screen>
  );
}
