import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type GestureResponderEvent } from "react-native";
import { clipGainAt } from "@/src/editor/model/audioMix";
import { layerHit } from "@/src/editor/model/layerHit";
import { resolveClipMotion } from "@/src/editor/model/motion";
import { clipAt, clipDuration, type ClipHit, clipStartTimes, findItem, hasSpeedCurve, itemOffsetAt, layersAt, outputToSource, rateAt, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue, isPhoto, type Clip } from "@/src/editor/model/types";
import { PREVIEW_VOLUME_CAP, shouldWriteVolume } from "@/src/editor/previewVolume";
import { useEditorStore } from "@/src/editor/store";
import { usePhotoPlayback } from "@/src/editor/usePhotoPlayback";
import { canHandOver, earlyStartDelay, HANDOFF_LEAD, HANDOFF_REARM, hasMoved, keepRolling, nextPreloadTarget, shouldStartEarly, type Playback, type PreloadTarget, type StandbyState } from "@/src/editor/previewHandoff";
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
import { RegionBoxes } from "./RegionBox";
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

/**
 * What one of the preview's two players holds and what was last written to it, so redundant native writes can be skipped.
 * The same fields serve both roles: for the active player they describe the clip on screen, for the standby one the preloaded clip.
 */
type PlayerSlot = {
  /** The clip the player was last loaded / seeked for. */
  loadedClipId: string | null;
  /** The source URI currently loaded in the player — split clips often share one, letting us skip replaceAsync. */
  loadedSourceUri: string | null;
  /** Source-time to seek to once the pending `replaceAsync` reports `readyToPlay`; null when no seek is pending. */
  pendingSeek: number | null;
  /**
   * The source time the player was last seeked to while it stood still; null once it may have moved (playing, a timeUpdate,
   * a new source), so the next paused seek always lands. While `rolling` it keeps the time the player was started from.
   */
  lastSeek: number | null;
  appliedVolume: number | null;
  appliedMuted: boolean | null;
  /**
   * The rate last written to the player (a new player runs at 1). Remembered here rather than read back from the player: the native
   * property is a Float, so a rate such as 0.3 never reads back equal and would be rewritten on every playhead tick.
   */
  appliedRate: number;
  /** The player's last reported status was `readyToPlay` (false from the moment a new file is asked for). */
  ready: boolean;
  /**
   * Standby only: it was started early (silent) from `lastSeek`, just before the cut onto `loadedClipId`, and is playing towards the
   * hand-over. Cleared when it takes over, or when it is stopped because the cut is not coming after all.
   */
  rolling: boolean;
};
/** A slot as the hand-over decisions read it. */
const standbyState = (slot: PlayerSlot): StandbyState =>
  ({ clipId: slot.loadedClipId, sourceUri: slot.loadedSourceUri, seekedTo: slot.lastSeek, ready: slot.ready, pendingSeek: slot.pendingSeek, rolling: slot.rolling });
/** A fresh player's slot. The standby player is created muted at volume 0; the active one's sound is written on first use. */
const newSlot = (standby: boolean): PlayerSlot => ({
  loadedClipId: null, loadedSourceUri: null, pendingSeek: null, lastSeek: null,
  appliedVolume: standby ? 0 : null, appliedMuted: standby ? true : null, appliedRate: 1, ready: false, rolling: false,
});

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
  // Two players, created once for the life of this component and released by the hook when it unmounts. One is ACTIVE (it drives the
  // picture, the sound and the playhead); the other is the STANDBY: paused and silent, holding the next clip's file at that clip's
  // first frame, so a cut between two files is a hand-over instead of a reload (a reload hangs the picture for 0.2–0.3 s on device).
  // A ready player still needs 0.2–0.3 s after play() to get going, so the standby one is started, silent, that long before the cut.
  // preservesPitch is stored on the player and applied by expo-video to every item it loads: set it once.
  const first = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = false; p.audioMixingMode = "mixWithOthers"; p.preservesPitch = true; });
  const second = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = true; p.volume = 0; p.audioMixingMode = "mixWithOthers"; p.preservesPitch = true; });
  const players = [first, second];
  // What each player holds and what was last written to it (see PlayerSlot); index-aligned with `players`.
  const [slots] = useState<PlayerSlot[]>(() => [newSlot(false), newSlot(true)]);
  // Which player is active. The ref is the truth for effects and listeners (it changes in the middle of an effect, at a hand-over);
  // the state only re-renders the VideoView with the other player.
  const active = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // The photo clip the active player was last paused for; null while a video is under the playhead.
  const pausedForPhotoId = useRef<string | null>(null);
  // The active player has reported a time past the one playback started from (see Playback.moving); false again at every pause.
  const moving = useRef(false);
  // The playhead that playback started from, noted at the active player's first tick after Play; null while paused.
  const playedFrom = useRef<number | null>(null);
  // The playhead the active player last wrote to the store, and when (clock ms): how old the store's playhead is while playing.
  const lastTick = useRef<{ playhead: number; at: number } | null>(null);
  // The one timer that starts the standby player between two playhead ticks, and the cut time (clock ms) it was armed for.
  const earlyTimer = useRef<{ id: ReturnType<typeof setTimeout>; cutAt: number } | null>(null);
  // Set by the unmount cleanup: a timer callback that still gets through must not touch the (released) players.
  const unmounted = useRef(false);

  /** Writes player `i`'s rate for `offsetInClip` of `clip` unless it already runs at it; true when it wrote. */
  const applyRateTo = (i: number, clip: Clip, offsetInClip: number): boolean => {
    const slot = slots[i];
    const rate = previewRate(clip, offsetInClip);
    if (slot.appliedRate === rate) return false;
    players[i].playbackRate = rate; slot.appliedRate = rate;
    return true;
  };
  /** The same for the active player. */
  const applyRate = (clip: Clip, offsetInClip: number): boolean => applyRateTo(active.current, clip, offsetInClip);
  /** Writes player `i`'s volume and mute unless they are already in place (the volume only once it has moved enough). */
  const applySound = (i: number, muted: boolean, volume: number) => {
    const slot = slots[i];
    if (shouldWriteVolume(slot.appliedVolume, volume)) { players[i].volume = volume; slot.appliedVolume = volume; }
    if (slot.appliedMuted !== muted) { players[i].muted = muted; slot.appliedMuted = muted; }
  };
  /**
   * Every path that starts the active player goes through here: the rate of the step under the store's playhead is applied first (a
   * paused scrub over a curved clip leaves it unwritten), then the player plays. It moves on from wherever it was seeked to.
   */
  const startPlayer = () => {
    const s = useEditorStore.getState();
    const h = s.project ? clipAt(s.project, s.playhead) : null;
    if (h && !isPhoto(h.clip)) applyRate(h.clip, h.offsetInClip);
    slots[active.current].lastSeek = null;
    players[active.current].play();
  };
  const seekPlayer = (t: number) => { players[active.current].currentTime = t; slots[active.current].lastSeek = t; };
  /** How playback stands for a playhead read from the store: its age counts only when the active player's last tick put it there. */
  const playbackAt = (at: number, playing: boolean): Playback => {
    const tick = lastTick.current;
    return { playing, moving: moving.current, sinceTick: tick && tick.playhead === at ? Math.max(0, (Date.now() - tick.at) / 1000) : 0 };
  };
  const cancelEarlyStart = () => {
    if (!earlyTimer.current) return;
    clearTimeout(earlyTimer.current.id);
    earlyTimer.current = null;
  };
  /**
   * The early start of the standby player, for the playhead tick and for the timer alike: start it now when it is time (the next
   * clip's rate first, written once — the hand-over finds it in place; `lastSeek` stays, it is where it was started from), else keep
   * exactly one timer armed for the moment it will be, else none. `rolling` makes the start happen once, whoever gets there first.
   * The timer is left alone while the cut it was armed for has not moved: this runs on every playhead tick.
   */
  const startEarlyOrArm = (at: ClipHit, target: PreloadTarget | null, playback: Playback) => {
    const i = 1 - active.current;
    const slot = slots[i];
    if (target && shouldStartEarly(at, target, standbyState(slot), playback)) {
      cancelEarlyStart();
      applyRateTo(i, target.clip, 0);
      players[i].play();
      slot.rolling = true;
      return;
    }
    const delay = earlyStartDelay(at, target, standbyState(slot), playback);
    if (delay === null) { cancelEarlyStart(); return; }
    const cutAt = Date.now() + (delay + HANDOFF_LEAD) * 1000;
    if (earlyTimer.current && Math.abs(earlyTimer.current.cutAt - cutAt) <= HANDOFF_REARM * 1000) return;
    cancelEarlyStart();
    earlyTimer.current = { cutAt, id: setTimeout(onEarlyTimer, Math.round(delay * 1000)) };
  };
  /** The timer: nothing it was armed with is trusted — the same decision is taken again on what the store holds now. */
  const onEarlyTimer = () => {
    earlyTimer.current = null;
    if (unmounted.current) return;
    const s = useEditorStore.getState();
    const h = s.project ? clipAt(s.project, s.playhead) : null;
    if (!s.project || !h) return;
    startEarlyOrArm(h, nextPreloadTarget(s.project, h.index, s.missingSourceUris), playbackAt(s.playhead, s.isPlaying));
  };

  // A photo under the playhead: the player stays paused and a timer moves the playhead instead.
  usePhotoPlayback(isPlaying && !!hit && isPhoto(hit.clip) && !missing.includes(hit.clip.sourceUri));

  // Load the right source and seek while paused; hand over to the standby player at a cut it has ready.
  useEffect(() => {
    if (!hit || !project) return;
    if (missing.includes(hit.clip.sourceUri)) {
      // The clip under the playhead is missing its source file: don't play it.
      players[active.current].pause();
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
      if (pausedForPhotoId.current !== hit.clip.id) { players[active.current].pause(); pausedForPhotoId.current = hit.clip.id; }
      slots[active.current].loadedClipId = null;
      return;
    }
    pausedForPhotoId.current = null;
    // Keyed on the file too: Replace (and its undo / redo) keeps the clip id but swaps the file.
    const arriving = slots[active.current].loadedClipId !== hit.clip.id || slots[active.current].loadedSourceUri !== hit.clip.sourceUri;
    // A cut while PLAYING onto the clip the standby player has ready: that player takes over (never while paused — a scrub, an
    // undo, a Replace or a seek into the middle of a clip takes the load / seek path below on the active player, as ever).
    // The roles swap here, before anything is written, so the clip's sound and rate below go to the player that will show it.
    const standby = slots[1 - active.current];
    const handOver = arriving && isPlaying && canHandOver(standbyState(standby), hit);
    if (handOver) active.current = 1 - active.current;
    const slot = slots[active.current];
    const player = players[active.current];
    // This effect also re-runs for edits that don't concern the player (e.g. every frame of a transform
    // gesture replaces `project`), so each native write below is skipped when it would change nothing.
    // expo-video caps player.volume at 1; values above 1 are only honoured in the export.
    // A reversed clip is silent in the export, so it plays muted here too; so does every clip while a voice-over is recorded.
    // Otherwise the volume is the clip's gain at the playhead (volume × its fades): while playing, each timeUpdate moves the
    // playhead, this effect re-runs, and the volume is written only once it has moved enough (shouldWriteVolume) — never a
    // seek, a pause or state. An un-faded clip's gain is its volume everywhere: one write, as ever.
    const muted = recording || hit.clip.muted || hit.clip.reversed;
    const volume = muted ? 0 : Math.min(PREVIEW_VOLUME_CAP, clipGainAt(hit.clip, Math.min(hit.offsetInClip, clipDuration(hit.clip))));
    applySound(active.current, muted, volume);
    // expo-video's playbackRate setter assigns AVPlayer.rate, and a non-zero rate starts playback: only
    // assign it when it changes, and re-assert the paused state so a paused scrub never starts the player.
    // On a speed curve the rate is the step's under the playhead: while playing, each timeUpdate moves the playhead, this effect
    // re-runs, and the rate is written only when the playhead has entered a step with another speed — never a seek, never state.
    // While paused a curved clip's rate is left alone (a scrub would otherwise write it, and pause again, at every step it
    // crosses); `startPlayer` applies it when playback starts. A constant-speed clip's rate is written paused or not, as ever.
    const rateChanged = (isPlaying || !hasSpeedCurve(hit.clip)) && applyRate(hit.clip, hit.offsetInClip);
    if (handOver) {
      // The new player already stands on the clip's first frame, or was started from it a moment ago (rolling: no second play();
      // the playhead follows its timeUpdates from wherever it has got to). Start it if need be, then stop and silence the one that
      // showed the last clip (its rate is left alone: a rate write would start it again), and point the view at the new one.
      slot.lastSeek = null;
      if (!slot.rolling) player.play();
      slot.rolling = false;
      players[1 - active.current].pause();
      applySound(1 - active.current, true, 0);
      setActiveIndex(active.current);
      return;
    }
    if (!isPlaying && (rateChanged || player.playing)) player.pause();
    const sourceTime = outputToSource(hit.clip, hit.offsetInClip);
    if (arriving) {
      slot.loadedClipId = hit.clip.id;
      if (hit.clip.sourceUri === slot.loadedSourceUri) {
        // Same underlying file as before (e.g. the other half of a split clip): no need to reload it,
        // and expo-video may not emit a fresh readyToPlay for an unchanged source, which would leave
        // pendingSeek set forever. If that file is still loading, retarget its pending seek instead
        // (the readyToPlay handler seeks and resumes).
        if (slot.pendingSeek !== null) slot.pendingSeek = sourceTime;
        else {
          seekPlayer(sourceTime);
          if (isPlaying) startPlayer();
        }
        return;
      }
      slot.loadedSourceUri = hit.clip.sourceUri;
      slot.pendingSeek = sourceTime;
      slot.lastSeek = null;
      slot.ready = false;
      player.replaceAsync({ uri: hit.clip.sourceUri });
      return;
    }
    if (!isPlaying) {
      if (slot.pendingSeek !== null) slot.pendingSeek = sourceTime; // land the pending seek where the user scrubbed to
      else if (slot.lastSeek !== sourceTime) seekPlayer(sourceTime);
    }
  }, [hit?.clip.id, hit?.clip.kind, hit?.clip.sourceUri, hit?.clip.trimStart, hit?.clip.trimEnd, hit?.clip.volume, hit?.clip.muted, hit?.clip.reversed, hit?.clip.speed, hit?.clip.speedCurve, hit?.clip.fadeIn, hit?.clip.fadeOut, recording, playhead, isPlaying, missing, project, first, second, seek, setPlaying]);

  // The standby player. Prepare it for the next clip: load its file unless it already holds it, and stand on the clip's first frame.
  // Then, while playing, start it (silent, at the next clip's rate) once the current clip is down to its last HANDOFF_LEAD, so it is
  // already moving at the cut; and stop it again if that cut is not coming after all (a pause, a seek away, an edit, the next clip
  // changing) — it is then seeked back to the clip's start by the preload below, and never handed over from where it had got to.
  // Declared after the effect above, so after a hand-over it is the player that just left the screen that prepares the clip after.
  // It re-runs with every playhead tick and every edit, so every write is guarded by what the slot remembers: one play(), one
  // pause(), one seek, one rate write. It never writes the sound (the standby player is silent until it takes over).
  // The playhead ticks every 0.05 s of MEDIA time — every 0.2 s of playback on a 0.25× clip — so a tick alone can find the window
  // far too late: when the window is still ahead, one timer is armed for its start (startEarlyOrArm), and cancelled on every path
  // below on which the early start is off (a pause, nothing to preload, the standby player loading or not ready).
  useEffect(() => {
    if (!isPlaying) { moving.current = false; playedFrom.current = null; } // the next Play starts from a standing player
    const i = 1 - active.current;
    const slot = slots[i];
    const player = players[i];
    const target = project && hit ? nextPreloadTarget(project, hit.index, missing) : null;
    const playback = playbackAt(playhead, isPlaying);
    if (slot.rolling) {
      if (keepRolling(hit, target, standbyState(slot), playback)) return; // no timer is alive: starting it cancelled it
      player.pause();
      slot.rolling = false;
      slot.lastSeek = null; // it has moved: the preload below seeks it back
    }
    if (!hit || !target) { cancelEarlyStart(); return; }
    slot.loadedClipId = target.clip.id;
    if (slot.loadedSourceUri !== target.clip.sourceUri) {
      cancelEarlyStart();
      slot.loadedSourceUri = target.clip.sourceUri;
      slot.pendingSeek = target.sourceTime; // lands once the file reports readyToPlay
      slot.lastSeek = null;
      slot.ready = false;
      player.replaceAsync({ uri: target.clip.sourceUri }).catch(() => {});
      return;
    }
    if (slot.pendingSeek !== null) slot.pendingSeek = target.sourceTime;
    else if (slot.lastSeek !== target.sourceTime) { player.currentTime = target.sourceTime; slot.lastSeek = target.sourceTime; }
    startEarlyOrArm(hit, target, playback);
  }, [project, hit, playhead, isPlaying, missing, first, second, slots]);

  // Unmounting: no timer outlives the players (the hook releases them in its own cleanup).
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; cancelEarlyStart(); };
  }, []);

  // Play / pause toggles. Crossing between clips while playing is handled by the effects above.
  useEffect(() => {
    if (isPlaying && !photoAtPlayhead()) startPlayer(); else players[active.current].pause();
  }, [isPlaying, first, second]);

  // Apply a player's pending seek once its newly replaced source is ready; the active one then resumes playback if needed.
  // The standby player's readyToPlay only lands its own preload seek.
  useEffect(() => {
    const subs = [first, second].map((player, i) => player.addListener("statusChange", ({ status, error }) => {
      const slot = slots[i];
      slot.ready = status === "readyToPlay";
      if (status === "readyToPlay" && slot.pendingSeek !== null) {
        player.currentTime = slot.pendingSeek;
        slot.lastSeek = slot.pendingSeek;
        slot.pendingSeek = null;
        if (i === active.current && useEditorStore.getState().isPlaying && !photoAtPlayhead()) startPlayer();
      } else if (status === "error") {
        // Unblock timeUpdate handling even though the seek never landed, and surface the failure once. The player is nowhere
        // we know of any more, and no longer rolling towards a cut: a cut onto its clip must not hand over to it (the playhead
        // would stall on a dead player) — it takes the reload path on the player on screen instead.
        slot.pendingSeek = null;
        slot.lastSeek = null;
        slot.rolling = false;
        console.warn("PreviewPlayer: video player error", error);
      }
    }));
    // useVideoPlayer releases the native players in its own unmount cleanup, which runs before this one: a call on a released
    // player may throw, so each is swallowed.
    return () => { for (const sub of subs) { try { sub.remove(); } catch {} } };
  }, [first, second, slots]);

  // Drive the playhead from the ACTIVE player while playing. The other player's events are dropped whole: the standby's seek landing
  // is not playback, and a late event from the player that has just handed over still carries the previous clip's time — it must
  // not move the playhead back into that clip (the two clips would then reload each other).
  useEffect(() => {
    const subs = [first, second].map((player, i) => player.addListener("timeUpdate", ({ currentTime }) => {
      if (i !== active.current) return;
      const slot = slots[i];
      const s = useEditorStore.getState();
      // A playing player has moved on from where we last seeked it. (Not while paused: a paused player reports
      // the time our own seek landed on, and forgetting it then would re-seek on every gesture frame.)
      if (s.isPlaying) slot.lastSeek = null;
      if (slot.pendingSeek !== null) return; // the source hasn't been seeked into place yet
      if (!s.isPlaying || !s.project) return;
      const h = clipAt(s.project, s.playhead);
      if (!h || isPhoto(h.clip) || h.clip.id !== slot.loadedClipId) return; // a photo's timer owns the playhead
      const { playhead: next, ended } = nextPlayheadFromPlayer(s.project, h, currentTime, s.missingSourceUris);
      if (!moving.current) {
        playedFrom.current ??= s.playhead;
        moving.current = hasMoved(playedFrom.current, next); // its clock is running
      }
      lastTick.current = { playhead: next, at: Date.now() }; // before the store hears of it: the effects read it
      s.seek(next);
      if (ended) s.setPlaying(false);
    }));
    return () => { for (const sub of subs) { try { sub.remove(); } catch {} } };
  }, [first, second, slots]);

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
              {/* One view for both players: only its `player` prop changes at a hand-over, so it never remounts. */}
              <VideoView testID="preview-video" player={players[activeIndex]} style={{ width: "100%", height: "100%" }} contentFit="fill" nativeControls={false} />
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
        {/* Blur / mosaic boxes: above the picture, the layers and the effect colours, below text and stickers. Only the selected box
            takes touches, and no clip is selected then (selection is exclusive), so it never competes with the clip gestures. */}
        {frame.w > 0 && <RegionBoxes frameW={frame.w} frameH={frame.h} />}
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
