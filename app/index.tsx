import { Icon } from "@/src/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hasSeenWelcome } from "@/src/auth/welcomeSeen";
import { WelcomeWizard } from "@/src/auth/WelcomeWizard";
import type { AspectRatio } from "@/src/editor/model/types";
import { AFTER_PICKER_MS, AspectRatioSheet } from "@/src/projects/AspectRatioSheet";
import { sourceMenuShown, takeOne, useMediaSource } from "@/src/projects/mediaSource";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS, ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { QUICK } from "@/src/projects/quickEdit";
import { QuickEditSheet, type QuickPick } from "@/src/projects/QuickEditSheet";
import { hold, sheetRun } from "@/src/projects/sheetGuard";
import { openStyleMenu } from "@/src/projects/styleMenu";
import { useProjects } from "@/src/projects/useProjects";
import { filePhone, type PickedAsset, type ProjectSummary } from "@/src/projects";
import { TransferCard } from "@/src/projects/TransferCard";
import { useProjectFile } from "@/src/projects/useProjectFile";
import { useUserStyles } from "@/src/projects/useUserStyles";
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
import { useTextScale } from "@/src/ui/textScale";
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
/** The pill behind Quick Edit; and the same pill while the row is shared at a larger text size (the button in it is as wide as the pill). */
const QUICK_BACKING = { borderRadius: theme.radius.pill } as const;
const QUICK_SHARES = { ...QUICK_BACKING, flexShrink: 1 } as const;
const MAKING = { project: "Creating your project", quick: "Making your quick edit", style: "Saving your style" } as const;

function ProjectsScreen() {
  const { projects, loading, reload, create, createQuick, rename, duplicate, remove } = useProjects();
  const { transfer, saveCopy, openFile, cancel } = useProjectFile(reload);
  const styles = useUserStyles();
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null);
  /** Media picked for a new project that is waiting for its aspect ratio. */
  const [pending, setPending] = useState<PickedAsset[] | null>(null);
  const insets = useSafeAreaInsets();
  const s = useSurfaces();

  const confirmDelete = (p: ProjectSummary) => Alert.alert("Delete project?", "This can't be undone.", [
    { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { haptic("medium"); remove(p.id); } }]);
  const promptRename = (p: ProjectSummary) => Alert.prompt("Rename project", undefined, (name) => name && rename(p.id, name), "plain-text", p.name);
  // A Cancel never answers here; an empty OK keeps the project's name (the store's fallback).
  const promptSaveStyle = (p: ProjectSummary) => Alert.prompt("Save as style", "You'll find it in Quick edit.", (name) => { void onSaveStyle(p, name ?? ""); }, "plain-text", p.name);

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
  // New Project's menu (Choose from Library / Take Photo or Video), where the installed app can open the camera. A wait for it is dropped when Home is left.
  const { ask: askMenu, forget: forgetSource } = useMediaSource();
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; forgetSource(); }; }, [forgetSource]));
  const openEditor = (id: string | null) => { if (id && focused.current) router.push(`/editor/${id}`); };

  // New project: the library — or, where the camera can be opened, the menu and then the library or the camera (one item, which
  // continues exactly as one picked item does) —, then the aspect-ratio picker, then the project. Nothing exists until Create is
  // pressed. `starting` is held from the tap to the end of the pick, so a second tap opens nothing — but, like every guard of
  // Home, NEVER WHILE WAITING FOR A SYSTEM SHEET'S PROMISE (the menu, the library, the camera: see `sheetRun`): a sheet holds it
  // only while it comes up, and an answer that arrives after that continues only if nothing else has started meanwhile (and Home
  // is still in front) — else it is dropped as a cancel is. The menu takes it back the moment it answers, for its own close.
  // The button is held back only by the two refs — the library is up, or a project is being made (its media copied) — never by
  // `pending`: if iOS drops the sheet's presentation, `pending` stays set with nothing on screen to clear it, and the button must
  // still work. The sheet itself covers the button while it is really there. A press with media still waiting starts over: the
  // stale pick is dropped first (so the sheet is presented afresh for the new one), and the new pick replaces it.
  const starting = useRef(false);
  const creating = useRef(false);
  /** A late sheet's answer is dropped while another run has a ref, or once Home is no longer in front. */
  const taken = () => starting.current || creating.current || !focused.current;
  async function onNew() {
    if (starting.current || creating.current) return;
    const { sheet, end } = sheetRun(taken, () => hold(starting));
    const askSource = () => sheet(askMenu);
    try {
      setPending(null);
      setQuickOpen(false); // the other sheet's flag: it may be set with nothing on screen
      const source = sourceMenuShown() ? await askSource() : "library";
      if (!source) return;
      const assets = await sheet(() => (source === "camera" ? takeOne() : pickMedia()));
      if (!assets || assets.length === 0) return;
      await new Promise((r) => setTimeout(r, AFTER_PICKER_MS));
      setPending(assets);
    } finally { end(); }
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
    if (starting.current || creating.current) return;
    await styles.reload(); // the row "Your styles" is read afresh on every opening
    if (!starting.current && !creating.current) setQuickOpen(true);
  }
  async function onQuickChoose(pick: QuickPick) {
    if (starting.current || creating.current) return;
    const choice = typeof pick === "string" ? pick : styles.mine.find((s) => s.id === pick.mine);
    if (!choice) return;
    const { sheet, end } = sheetRun(taken, () => hold(starting));
    let assets: PickedAsset[] | null = null;
    try {
      setQuickOpen(false);
      // The sheet is still fading out, and iOS drops a picker presented during that.
      await new Promise((r) => setTimeout(r, AFTER_SHEET_MS));
      // The library holds `starting` only while it comes up, as New Project's does; a late answer is dropped if something else started.
      assets = await sheet(() => pickMedia({ limit: QUICK.maxItems }));
    } finally { end(); }
    if (!assets || assets.length === 0) return;
    creating.current = true;
    setMaking("quick");
    setBusy(true);
    try { openEditor(await createQuick(assets, choice)); }
    finally { creating.current = false; setMaking(null); setBusy(false); }
  }

  // Save a Copy and Open Project File share the two refs with New Project and Quick Edit, so none of the four can run together.
  // While the copy is written or read (`transfer`) the screen is inert as while a project is made, and the ref is held through a
  // cancelled run's end, so its files are gone before the next starts. But NEITHER REF EVER WAITS FOR A SYSTEM SHEET'S PROMISE: if
  // iOS declines to present the share sheet or the file picker, the phone's call never answers, and a ref held for it would leave
  // all four actions dead until Clipy is closed. A sheet holds its ref only while it comes up — `AFTER_PICKER_MS` from the moment it
  // was asked for (or until it answers, if that is sooner); after that the sheet itself covers the screen, if it is there at all.
  async function onSaveCopy(p: ProjectSummary) {
    if (starting.current || creating.current) return;
    const release = hold(creating);
    let up: ReturnType<typeof setTimeout> | null = null;
    try { await saveCopy(p, () => { up = setTimeout(release, AFTER_PICKER_MS); }); }
    finally { if (up) clearTimeout(up); release(); }
  }
  // Save as Style: our own work (the project read, its own music copied, the styles file written) under `creating`, so it never
  // runs with the other four, and Home inert with the making capsule saying so (a large own song takes a moment to copy). The
  // prompt is answered BEFORE the ref is taken: no ref waits for a system sheet.
  async function onSaveStyle(p: ProjectSummary, name: string) {
    if (starting.current || creating.current) return;
    const release = hold(creating);
    setMaking("style");
    setBusy(true);
    try { await styles.save(p.id, name); } finally { release(); setMaking(null); setBusy(false); }
  }
  async function onOpenFile() {
    if (starting.current || creating.current) return;
    const release = hold(starting);
    const up = setTimeout(release, AFTER_PICKER_MS);
    let uri: string | null = null;
    try {
      setPending(null);
      setQuickOpen(false);
      uri = await filePhone.pick();
    } catch (e) { console.warn("pick failed", e); } finally { clearTimeout(up); release(); }
    if (!uri) return;
    // A file that arrives while something else has started (only a picker that answered when it was no longer in front) is not opened.
    if (starting.current || creating.current) { await filePhone.forget(uri); return; }
    creating.current = true;
    try {
      // Apple's picker is still sliding away when the file arrives, and iOS drops an alert presented during that (a file that is not a project fails at once).
      await new Promise((r) => setTimeout(r, AFTER_PICKER_MS));
      await openFile(uri);
    } finally { creating.current = false; }
  }

  const inert = busy || transfer !== null;
  const touch = inert ? "none" : "auto";
  // What is inert while a project is made, or a project file is saved or opened, is also dimmed. A plain style value: it lands at once, nothing is animated.
  const dim = inert ? DISABLED_OPACITY : 1;
  /** How far the bottom actions sit above the screen's edge: clear of the home indicator, and never on the edge itself. */
  const actionsBottom = Math.max(insets.bottom, theme.space.sm) + theme.space.sm;
  // At the default text size the two bottom actions are their natural widths, as ever (a 375-pt phone holds them with nothing to spare).
  // Larger, they would not fit side by side — so above the default, and only there, both may give way and each label fits what it gets.
  const share = useTextScale() > 1;
  const openActions = (p: ProjectSummary) => { haptic("light"); setActionsFor(p); };
  return (
    <Screen>
      {/* The three header actions share one pill, top right; the title has its own line under them. It stays put: the list scrolls below it. */}
      <View testID="home-header" style={{ paddingHorizontal: theme.space.gutter, marginBottom: theme.space.sm, gap: theme.space.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          {/* 44 pt high; each button is 40 with slop that stays inside the pill, so each target is 44 by 44. */}
          {/* Glass where the phone has it (GLASS.home); while it is dimmed it is the solid colour — glass is never drawn under an opacity. */}
          <Glass side="home" color={s.bar} tint={glassTint(s)} testID="home-header-actions" pointerEvents={touch} style={{ height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.xs, borderRadius: theme.radius.pill, opacity: dim }}>
            <IconButton name="paper-plane-outline" accessibilityLabel="Post a video" onPress={onPostVideo} />
            <IconButton name="folder-open-outline" accessibilityLabel="Open Project File" onPress={onOpenFile} />
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
        {transfer ? <TransferCard transfer={transfer} onCancel={cancel} /> : making ? (
          // While a project is made the two actions give way to ONE capsule across the screen: a spinner and what is being made.
          // One accessible element: VoiceOver reads the words once, not once for the spinner and once for the text.
          <View testID="home-making" accessible accessibilityLabel={MAKING[making]} style={{ flex: 1, height: theme.size.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.md, paddingHorizontal: theme.space.xl, borderRadius: theme.radius.pill, backgroundColor: s.bar }}>
            <Spinner />
            <Body fit weight="semi">{MAKING[making]}</Body>
          </View>
        ) : (
          <>
            {/* The grey button has its own fill; the pill behind it only keeps it readable over the cards. As glass (GLASS.home) the pill IS the button's fill. */}
            <Glass side="home" color={s.bar} tint={glassTint(s)} testID="home-quick-backing" glassRadius={theme.size.control / 2} style={share ? QUICK_SHARES : QUICK_BACKING}>
              <SecondaryButton glass="home" title="Quick Edit" icon={<Icon name="color-wand-outline" size={theme.size.icon.md} color={s.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onQuick} />
            </Glass>
            <PrimaryButton shrink={share} title="New Project" icon={<Icon name="add-outline" size={theme.size.icon.md} color={theme.colors.onAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />} onPress={onNew} />
          </>
        )}
      </View>
      <QuickEditSheet visible={quickOpen} onClose={() => setQuickOpen(false)} onChoose={onQuickChoose} mine={styles.mine} onStyleMenu={(st) => openStyleMenu(st, { rename: styles.rename, remove: styles.remove })} />
      <AspectRatioSheet assets={pending} onCancel={() => setPending(null)} onCreate={onCreate} />
      <ProjectActionsSheet project={actionsFor} onClose={() => setActionsFor(null)} onRename={promptRename} onDuplicate={(p) => duplicate(p.id)} onSaveCopy={onSaveCopy} onSaveStyle={promptSaveStyle} onDelete={confirmDelete} />
      <ToastHost />
    </Screen>
  );
}
