import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AspectRatio } from "@/src/editor/model/types";
import { AFTER_PICKER_MS, AspectRatioSheet } from "@/src/projects/AspectRatioSheet";
import { pickMedia } from "@/src/projects/pickMedia";
import { ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { useProjects } from "@/src/projects/useProjects";
import type { PickedAsset, ProjectSummary } from "@/src/projects";
import { pickVideoForPost } from "@/src/publish/pickVideo";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "@/src/ui/EmptyState";
import { EnterView } from "@/src/ui/Enter";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { Spinner } from "@/src/ui/Spinner";
import { Title } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function ProjectsScreen() {
  const { projects, loading, create, rename, duplicate, remove } = useProjects();
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null);
  /** Media picked for a new project that is waiting for its aspect ratio. */
  const [pending, setPending] = useState<PickedAsset[] | null>(null);
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

  // New clip: the library, then the aspect-ratio picker, then the project. Nothing exists until Create is pressed.
  // The button is held back only by the two refs — the library is up, or a project is being made (its media copied) — never by
  // `pending`: if iOS drops the sheet's presentation, `pending` stays set with nothing on screen to clear it, and the button must
  // still work. The sheet itself covers the button while it is really there. A press with media still waiting starts over: the
  // stale pick is dropped first (so the sheet is presented afresh for the new one), and the new pick replaces it.
  const starting = useRef(false);
  const creating = useRef(false);
  async function onNew() {
    if (starting.current || creating.current) return;
    starting.current = true;
    try {
      setPending(null);
      const assets = await pickMedia();
      if (!assets || assets.length === 0) return;
      await new Promise((r) => setTimeout(r, AFTER_PICKER_MS));
      setPending(assets);
    } finally { starting.current = false; }
  }
  async function onCreate(aspectRatio: AspectRatio) {
    if (!pending || creating.current) return;
    creating.current = true;
    const assets = pending;
    setPending(null);
    try {
      const id = await create(assets, aspectRatio);
      if (id) router.push(`/editor/${id}`);
    } finally { creating.current = false; }
  }

  return (
    <Screen>
      <View testID="home-header" style={{ height: theme.size.row, paddingLeft: theme.space.gutter, paddingRight: theme.space.sm, marginBottom: theme.space.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Title size={theme.type.screen} accessibilityRole="header">Your voyages</Title>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton name="paper-plane-outline" accessibilityLabel="Post a video" onPress={onPostVideo} />
          <IconButton name="person-circle-outline" accessibilityLabel="Accounts" onPress={() => router.push("/accounts")} />
        </View>
      </View>
      {loading ? <Spinner style={{ marginTop: theme.space.xxl }} /> : projects.length === 0 ? (
        <EmptyState emoji="🏝️" title="No clips yet" hint="Pick some photos or videos from your library and start your first edit." />
      ) : (
        // The LIST eases in, once, when it first appears: EnterView animates on mount only, so a refresh, a rename, a duplicate or a
        // delete never replays it, and no card animates on its own. Cards sit on the 16-pt gutter: 8 from the list + 8 from the cell.
        <EnterView style={{ flex: 1 }}>
          <FlatList data={projects} numColumns={2} keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: theme.space.sm, paddingBottom: theme.size.control + theme.space.xxl + theme.space.xl + insets.bottom }}
            renderItem={({ item }) => <ProjectCard summary={item} onPress={() => (item.broken ? setActionsFor(item) : router.push(`/editor/${item.id}`))} onLongPress={() => { haptic("light"); setActionsFor(item); }} />} />
        </EnterView>
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + theme.space.lg, alignItems: "center" }}>
        <PrimaryButton title="New clip" icon={<Ionicons name="add-outline" size={theme.size.icon.md} color={theme.colors.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onNew} />
      </View>
      <AspectRatioSheet assets={pending} onCancel={() => setPending(null)} onCreate={onCreate} />
      <ProjectActionsSheet project={actionsFor} onClose={() => setActionsFor(null)} onRename={promptRename} onDuplicate={(p) => duplicate(p.id)} onDelete={confirmDelete} />
      <ToastHost />
    </Screen>
  );
}
