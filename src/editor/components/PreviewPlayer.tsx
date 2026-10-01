import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { clipAt, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { nextPlayheadFromPlayer } from "@/src/editor/usePreviewSync";
import { formatDurationPrecise } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";

export function PreviewPlayer() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const missing = useEditorStore((s) => s.missingClipIds);
  const { seek, setPlaying } = useEditorStore.getState();

  const hit = useMemo(() => (project ? clipAt(project, playhead) : null), [project, playhead]);
  const loadedClipId = useRef<string | null>(null);

  const player = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = false; });

  // Load the right source and seek while paused.
  useEffect(() => {
    if (!hit || missing.includes(hit.clip.id)) return;
    const sourceTime = hit.clip.trimStart + hit.offsetInClip;
    if (loadedClipId.current !== hit.clip.id) {
      loadedClipId.current = hit.clip.id;
      player.replace({ uri: hit.clip.sourceUri });
      player.currentTime = sourceTime;
      if (isPlaying) player.play();
      return;
    }
    if (!isPlaying) player.currentTime = sourceTime;
  }, [hit?.clip.id, hit?.clip.sourceUri, playhead, isPlaying, missing, player]);

  useEffect(() => { if (isPlaying) player.play(); else player.pause(); }, [isPlaying, player]);

  // Drive the playhead from the player while playing.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      const s = useEditorStore.getState();
      if (!s.isPlaying || !s.project) return;
      const h = clipAt(s.project, s.playhead);
      if (!h || h.clip.id !== loadedClipId.current) return;
      const { playhead: next, ended } = nextPlayheadFromPlayer(s.project, h, currentTime, s.missingClipIds);
      s.seek(next);
      if (ended) s.setPlaying(false);
    });
    return () => sub.remove();
  }, [player]);

  if (!project) return null;
  const ratio = aspectRatioValue(project.aspectRatio);
  const total = totalDuration(project);
  const empty = project.clips.length === 0;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.md }}>
      <Pressable onPress={() => !empty && setPlaying(!isPlaying)} accessibilityLabel={isPlaying ? "Pause" : "Play"}
        style={{ aspectRatio: ratio, maxWidth: "100%", maxHeight: "100%", flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, overflow: "hidden" }}>
        {!empty && <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />}
        {!isPlaying && !empty && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play" size={48} color={theme.colors.text} />
          </View>
        )}
        <View pointerEvents="none" style={{ position: "absolute", bottom: 8, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: theme.radius.chip, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: theme.colors.text, fontVariant: ["tabular-nums"], fontSize: 12 }}>{formatDurationPrecise(playhead)} / {formatDurationPrecise(total)}</Text>
        </View>
      </Pressable>
    </View>
  );
}
