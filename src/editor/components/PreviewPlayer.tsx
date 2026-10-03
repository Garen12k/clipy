import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { clipAt, clipStartTimes, outputToSource, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue, isPhoto } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { usePhotoPlayback } from "@/src/editor/usePhotoPlayback";
import { nextPlayheadFromPlayer, nextPresentClipIndex } from "@/src/editor/usePreviewSync";
import { theme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";
import { ClipFrame } from "./ClipFrame";
import { ClipGestures } from "./ClipGestures";
import { FilterLayer } from "./FilterLayer";
import { OverlayLayer } from "./OverlayLayer";
import { needsPreviewTag, PreviewTag } from "./PreviewTag";
import { TransitionLayer } from "./TransitionLayer";

/** True when the clip under the store's playhead is a photo: the video player must stay paused then. */
function photoAtPlayhead(): boolean {
  const s = useEditorStore.getState();
  const h = s.project ? clipAt(s.project, s.playhead) : null;
  return !!h && isPhoto(h.clip);
}

export function PreviewPlayer({ onOpenPanel }: { onOpenPanel?: (overlayId: string) => void }) {
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
  // The photo clip the player was last paused for; null while a video is under the playhead.
  const pausedForPhotoId = useRef<string | null>(null);
  // The last values written to the player, so redundant writes can be skipped. `lastSeek` is the source time
  // the player was last seeked to while it stood still; null once it may have moved (playing, a timeUpdate,
  // a new source), so the next paused seek always lands.
  const lastSeek = useRef<number | null>(null);
  const appliedVolume = useRef<number | null>(null);
  const appliedMuted = useRef<boolean | null>(null);

  // preservesPitch is stored on the player and applied by expo-video to every item it loads: set it once.
  const player = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = false; p.audioMixingMode = "mixWithOthers"; p.preservesPitch = true; });
  const seekPlayer = (t: number) => { player.currentTime = t; lastSeek.current = t; };

  // A photo under the playhead: the player stays paused and a timer moves the playhead instead.
  usePhotoPlayback(isPlaying && !!hit && isPhoto(hit.clip) && !missing.includes(hit.clip.sourceUri));

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
    if (isPhoto(hit.clip)) {
      // Nothing to load: pause the player once on arriving at this photo (not on every playhead tick of its
      // timer), and forget the loaded clip so coming back to a video (even the same one) re-seeks it and resumes.
      if (pausedForPhotoId.current !== hit.clip.id) { player.pause(); pausedForPhotoId.current = hit.clip.id; }
      loadedClipId.current = null;
      return;
    }
    pausedForPhotoId.current = null;
    // This effect also re-runs for edits that don't concern the player (e.g. every frame of a transform
    // gesture replaces `project`), so each native write below is skipped when it would change nothing.
    // expo-video caps player.volume at 1; values above 1 are only honoured in the export.
    const volume = hit.clip.muted ? 0 : Math.min(1, hit.clip.volume);
    if (appliedVolume.current !== volume) { player.volume = volume; appliedVolume.current = volume; }
    if (appliedMuted.current !== hit.clip.muted) { player.muted = hit.clip.muted; appliedMuted.current = hit.clip.muted; }
    // expo-video's playbackRate setter assigns AVPlayer.rate, and a non-zero rate starts playback: only
    // assign it when it changes, and re-assert the paused state so a paused scrub never starts the player.
    const rateChanged = player.playbackRate !== hit.clip.speed;
    if (rateChanged) player.playbackRate = hit.clip.speed;
    if (!isPlaying && (rateChanged || player.playing)) player.pause();
    const sourceTime = outputToSource(hit.clip, hit.offsetInClip);
    if (loadedClipId.current !== hit.clip.id) {
      loadedClipId.current = hit.clip.id;
      if (hit.clip.sourceUri === loadedSourceUri.current) {
        // Same underlying file as before (e.g. the other half of a split clip): no need to reload it,
        // and expo-video may not emit a fresh readyToPlay for an unchanged source, which would leave
        // pendingSeek set forever. If that file is still loading, retarget its pending seek instead
        // (the readyToPlay handler seeks and resumes).
        if (pendingSeek.current !== null) pendingSeek.current = sourceTime;
        else {
          seekPlayer(sourceTime);
          if (isPlaying) player.play();
        }
        return;
      }
      loadedSourceUri.current = hit.clip.sourceUri;
      pendingSeek.current = sourceTime;
      lastSeek.current = null;
      player.replaceAsync({ uri: hit.clip.sourceUri });
      return;
    }
    if (!isPlaying) {
      if (pendingSeek.current !== null) pendingSeek.current = sourceTime; // land the pending seek where the user scrubbed to
      else if (lastSeek.current !== sourceTime) seekPlayer(sourceTime);
    }
  }, [hit?.clip.id, hit?.clip.kind, hit?.clip.sourceUri, hit?.clip.trimStart, hit?.clip.trimEnd, hit?.clip.volume, hit?.clip.muted, hit?.clip.speed, playhead, isPlaying, missing, project, player, seek, setPlaying]);

  // Play / pause toggles. Crossing between clips while playing is handled by the effect above.
  useEffect(() => {
    if (isPlaying && !photoAtPlayhead()) { lastSeek.current = null; player.play(); } else player.pause();
  }, [isPlaying, player]);

  // Apply the pending seek once the newly replaced source is ready, then resume playback if needed.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "readyToPlay" && pendingSeek.current !== null) {
        player.currentTime = pendingSeek.current;
        lastSeek.current = pendingSeek.current;
        pendingSeek.current = null;
        if (useEditorStore.getState().isPlaying && !photoAtPlayhead()) { lastSeek.current = null; player.play(); }
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
      const s = useEditorStore.getState();
      // A playing player has moved on from where we last seeked it. (Not while paused: a paused player reports
      // the time our own seek landed on, and forgetting it then would re-seek on every gesture frame.)
      if (s.isPlaying) lastSeek.current = null;
      if (pendingSeek.current !== null) return; // the source hasn't been seeked into place yet
      if (!s.isPlaying || !s.project) return;
      const h = clipAt(s.project, s.playhead);
      if (!h || isPhoto(h.clip) || h.clip.id !== loadedClipId.current) return; // a photo's timer owns the playhead
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
        accessibilityLabel="Preview"
        accessibilityHint="Tap to play or pause"
        style={{ aspectRatio: ratio, maxWidth: "100%", maxHeight: "100%", flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, overflow: "hidden" }}>
        {hit && frame.w > 0 && (
          <ClipFrame clip={hit.clip} frameW={frame.w} frameH={frame.h}>
            <VideoView testID="preview-video" player={player} style={{ width: "100%", height: "100%" }} contentFit="fill" nativeControls={false} />
          </ClipFrame>
        )}
        <FilterLayer filter={hit?.clip.filter ?? null} />
        <TransitionLayer />
        {frame.w > 0 && <ClipGestures frameW={frame.w} frameH={frame.h} />}
        {frame.w > 0 && <OverlayLayer frameW={frame.w} frameH={frame.h} onOpenPanel={(id) => onOpenPanel?.(id)} />}
        <PreviewTag visible={needsPreviewTag(project, playhead)} />
        {!isPlaying && !empty && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play" size={48} color={theme.colors.text} />
          </View>
        )}
      </Pressable>
    </View>
  );
}
