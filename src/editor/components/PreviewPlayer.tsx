import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type GestureResponderEvent } from "react-native";
import { clipGainAt } from "@/src/editor/model/audioMix";
import { layerHit } from "@/src/editor/model/layerHit";
import { resolveClipMotion } from "@/src/editor/model/motion";
import { clipAt, clipDuration, clipStartTimes, findItem, hasSpeedCurve, itemOffsetAt, layersAt, outputToSource, rateAt, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue, isPhoto, type Clip } from "@/src/editor/model/types";
import { PREVIEW_VOLUME_CAP, shouldWriteVolume } from "@/src/editor/previewVolume";
import { useEditorStore } from "@/src/editor/store";
import { usePhotoPlayback } from "@/src/editor/usePhotoPlayback";
import { nextPlayheadFromPlayer, nextPresentClipIndex } from "@/src/editor/usePreviewSync";
import { theme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";
import { AdjustLayer } from "./AdjustLayer";
import { ClipFrame, clipFrameMotion } from "./ClipFrame";
import { ClipGestures } from "./ClipGestures";
import { EffectOverlays, useEffectTransform } from "./EffectLayer";
import { FilterLayer } from "./FilterLayer";
import { LayerStack } from "./LayerStack";
import { OverlayLayer } from "./OverlayLayer";
import { needsPreviewTag, PreviewTag } from "./PreviewTag";
import { TransitionLayer } from "./TransitionLayer";

/** The view the effect transform is applied to: exactly the preview frame, so it scales about the frame's centre. */
const effectFill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/**
 * The rate the player runs at `offsetInClip`: the speed of the step under the playhead (the clip's one speed without a curve).
 * The preview plays a reversed clip forwards (`outputToSource`), so the step is looked up forwards too — the one the player is in.
 */
const previewRate = (clip: Clip, offsetInClip: number): number => rateAt(clip.reversed ? { ...clip, reversed: false } : clip, offsetInClip);

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
  const recording = useEditorStore((s) => s.recording);
  const { seek, setPlaying, selectOverlay } = useEditorStore.getState();
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const effectTransform = useEffectTransform(frame.w, frame.h);

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
  // The rate last written to the player (a new player runs at 1). Remembered here rather than read back from the player: the native
  // property is a Float, so a rate such as 0.3 never reads back equal and would be rewritten on every playhead tick.
  const appliedRate = useRef(1);
  /** Writes the rate for `offsetInClip` of `clip` unless the player already runs at it; true when it wrote. */
  const applyRate = (clip: Clip, offsetInClip: number): boolean => {
    const rate = previewRate(clip, offsetInClip);
    if (appliedRate.current === rate) return false;
    player.playbackRate = rate; appliedRate.current = rate;
    return true;
  };
  /**
   * Every path that starts the player goes through here: the rate of the step under the store's playhead is applied first (a
   * paused scrub over a curved clip leaves it unwritten), then the player plays. It moves on from wherever it was seeked to.
   */
  const startPlayer = () => {
    const s = useEditorStore.getState();
    const h = s.project ? clipAt(s.project, s.playhead) : null;
    if (h && !isPhoto(h.clip)) applyRate(h.clip, h.offsetInClip);
    lastSeek.current = null;
    player.play();
  };

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
    // A reversed clip is silent in the export, so it plays muted here too; so does every clip while a voice-over is recorded.
    // Otherwise the volume is the clip's gain at the playhead (volume × its fades): while playing, each timeUpdate moves the
    // playhead, this effect re-runs, and the volume is written only once it has moved enough (shouldWriteVolume) — never a
    // seek, a pause or state. An un-faded clip's gain is its volume everywhere: one write, as ever.
    const muted = recording || hit.clip.muted || hit.clip.reversed;
    const volume = muted ? 0 : Math.min(PREVIEW_VOLUME_CAP, clipGainAt(hit.clip, Math.min(hit.offsetInClip, clipDuration(hit.clip))));
    if (shouldWriteVolume(appliedVolume.current, volume)) { player.volume = volume; appliedVolume.current = volume; }
    if (appliedMuted.current !== muted) { player.muted = muted; appliedMuted.current = muted; }
    // expo-video's playbackRate setter assigns AVPlayer.rate, and a non-zero rate starts playback: only
    // assign it when it changes, and re-assert the paused state so a paused scrub never starts the player.
    // On a speed curve the rate is the step's under the playhead: while playing, each timeUpdate moves the playhead, this effect
    // re-runs, and the rate is written only when the playhead has entered a step with another speed — never a seek, never state.
    // While paused a curved clip's rate is left alone (a scrub would otherwise write it, and pause again, at every step it
    // crosses); `startPlayer` applies it when playback starts. A constant-speed clip's rate is written paused or not, as ever.
    const rateChanged = (isPlaying || !hasSpeedCurve(hit.clip)) && applyRate(hit.clip, hit.offsetInClip);
    if (!isPlaying && (rateChanged || player.playing)) player.pause();
    const sourceTime = outputToSource(hit.clip, hit.offsetInClip);
    // Keyed on the file too: Replace (and its undo / redo) keeps the clip id but swaps the file.
    if (loadedClipId.current !== hit.clip.id || loadedSourceUri.current !== hit.clip.sourceUri) {
      loadedClipId.current = hit.clip.id;
      if (hit.clip.sourceUri === loadedSourceUri.current) {
        // Same underlying file as before (e.g. the other half of a split clip): no need to reload it,
        // and expo-video may not emit a fresh readyToPlay for an unchanged source, which would leave
        // pendingSeek set forever. If that file is still loading, retarget its pending seek instead
        // (the readyToPlay handler seeks and resumes).
        if (pendingSeek.current !== null) pendingSeek.current = sourceTime;
        else {
          seekPlayer(sourceTime);
          if (isPlaying) startPlayer();
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
  }, [hit?.clip.id, hit?.clip.kind, hit?.clip.sourceUri, hit?.clip.trimStart, hit?.clip.trimEnd, hit?.clip.volume, hit?.clip.muted, hit?.clip.reversed, hit?.clip.speed, hit?.clip.speedCurve, hit?.clip.fadeIn, hit?.clip.fadeOut, recording, playhead, isPlaying, missing, project, player, seek, setPlaying]);

  // Play / pause toggles. Crossing between clips while playing is handled by the effect above.
  useEffect(() => {
    if (isPlaying && !photoAtPlayhead()) startPlayer(); else player.pause();
  }, [isPlaying, player]);

  // Apply the pending seek once the newly replaced source is ready, then resume playback if needed.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "readyToPlay" && pendingSeek.current !== null) {
        player.currentTime = pendingSeek.current;
        lastSeek.current = pendingSeek.current;
        pendingSeek.current = null;
        if (useEditorStore.getState().isPlaying && !photoAtPlayhead()) startPlayer();
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
  // Animations, keyframes and the clip's own opacity at the playhead; no overrides at all for a default clip.
  const motion = hit ? clipFrameMotion(hit.clip, hit.offsetInClip) : null;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.md }}>
      <Pressable
        onPress={(e?: GestureResponderEvent) => {
          // A tap on a layer's picture (the topmost one there) selects it; with a layer selected, a tap anywhere else deselects it.
          // A tap on the layer that is already selected is an ordinary tap on the preview (play / pause): a layer filling the
          // frame must not swallow every tap.
          // Texts and stickers sit above with their own Pressables, so a tap on one of them never gets here.
          const s = useEditorStore.getState();
          if (s.project && frame.w > 0 && frame.h > 0) {
            const p = s.project, at = s.playhead;
            // Relative to the view the touch landed in: this frame, or the gesture area that covers it exactly.
            const point = { x: e?.nativeEvent?.locationX ?? NaN, y: e?.nativeEvent?.locationY ?? NaN };
            const layerId = layerHit(layersAt(p, at), point, frame.w, frame.h, (l) => resolveClipMotion(l, itemOffsetAt(p, l.id, at) ?? 0));
            if (layerId && layerId !== s.selectedClipId) { s.select(layerId); return; }
            if (!layerId && s.selectedClipId && findItem(p, s.selectedClipId)?.layer) { s.select(null); return; }
          }
          if (useEditorStore.getState().selectedOverlayId) { selectOverlay(null); return; }
          if (useEditorStore.getState().selectedEffectId) { useEditorStore.getState().selectEffect(null); return; }
          if (useEditorStore.getState().selectedAudioId) { useEditorStore.getState().selectAudio(null); return; }
          if (empty) return;
          if (!isPlaying && playhead >= total) seek(0);
          setPlaying(!isPlaying);
        }}
        onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel="Preview"
        accessibilityHint="Tap to play or pause"
        style={{ aspectRatio: ratio, maxWidth: "100%", maxHeight: "100%", flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, overflow: "hidden" }}>
        {hit && frame.w > 0 && (
          // Timeline effects shake / zoom only the picture. This view is always there (its transform comes
          // and goes) so an effect starting or ending never remounts the VideoView; the frame above clips it.
          <View testID="effect-transform" pointerEvents="none" style={[effectFill, effectTransform]}>
            <ClipFrame clip={hit.clip} frameW={frame.w} frameH={frame.h} transform={motion?.transform} opacity={motion?.opacity}>
              <VideoView testID="preview-video" player={player} style={{ width: "100%", height: "100%" }} contentFit="fill" nativeControls={false} />
            </ClipFrame>
          </View>
        )}
        <FilterLayer filter={hit?.clip.filter ?? null} intensity={hit?.clip.filterIntensity} />
        {hit && <AdjustLayer adjust={hit.clip.adjust} />}
        {/* The transition's dip covers the main picture only: the export draws the layers over the already-transitioned main frame. */}
        <TransitionLayer />
        {/* Layers sit above the main clip's look layers and its transition, and below everything else. They take the picture's effect
            transform (so they shake / zoom with it) in a view of their own: the main VideoView's place in the tree does not depend on them. */}
        {hit && frame.w > 0 && <LayerStack frameW={frame.w} frameH={frame.h} style={effectTransform} />}
        <EffectOverlays />
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
