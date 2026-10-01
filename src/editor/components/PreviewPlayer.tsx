import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { clipAt, clipStartTimes, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { nextPlayheadFromPlayer, nextPresentClipIndex } from "@/src/editor/usePreviewSync";
import { formatDurationPrecise } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";
import { OverlayLayer } from "./OverlayLayer";

export function PreviewPlayer({ onOpenTextPanel }: { onOpenTextPanel?: (overlayId: string) => void }) {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const { seek, setPlaying, selectOverlay } = useEditorStore.getState();
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  const hit = useMemo(() => (project ? clipAt(project, playhead) : null), [project, playhead]);
  const loadedClipId = useRef<string | null>(null);
  // The source URI currently loaded in the player — split clips often share one, letting us skip replaceAsync.
  const loadedSourceUri = useRef<string | null>(null);
  // Source-time to seek to once the pending `replaceAsync` reports `readyToPlay`; null when no seek is pending.
  const pendingSeek = useRef<number | null>(null);

  const player = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = false; });

  // Load the right source and seek while paused.
  useEffect(() => {
    if (!hit || !project) return;
    if (missing.includes(hit.clip.sourceUri)) {
      // The clip under the playhead is missing its source file: don't play it.
      player.pause();
      if (isPlaying) {
        const next = nextPresentClipIndex(project, hit.index, missing);
        if (next !== null) seek(clipStartTimes(project)[next]);
        else { seek(totalDuration(project)); setPlaying(false); }
      }
      return;
    }
    // expo-video caps player.volume at 1; values above 1 are only honoured in the export.
    player.volume = hit.clip.muted ? 0 : Math.min(1, hit.clip.volume);
    player.muted = hit.clip.muted;
    const sourceTime = hit.clip.trimStart + hit.offsetInClip;
    if (loadedClipId.current !== hit.clip.id) {
      loadedClipId.current = hit.clip.id;
      if (hit.clip.sourceUri === loadedSourceUri.current) {
        // Same underlying file as before (e.g. the other half of a split clip): no need to reload it,
        // and expo-video may not emit a fresh readyToPlay for an unchanged source, which would leave
        // pendingSeek set forever.
        player.currentTime = sourceTime;
        if (isPlaying) player.play();
        return;
      }
      loadedSourceUri.current = hit.clip.sourceUri;
      pendingSeek.current = sourceTime;
      player.replaceAsync({ uri: hit.clip.sourceUri });
      return;
    }
    if (!isPlaying) {
      if (pendingSeek.current !== null) pendingSeek.current = sourceTime; // land the pending seek where the user scrubbed to
      else player.currentTime = sourceTime;
    }
  }, [hit?.clip.id, hit?.clip.sourceUri, hit?.clip.trimStart, hit?.clip.trimEnd, hit?.clip.volume, hit?.clip.muted, playhead, isPlaying, missing, project, player, seek, setPlaying]);

  useEffect(() => { if (isPlaying) player.play(); else player.pause(); }, [isPlaying, player]);

  // Apply the pending seek once the newly replaced source is ready, then resume playback if needed.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "readyToPlay" && pendingSeek.current !== null) {
        player.currentTime = pendingSeek.current;
        pendingSeek.current = null;
        if (useEditorStore.getState().isPlaying) player.play();
      } else if (status === "error") {
        // Unblock timeUpdate handling even though the seek never landed, and surface the failure once.
        pendingSeek.current = null;
        console.warn("PreviewPlayer: video player error", error);
      }
    });
    return () => sub.remove();
  }, [player]);

  // Drive the playhead from the player while playing.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      if (pendingSeek.current !== null) return; // the source hasn't been seeked into place yet
      const s = useEditorStore.getState();
      if (!s.isPlaying || !s.project) return;
      const h = clipAt(s.project, s.playhead);
      if (!h || h.clip.id !== loadedClipId.current) return;
      const { playhead: next, ended } = nextPlayheadFromPlayer(s.project, h, currentTime, s.missingSourceUris);
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
      <Pressable
        onPress={() => {
          if (useEditorStore.getState().selectedOverlayId) { selectOverlay(null); return; }
          if (empty) return;
          if (!isPlaying && playhead >= total) seek(0);
          setPlaying(!isPlaying);
        }}
        onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel={isPlaying ? "Pause" : "Play"}
        style={{ aspectRatio: ratio, maxWidth: "100%", maxHeight: "100%", flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, overflow: "hidden" }}>
        {!empty && <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />}
        {frame.w > 0 && <OverlayLayer frameW={frame.w} frameH={frame.h} onOpenPanel={(id) => onOpenTextPanel?.(id)} />}
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
