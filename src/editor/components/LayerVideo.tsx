import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { clipGainAt } from "@/src/editor/model/audioMix";
import { clipDuration, outputToSource, rateAt } from "@/src/editor/model/timeline";
import type { LayerClip } from "@/src/editor/model/types";
import { PREVIEW_VOLUME_CAP, shouldWriteVolume } from "@/src/editor/previewVolume";
import { useEditorStore } from "@/src/editor/store";

const DRIFT_TOLERANCE = 0.25; // seconds of REAL time (source drift ÷ the playback rate) before a playing layer is re-seeked
/**
 * How long after readyToPlay a file may go without a first-frame report before it is counted as shown anyway (`onShown`). The
 * report is the trusted signal; this is only the net under it: should the phone never send one (a view kept unseen, a file swapped
 * into the same player), the copy still appears — at worst with the old blink — instead of never.
 */
export const SHOWN_DEADLINE_MS = 800;
const videoFill = { width: "100%" as const, height: "100%" as const };

/**
 * One video layer's picture: its own player, kept in step with the playhead (`offset` = playhead − layer.start, output seconds).
 * Mounted only while the layer is on screen (see LayerStack), so the player lives and dies with the layer's visibility.
 *
 * The rules are AudioPreview's `TrackPlayer`'s: paused → seek to the layer's source time, once per target; playing → seek and
 * `play()` once on entry, then re-seek only when the player has drifted more than DRIFT_TOLERANCE of real time (so a 4× layer is
 * not re-seeked on jitter, and a slow one not left behind); `pause()` once. Everything
 * written to the player goes through a "last applied" ref, so a re-render that changes nothing for the player (every frame of a
 * gesture replaces the project) writes nothing. No effect here sets React state. A reversed layer previews forwards and silent, as
 * a reversed clip does.
 *
 * `onShown` (the main clip's follower asks; a layer does not): called with the file's uri once the player has PRESENTED a frame of
 * the file it was last handed — it reported readyToPlay for that load AND the view rendered a first frame since (`onFirstFrameRender`:
 * AVKit's ready-for-display of the current item), in either order. Both are forgotten when another file is loaded. A file that is
 * ready but has sent no first frame within `SHOWN_DEADLINE_MS` is counted as shown: the timer starts in the readyToPlay handler
 * (never from an effect), belongs to that one load, and is cleared by the first frame, by another file and on unmount. Without
 * the prop the view is handed no handler, no timer is started and nothing here differs.
 */
export function LayerVideo({ layer, offset, onShown }: { layer: LayerClip; offset: number; onShown?: (uri: string) => void }) {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const recording = useEditorStore((s) => s.recording);
  // Created once (a constant source: the file is loaded with replaceAsync below) and released by the hook when this unmounts.
  const player = useVideoPlayer(null, (p) => { p.loop = false; p.muted = false; p.audioMixingMode = "mixWithOthers"; p.preservesPitch = true; });

  // The file the player was last told to load, and whether it has reported readyToPlay since (seeks wait for that).
  const loadedUri = useRef<string | null>(null);
  const ready = useRef(false);
  // Whether the view has rendered a first frame since that file was asked for, and whom to tell (the latest handler).
  const framed = useRef(false);
  const shownTo = useRef(onShown);
  const tellShown = () => { if (ready.current && framed.current && loadedUri.current !== null) shownTo.current?.(loadedUri.current); };
  // The deadline of the current load (null = none running).
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDeadline = () => { if (deadline.current !== null) { clearTimeout(deadline.current); deadline.current = null; } };
  // play() has been called for the current stretch of playback (cleared by pause / a new file): play() once, pause() once.
  const started = useRef(false);
  // Where the paused player was last seeked to; null once it may have moved (it played, or the file changed).
  const lastSeek = useRef<number | null>(null);
  const appliedVolume = useRef<number | null>(null);
  const appliedMuted = useRef(false); // as set up above
  // Remembered rather than read back: the native rate is a Float and e.g. 0.3 never reads back equal (a new player runs at 1).
  const appliedRate = useRef(1);
  // What the player should show right now, for the readyToPlay handler (which runs outside React's render).
  const latest = useRef({ layer, offset, isPlaying });

  const local = Math.min(Math.max(offset, 0), clipDuration(layer));

  /** Brings the (loaded) player to the playhead. Called by the sync effect and once when a file becomes ready. */
  const sync = (l: LayerClip, at: number, playing: boolean) => {
    if (!ready.current) return;
    const t = outputToSource(l, at); // forwards, also for a reversed layer
    if (!playing) {
      if (started.current) { player.pause(); started.current = false; }
      if (lastSeek.current !== t) { player.currentTime = t; lastSeek.current = t; }
      return;
    }
    if (!started.current) {
      // About to start: always seek (a player that ran to its end stays there), then the rate, then play.
      player.currentTime = t;
      lastSeek.current = null;
    }
    // The rate is only written while playing: assigning a non-zero rate starts an AVPlayer, which a paused scrub must never do.
    const rate = rateAt(l.reversed ? { ...l, reversed: false } : l, at);
    if (appliedRate.current !== rate) { player.playbackRate = rate; appliedRate.current = rate; }
    if (!started.current) { player.play(); started.current = true; return; }
    if (Math.abs(player.currentTime - t) / rate > DRIFT_TOLERANCE) player.currentTime = t;
  };

  useEffect(() => { latest.current = { layer, offset: local, isPlaying }; shownTo.current = onShown; });

  // Load (or swap, after Replace) the file. Nothing is seeked until it reports readyToPlay.
  useEffect(() => {
    if (loadedUri.current === layer.sourceUri) return;
    loadedUri.current = layer.sourceUri;
    ready.current = false; framed.current = false; started.current = false; lastSeek.current = null;
    clearDeadline();   // the old file's: it must report nothing for this one
    player.replaceAsync({ uri: layer.sourceUri }).catch(() => {});
  }, [layer.sourceUri, player]);

  // Sound: the layer's gain at the playhead (volume × fades), capped at 1; silent while muted, reversed or recording a voice-over.
  // Declared before the sync effect so the volume is in place before play().
  useEffect(() => {
    const muted = recording || layer.muted || layer.reversed;
    const volume = muted ? 0 : Math.min(PREVIEW_VOLUME_CAP, clipGainAt(layer, local));
    if (shouldWriteVolume(appliedVolume.current, volume)) { player.volume = volume; appliedVolume.current = volume; }
    if (appliedMuted.current !== muted) { player.muted = muted; appliedMuted.current = muted; }
  }, [layer, local, recording, player]);

  useEffect(() => { sync(layer, local, isPlaying); }, [layer, local, isPlaying, player]);

  // Once the file is ready, put the player where the playhead is by now (and start it if the project is playing).
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay" || ready.current) return;
      ready.current = true;
      const now = latest.current;
      sync(now.layer, now.offset, now.isPlaying);
      tellShown();
      // Asked for, ready, and no frame reported yet: wait for the report, but not for ever.
      if (shownTo.current && !framed.current) {
        clearDeadline();
        deadline.current = setTimeout(() => { deadline.current = null; framed.current = true; tellShown(); }, SHOWN_DEADLINE_MS);
      }
    });
    // useVideoPlayer releases the native player in its own unmount cleanup, which runs before this one: every call on it here
    // may throw, so each is swallowed (the release already stopped the picture and the sound).
    return () => {
      clearDeadline();
      try { sub.remove(); } catch {}
      try { player.pause(); } catch {}
    };
  }, [player]);

  const firstFrame = onShown ? { onFirstFrameRender: () => { clearDeadline(); framed.current = true; tellShown(); } } : null;
  return <VideoView testID={`layer-video-${layer.id}`} player={player} style={videoFill} contentFit="fill" nativeControls={false} {...firstFrame} />;
}
