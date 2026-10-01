import { useAudioPlayer } from "expo-audio";
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
  const player = useAudioPlayer(null);
  const loadedUri = useRef<string | null>(null);

  useEffect(() => {
    if (!track || missing.includes(track.sourceUri)) { player.pause(); loadedUri.current = null; return; }
    if (loadedUri.current !== track.sourceUri) { player.replace({ uri: track.sourceUri }); loadedUri.current = track.sourceUri; }
    player.volume = Math.min(1, track.volume);
  }, [track?.sourceUri, track?.volume, missing, player]);

  useEffect(() => {
    if (!track || loadedUri.current === null) return;
    const t = songTimeAt(track, playhead);
    if (t === null || !isPlaying) { if (player.playing) player.pause(); if (t !== null && !isPlaying) player.seekTo(t); return; }
    if (Math.abs(player.currentTime - t) > DRIFT_TOLERANCE) player.seekTo(t);
    if (!player.playing) player.play();
  }, [track, playhead, isPlaying, player]);

  useEffect(() => () => player.pause(), [player]);
  return null;
}
