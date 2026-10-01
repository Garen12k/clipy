import Slider from "@react-native-community/slider";
import { Asset } from "expo-asset";
import { useAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { BUNDLED_TRACKS, type BundledTrack } from "@/src/editor/music";
import { removeAudioTrack, setAudioTrack, updateAudioTrack } from "@/src/editor/model/ops";
import { AUDIO_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { formatDuration } from "@/src/lib/format";
import { storage } from "@/src/projects";
import { audioDuration } from "@/src/projects/audioInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { NumField } from "@/src/ui/NumField";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

const MAX_BYTES = 50 * 1024 * 1024;

export function MusicSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const project = useEditorStore((s) => s.project);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [tab, setTab] = useState<"bundled" | "files">("bundled");
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useAudioPlayer(null);
  const track = project?.audioTracks[0] ?? null;

  /** Runs the whole resolve (download / measure) + import under the busy state; any failure is a toast. */
  async function use(resolve: () => Promise<{ uri: string; title: string; durationSec: number }>) {
    if (!project) return;
    setBusy(true);
    try {
      const a = await resolve();
      const t = await storage.importAudio(project.id, a);
      apply((p) => setAudioTrack(p, t));
      preview.pause();
    } catch (e) { useToast.getState().show("Couldn't add that audio file"); console.warn(e); }
    finally { setBusy(false); }
  }
  function useBundled(t: BundledTrack) {
    return use(async () => {
      const asset = Asset.fromModule(t.file);
      await asset.downloadAsync();
      return { uri: asset.localUri ?? asset.uri, title: t.title, durationSec: t.durationSec };
    });
  }
  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const go = () => use(async () => ({ uri: a.uri, title: a.name, durationSec: await audioDuration(a.uri) }));
    if ((a.size ?? 0) > MAX_BYTES) Alert.alert("Large file", "This file is over 50 MB. Add it anyway?", [{ text: "Cancel", style: "cancel" }, { text: "Add", onPress: go }]);
    else await go();
  }
  function togglePreview(t: BundledTrack) {
    if (previewId === t.id) { preview.pause(); setPreviewId(null); return; }
    preview.replace(t.file); preview.play(); setPreviewId(t.id);
  }

  return (
    <Sheet visible={visible} onClose={() => { preview.pause(); onClose(); }} title="Music" height="60%">
      {track ? (
        <View style={{ gap: theme.space.lg }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "600" }}>{track.title}</Text>
          <Body muted>Volume {Math.round(track.volume * 100)}%</Body>
          <Slider minimumValue={AUDIO_LIMITS.volume[0]} maximumValue={AUDIO_LIMITS.volume[1]} value={track.volume} onSlidingStart={beginTransaction}
            onValueChange={(v) => applyTransient((p) => updateAudioTrack(p, { volume: v }))} minimumTrackTintColor={theme.colors.accent} />
          <View style={{ flexDirection: "row", gap: theme.space.md, flexWrap: "wrap" }}>
            <NumField label="Start in video (s)" value={track.start} step={0.1} onCommit={(v) => apply((p) => updateAudioTrack(p, { start: v }))} />
            <NumField label="Trim start (s)" value={track.trimStart} step={0.1} onCommit={(v) => apply((p) => updateAudioTrack(p, { trimStart: v }))} />
            <NumField label="Trim end (s)" value={track.trimEnd} step={0.1} onCommit={(v) => apply((p) => updateAudioTrack(p, { trimEnd: v }))} />
          </View>
          <View style={{ flexDirection: "row", gap: theme.space.md }}>
            <Chip label="Replace" selected={false} onPress={() => apply((p) => removeAudioTrack(p))} />
            <Chip label="Remove" selected={false} onPress={() => { apply((p) => removeAudioTrack(p)); onClose(); }} />
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.space.lg }}>
          <View style={{ flexDirection: "row", gap: theme.space.md }}>
            <Chip label="Bundled" selected={tab === "bundled"} onPress={() => setTab("bundled")} />
            <Chip label="My files" selected={tab === "files"} onPress={() => setTab("files")} />
          </View>
          {tab === "bundled" ? (
            BUNDLED_TRACKS.length === 0 ? (
              <Body muted>No bundled tracks yet — use My files.</Body>
            ) : (
              <ScrollView contentContainerStyle={{ gap: theme.space.sm }}>
                {BUNDLED_TRACKS.map((t) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, padding: theme.space.md }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${previewId === t.id ? "Stop" : "Play"} ${t.title}`} onPress={() => togglePreview(t)}>
                      <Text style={{ color: theme.colors.highlight, fontSize: 18 }}>{previewId === t.id ? "■" : "▶"}</Text>
                    </Pressable>
                    <View style={{ flex: 1 }}><Text style={{ color: theme.colors.text }}>{t.title}</Text><Body muted style={{ fontSize: 12 }}>{formatDuration(t.durationSec)} · {t.license}</Body></View>
                    <Chip label="Use" accessibilityLabel={`Use ${t.title}`} selected={false} disabled={busy} onPress={() => useBundled(t)} />
                  </View>
                ))}
              </ScrollView>
            )
          ) : (
            <PrimaryButton title="Choose a file" disabled={busy} onPress={pickFile} />
          )}
        </View>
      )}
    </Sheet>
  );
}
