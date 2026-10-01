import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef } from "react";
import { songTimeAt } from "@/src/editor/model/audioSync";
import { useEditorStore } from "@/src/editor/store";

const DRIFT_TOLERANCE = 0.25; // seconds before we re-seek the song while playing

/** Invisible component: plays the project's music track in sync with the store's playhead. */
export function AudioPreview() {
  const track = useEditorStore((s) => s.project?.audioTracks[0] ?? null);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const loadedUri = useRef<string | null>(null);

  // Mix with the video's own audio session instead of taking exclusive focus or
  // deactivating the shared session when this player pauses (which would otherwise
  // either pause expo-video's playback or silence it mid-scene).
  useEffect(() => {
    setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!track || missing.includes(track.sourceUri)) { player.pause(); loadedUri.current = null; return; }
    if (loadedUri.current !== track.sourceUri) { player.replace({ uri: track.sourceUri }); loadedUri.current = track.sourceUri; }
    player.volume = Math.min(1, track.volume);
  }, [track?.sourceUri, track?.volume, missing, player]);

  useEffect(() => {
    if (!track || loadedUri.current === null) return;
    const t = songTimeAt(track, playhead);
    if (t === null || !isPlaying) { if (player.playing) player.pause(); if (t !== null && !isPlaying) player.seekTo(t, 0, 0).catch(() => {}); return; }
    // Only re-seek once drift exceeds this tolerance: expo-audio's own clock advances in small
    // steps against the store's playhead, so re-seeking on every tick would cause audible stutter.
    if (Math.abs(player.currentTime - t) > DRIFT_TOLERANCE) player.seekTo(t, 0, 0).catch(() => {});
    if (!player.playing) player.play();
  }, [track, playhead, isPlaying, player]);

  // useAudioPlayer releases the native player in its own unmount cleanup, which runs before
  // this one; pausing a released player throws, so swallow it (release already stopped audio).
  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);
  return null;
}
