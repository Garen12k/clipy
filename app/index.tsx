import { Icon } from "@/src/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hasSeenWelcome } from "@/src/auth/welcomeSeen";
import { WelcomeWizard } from "@/src/auth/WelcomeWizard";
import type { AspectRatio } from "@/src/editor/model/types";
import { AFTER_PICKER_MS, AspectRatioSheet } from "@/src/projects/AspectRatioSheet";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS, ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { QUICK, type QuickRecipeId } from "@/src/projects/quickEdit";
import { QuickEditSheet } from "@/src/projects/QuickEditSheet";
import { useProjects } from "@/src/projects/useProjects";
import type { PickedAsset, ProjectSummary } from "@/src/projects";
import { pickVideoForPost } from "@/src/publish/pickVideo";
import { glassTint, theme } from "@/src/theme/theme";
import { useSurfaces } from "@/src/ui/tone";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { EmptyState } from "@/src/ui/EmptyState";
import { EnterView } from "@/src/ui/Enter";
import { Glass } from "@/src/ui/Glass";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body, Title } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

/**
 * Home. On first launch — the "seen" flag is not set — this same route draws the welcome wizard in place of the projects: the flag is
 * read synchronously, so the very first frame is already the right one and the projects never flash. Nothing is navigated (no
 * redirect, no guard in the layout), so links from outside to /post, /accounts or /oauth are untouched, and "Continue without an
 * account" or a sign-in on the wizard's last page simply swaps the wizard for the projects.
 */
export default function Home() {
  const [seen, setSeen] = useState(hasSeenWelcome);
  return seen ? <ProjectsScreen /> : <WelcomeWizard onDone={() => setSeen(true)} />;
}

/** What the one capsule says while a project is being made. Only what the app knows: it has no count of items copied and no step to report. */
const MAKING = { project: "Creating your project", quick: "Making your quick edit" } as const;

function ProjectsScreen() {
  const { projects, loading, create, createQuick, rename, duplicate, remove } = useProjects();
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null);
  /** Media picked for a new project that is waiting for its aspect ratio. */
  const [pending, setPending] = useState<PickedAsset[] | null>(null);
  const insets = useSafeAreaInsets();
  const s = useSurfaces();

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

  // Making a project takes seconds (its media is copied), and the screen under it must not start anything else meanwhile: a second
  // editor pushed on top of the first would have the one editor store replaced under it. So while `busy`, the header actions and
  // the list take no touches (and are dimmed), and the editor is opened only if this screen is still the one in front when the work is done.
  const [busy, setBusy] = useState(false);
  /** WHAT is being made while `busy` (media copied; for a quick edit, the edit built): the two bottom actions give way to one capsule that says it. */
  const [making, setMaking] = useState<keyof typeof MAKING | null>(null);
  const focused = useRef(true);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const openEditor = (id: string | null) => { if (id && focused.current) router.push(`/editor/${id}`); };

  // New project: the library, then the aspect-ratio picker, then the project. Nothing exists until Create is pressed.
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
      setQuickOpen(false); // the other sheet's flag: it may be set with nothing on screen
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
    setMaking("project");
    setBusy(true);
    try { openEditor(await create(assets, aspectRatio)); }
    finally { creating.current = false; setMaking(null); setBusy(false); }
  }

  // Quick edit: the style sheet, then the library, then the finished draft. Nothing exists until media is picked, and a draft that
  // cannot be finished is removed again (makeQuickEdit). It shares the two refs with New project, so the two can never run together.
  // Like New project, the button is never held back by its sheet's flag: if iOS drops the sheet's presentation, `quickOpen` stays true
  // with nothing on screen, so a press closes it first and opens it on the next tick — presented afresh.
  const [quickOpen, setQuickOpen] = useState(false);
  async function onQuick() {
    if (starting.current || creating.current) return;
    setPending(null);
    setQuickOpen(false);
    await new Promise((r) => setTimeout(r, 0));
    if (!starting.current && !creating.current) setQuickOpen(true);
  }
  async function onQuickChoose(recipeId: QuickRecipeId) {
    if (starting.current || creating.current) return;
    starting.current = true;
    let assets: PickedAsset[] | null = null;
    try {
      setQuickOpen(false);
      // The sheet is still fading out, and iOS drops a picker presented during that.
      await new Promise((r) => setTimeout(r, AFTER_SHEET_MS));
      assets = await pickMedia({ limit: QUICK.maxItems });
    } finally { starting.current = false; }
    if (!assets || assets.length === 0) return;
    creating.current = true;
    setMaking("quick");
    setBusy(true);
    try { openEditor(await createQuick(assets, recipeId)); }
    finally { creating.current = false; setMaking(null); setBusy(false); }
  }

  const touch = busy ? "none" : "auto";
  // What is inert while a project is made is also dimmed. A plain style value: it lands at once, nothing is animated.
  const dim = busy ? DISABLED_OPACITY : 1;
  /** How far the bottom actions sit above the screen's edge: clear of the home indicator, and never on the edge itself. */
  const actionsBottom = Math.max(insets.bottom, theme.space.sm) + theme.space.sm;
  const openActions = (p: ProjectSummary) => { haptic("light"); setActionsFor(p); };
  return (
    <Screen>
      {/* The two header actions share one pill, top right; the title has its own line under them. It stays put: the list scrolls below it. */}
      <View testID="home-header" style={{ paddingHorizontal: theme.space.gutter, marginBottom: theme.space.sm, gap: theme.space.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          {/* 44 pt high; each button is 40 with slop that stays inside the pill, so each target is 44 by 44. */}
          {/* Glass where the phone has it (GLASS.home); while it is dimmed it is the solid colour — glass is never drawn under an opacity. */}
          <Glass side="home" color={s.bar} tint={glassTint(s)} testID="home-header-actions" pointerEvents={touch} style={{ height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.xs, borderRadius: theme.radius.pill, opacity: dim }}>
            <IconButton name="paper-plane-outline" accessibilityLabel="Post a video" onPress={onPostVideo} />
            <IconButton name="person-circle-outline" accessibilityLabel="Accounts" onPress={() => router.push("/accounts")} />
          </Glass>
        </View>
        <Title size={theme.type.screen} accessibilityRole="header" style={{ lineHeight: theme.text.largeTitle.leading }}>Projects</Title>
      </View>
      {/* Always the same wrapper (only its pointerEvents and its opacity change), so the list below never remounts and never eases in twice. */}
      <View testID="home-list" pointerEvents={touch} style={{ flex: 1, opacity: dim }}>
      {loading ? (
        // One accessible element: the words are read once.
        <View testID="home-loading" accessible accessibilityLabel="Loading projects" style={{ alignItems: "center", gap: theme.space.sm, paddingTop: theme.space.xl }}>
          <Spinner />
          <Body muted>Loading projects</Body>
        </View>
      ) : projects.length === 0 ? (
        <EmptyState icon="boat-outline" title="No clips yet" hint="Pick some photos or videos from your library and start your first edit." pointer="New Project or Quick Edit, below" />
      ) : (
        // The LIST eases in, once, when it first appears: EnterView animates on mount only, so a refresh, a rename, a duplicate or a
        // delete never replays it, and no card animates on its own. Cards sit on the 16-pt gutter: 8 from the list + 8 from the cell.
        // The last row clears the actions that float over the list.
        <EnterView style={{ flex: 1 }}>
          <FlatList testID="home-grid" data={projects} numColumns={2} keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: theme.space.sm, paddingBottom: actionsBottom + theme.size.control + theme.space.lg }}
            renderItem={({ item }) => <ProjectCard summary={item} onPress={() => (item.broken ? setActionsFor(item) : router.push(`/editor/${item.id}`))} onLongPress={() => openActions(item)} onMore={() => openActions(item)} />} />
        </EnterView>
      )}
      </View>
      {/* Quick Edit at the leading corner, New Project at the trailing one, on the gutter; the cards scroll beneath. */}
      <View testID="home-actions" style={{ position: "absolute", left: theme.space.gutter, right: theme.space.gutter, bottom: actionsBottom, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.space.md }}>
        {making ? (
          // While a project is made the two actions give way to ONE capsule across the screen: a spinner and what is being made.
          // One accessible element: VoiceOver reads the words once, not once for the spinner and once for the text.
          <View testID="home-making" accessible accessibilityLabel={MAKING[making]} style={{ flex: 1, height: theme.size.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.md, paddingHorizontal: theme.space.xl, borderRadius: theme.radius.pill, backgroundColor: s.bar }}>
            <Spinner />
            <Body weight="semi">{MAKING[making]}</Body>
          </View>
        ) : (
          <>
            {/* The grey button has its own fill; the pill behind it only keeps it readable over the cards. As glass (GLASS.home) the pill IS the button's fill. */}
            <Glass side="home" color={s.bar} tint={glassTint(s)} testID="home-quick-backing" glassRadius={theme.size.control / 2} style={{ borderRadius: theme.radius.pill }}>
              <SecondaryButton glass="home" title="Quick Edit" icon={<Icon name="color-wand-outline" size={theme.size.icon.md} color={s.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onQuick} />
            </Glass>
            <PrimaryButton title="New Project" icon={<Icon name="add-outline" size={theme.size.icon.md} color={theme.colors.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onNew} />
          </>
        )}
      </View>
      <QuickEditSheet visible={quickOpen} onClose={() => setQuickOpen(false)} onChoose={onQuickChoose} />
      <AspectRatioSheet assets={pending} onCancel={() => setPending(null)} onCreate={onCreate} />
      <ProjectActionsSheet project={actionsFor} onClose={() => setActionsFor(null)} onRename={promptRename} onDuplicate={(p) => duplicate(p.id)} onDelete={confirmDelete} />
      <ToastHost />
    </Screen>
  );
}
