import { router } from "expo-router";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { useProjects } from "@/src/projects/useProjects";
import type { ProjectSummary } from "@/src/projects";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body, Heading } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function ProjectsScreen() {
  const { projects, loading, create, rename, duplicate, remove } = useProjects();

  function onLongPress(p: ProjectSummary) {
    if (p.broken) {
      Alert.alert("Can't open this project", "Its file is damaged.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove(p.id) }]);
      return;
    }
    Alert.alert(p.name, undefined, [
      { text: "Rename", onPress: () => Alert.prompt("Rename project", undefined, (name) => name && rename(p.id, name), "plain-text", p.name) },
      { text: "Duplicate", onPress: () => duplicate(p.id) },
      { text: "Delete", style: "destructive", onPress: () => Alert.alert("Delete project?", "This can't be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove(p.id) }]) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function onNew() {
    const id = await create();
    if (id) router.push(`/editor/${id}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: 60 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg, marginBottom: theme.space.md }}>
        <Compass size={28} />
        <Heading style={{ fontSize: 36 }}>Clipy</Heading>
      </View>
      {loading ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} /> : projects.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
          <Compass size={56} />
          <Heading>No projects yet</Heading>
          <Body muted>Tap New Project to start</Body>
        </View>
      ) : (
        <FlatList data={projects} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: theme.space.sm, paddingBottom: 120 }}
          renderItem={({ item }) => <ProjectCard summary={item} onPress={() => (item.broken ? onLongPress(item) : router.push(`/editor/${item.id}`))} onLongPress={() => onLongPress(item)} />} />
      )}
      <View style={{ position: "absolute", left: theme.space.lg, right: theme.space.lg, bottom: theme.space.xxl }}>
        <PrimaryButton title="New Project" onPress={onNew} />
      </View>
      <ToastHost />
    </View>
  );
}
