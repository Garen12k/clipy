import { Asset } from "expo-asset";
import { useAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { BUNDLED_TRACKS, type BundledTrack } from "@/src/editor/music";
import { addAudioTrack } from "@/src/editor/model/ops";
import { AUDIO_LIMITS, type AudioKind } from "@/src/editor/model/types";
import { SFX, SFX_IDS, type SfxId } from "@/src/editor/sfx";
import { useEditorStore } from "@/src/editor/store";
import { formatDuration } from "@/src/lib/format";
import { storage } from "@/src/projects";
import { audioDuration } from "@/src/projects/audioInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { RecordTab, type RecordCloseGuard } from "./RecordTab";

const MAX_BYTES = 50 * 1024 * 1024;
/** How long after a preview's nominal end its button flips back to "play" (the player needs a moment to start). */
const PREVIEW_TAIL_MS = 400;

/** One entry per tab, in display order: a new tab is one line here plus its body below. */
const TABS = [
  { id: "music", label: "Music" },
  { id: "files", label: "Files" },
  { id: "effects", label: "Effects" },
  { id: "record", label: "Record" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Picked = { uri: string; title: string; durationSec: number };
const ROW = { flexDirection: "row", alignItems: "center", gap: theme.space.md, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, padding: theme.space.md } as const;

/**
 * Adds audio to the project: bundled music, a file, a built-in sound effect, or a voice-over recorded on the spot. Every path
 * copies the file into the project, adds a track starting at the playhead (a recording: where it began), selects it and closes
 * the sheet. The track's own controls are the selected-track tools in the toolbar.
 */
export function AddAudioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("music");
  const [busy, setBusy] = useState(false);
  const adding = useRef(false);   // `busy` only disables after a re-render: two presses in one frame must not add twice
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useAudioPlayer(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by the Record tab while it is mounted: leaving it mid-recording stops and saves first (it then closes the sheet itself).
  const recordGuard = useRef<(() => boolean) | null>(null) as RecordCloseGuard;

  // The id being previewed, readable from cleanups and late callbacks; null = the preview player is idle and is left alone.
  const previewing = useRef<string | null>(null);
  // Read after an await: the sheet may have been dismissed while a file was copied.
  const open = useRef(visible);
  open.current = visible;

  const stopPreview = () => {
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
    if (previewing.current === null) return;
    previewing.current = null;
    // The player may already be released (unmount): pausing it then throws.
    try { preview.pause(); } catch {}
    setPreviewId(null);
  };
  const togglePreview = (id: string, file: number, durationSec: number) => {
    const wasPlaying = previewing.current === id;
    stopPreview();
    if (wasPlaying) return;
    try { preview.replace(file); preview.play(); } catch { return; }
    previewing.current = id;
    setPreviewId(id);
    previewTimer.current = setTimeout(() => { previewTimer.current = null; previewing.current = null; setPreviewId(null); }, durationSec * 1000 + PREVIEW_TAIL_MS);
  };
  useEffect(() => { if (!visible) stopPreview(); }, [visible]);   // closed by the parent
  // useAudioPlayer releases the native player in its own unmount cleanup, which runs before this one.
  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (previewing.current !== null) { try { preview.pause(); } catch {} }
  }, [preview]);

  const closeNow = () => { stopPreview(); onClose(); };
  const close = () => { if (recordGuard.current?.()) return; closeNow(); };
  /** After an import: a sheet the user already dismissed must not be closed again (the parent may be showing another sheet by now). */
  const closeIfOpen = () => { if (open.current) close(); };
  // The sheet is a native Modal and would cover the toast: close first.
  const refuse = () => { closeIfOpen(); useToast.getState().show("You've reached the audio track limit."); };

  /** One add at a time, under the busy state; any failure is a toast. The ref makes the second of two presses in one frame a no-op. */
  async function guarded(work: () => Promise<void>) {
    if (adding.current) return;
    adding.current = true;
    setBusy(true);
    try { await work(); }
    catch (e) { useToast.getState().show("Couldn't add that audio file"); console.warn(e); }
    finally { adding.current = false; setBusy(false); }
  }
  /** Resolves (download / measure) and imports the file, then adds the track at `at` — the playhead when the user pressed, not when the copy finished. */
  async function importAndAdd(kind: AudioKind, resolve: () => Promise<Picked>, at: number) {
    const before = useEditorStore.getState().project;
    if (!before) return;
    if (before.audioTracks.length >= AUDIO_LIMITS.maxTracks) { refuse(); return; }   // before copying a file nobody will use
    const imported = await storage.importAudio(before.id, await resolve(), kind);
    const { project, apply, selectAudio } = useEditorStore.getState();
    if (!project || project.id !== before.id) return;   // the editor moved on while the file was copied
    // The op returns the same project when it refuses.
    const next = addAudioTrack(project, { ...imported, start: Math.round(at * 1000) / 1000 });
    if (next === project) { refuse(); return; }
    apply(() => next);
    selectAudio(imported.id);
    haptic("light");
    closeIfOpen();
  }
  const pressTime = () => useEditorStore.getState().playhead;
  const add = (kind: AudioKind, resolve: () => Promise<Picked>) => { const at = pressTime(); void guarded(() => importAndAdd(kind, resolve, at)); };
  const bundled = (file: number, title: string, durationSec: number) => async (): Promise<Picked> => {
    const asset = Asset.fromModule(file);
    await asset.downloadAsync();
    return { uri: asset.localUri ?? asset.uri, title, durationSec };
  };
  const addBundled = (t: BundledTrack) => add("music", bundled(t.file, t.title, t.durationSec));
  const addSfx = (id: SfxId) => add("sfx", bundled(SFX[id].file, SFX[id].label, SFX[id].durationSec));
  function pickFile() {
    const at = pressTime();
    void guarded(async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const go = () => importAndAdd("music", async () => ({ uri: a.uri, title: a.name, durationSec: await audioDuration(a.uri) }), at);
      // The alert outlives this guard: its "Add" takes the guard again.
      if ((a.size ?? 0) > MAX_BYTES) Alert.alert("Large file", "This file is over 50 MB. Add it anyway?", [{ text: "Cancel", style: "cancel" }, { text: "Add", onPress: () => { void guarded(go); } }]);
      else await go();
    });
  }

  const row = (r: { id: string; title: string; detail: string; file: number; durationSec: number; addLabel: string; onAdd: () => void }) => (
    <View key={r.id} style={ROW}>
      <IconButton name={previewId === r.id ? "stop" : "play"} color={theme.colors.accent}
        accessibilityLabel={`${previewId === r.id ? "Stop" : "Play"} ${r.title}`} onPress={() => togglePreview(r.id, r.file, r.durationSec)} />
      <View style={{ flex: 1 }}><Body>{r.title}</Body><Body muted style={{ fontSize: 12 }}>{r.detail}</Body></View>
      <Chip label={r.addLabel} accessibilityLabel={`${r.addLabel} ${r.title}`} selected={false} disabled={busy} onPress={r.onAdd} />
    </View>
  );

  return (
    <Sheet visible={visible} onClose={close} title="Add audio" height="60%">
      <View style={{ flexDirection: "row", gap: theme.space.md }}>
        {TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => { if (t.id === tab || recordGuard.current?.()) return; stopPreview(); setTab(t.id); }} />)}
      </View>
      {tab === "music" && (BUNDLED_TRACKS.length === 0 ? (
        <Body muted>No bundled tracks yet — use Files.</Body>
      ) : (
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: theme.space.sm }}>
          {BUNDLED_TRACKS.map((t) => row({ id: `music:${t.id}`, title: t.title, detail: `${formatDuration(t.durationSec)} · ${t.license}`, file: t.file, durationSec: t.durationSec, addLabel: "Use", onAdd: () => addBundled(t) }))}
        </ScrollView>
      ))}
      {tab === "files" && <PrimaryButton title="Choose a file" disabled={busy} onPress={pickFile} />}
      {tab === "effects" && (
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: theme.space.sm }}>
          {SFX_IDS.map((id) => row({ id: `sfx:${id}`, title: SFX[id].label, detail: `${SFX[id].durationSec.toFixed(1)} s`, file: SFX[id].file, durationSec: SFX[id].durationSec, addLabel: "Add", onAdd: () => addSfx(id) }))}
        </ScrollView>
      )}
      {tab === "record" && <RecordTab onDone={closeNow} closeGuard={recordGuard} />}
    </Sheet>
  );
}
