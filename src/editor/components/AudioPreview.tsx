import { useAudioPlayer } from "expo-audio";
import { useEffect, useMemo, useRef } from "react";
import { restorePlaybackAudioMode } from "@/src/editor/audioMode";
import { restGain, trackGainAt } from "@/src/editor/model/audioMix";
import { songTimeAt } from "@/src/editor/model/audioSync";
import type { AudioTrack, Project } from "@/src/editor/model/types";
import { PREVIEW_VOLUME_CAP, shouldWriteVolume } from "@/src/editor/previewVolume";
import { useEditorStore } from "@/src/editor/store";

const DRIFT_TOLERANCE = 0.25; // seconds before we re-seek the song while playing

/**
 * Invisible: one audio track's player, kept in sync with the store's playhead. Its volume is the track's gain at the
 * playhead (volume × fades × ducking, from audioMix.ts), capped at 1, and 0 while a voice-over is being recorded.
 */
function TrackPlayer({ project, track }: { project: Project; track: AudioTrack }) {
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const recording = useEditorStore((s) => s.recording);
  const isMissing = useEditorStore((s) => s.missingSourceUris.includes(track.sourceUri));
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const loadedUri = useRef<string | null>(null);
  // The volume last written to the player (null: none since the file was loaded), so a write that would change nothing is skipped.
  const appliedVolume = useRef<number | null>(null);
  // play() has been called for the playhead's current stay inside the track (cleared by pause / leaving the track): play() is
  // called once per entry, and the native `player.playing` is never read on a playhead tick.
  const started = useRef(false);
  // Where the paused player was last seeked to (null: it has played, or the file changed, since), so that an edit which leaves
  // the target where it is — every frame of a volume or fade drag replaces `track` — does not seek again.
  const lastSeek = useRef<number | null>(null);

  // Load (or swap) the file. A missing file is never loaded: the player stays paused and the effects below do nothing.
  useEffect(() => {
    if (isMissing) { player.pause(); loadedUri.current = null; appliedVolume.current = null; started.current = false; lastSeek.current = null; return; }
    if (loadedUri.current !== track.sourceUri) {
      player.replace({ uri: track.sourceUri });
      loadedUri.current = track.sourceUri; appliedVolume.current = null; started.current = false; lastSeek.current = null;
    }
  }, [track.sourceUri, isMissing, player]);

  // Volume. Declared before the sync effect so that, on the tick playback enters the track, the fade's volume is written
  // before play(). Outside the track the player is paused (nothing is heard), and it rests at the track's own volume — what
  // an un-faded track is at everywhere, so such a track is written once and never again.
  // This effect also re-runs for edits that have nothing to do with audio (every frame of a gesture replaces `project`):
  // it writes only when the value moved (see shouldWriteVolume), never seeks, and sets no state.
  useEffect(() => {
    if (loadedUri.current === null) return;
    const inside = songTimeAt(track, playhead) !== null;
    const gain = inside ? trackGainAt(project, track, playhead) : restGain(track);
    const volume = recording ? 0 : Math.min(PREVIEW_VOLUME_CAP, gain);
    if (!shouldWriteVolume(appliedVolume.current, volume)) return;
    // The playhead has just left the track and the sync effect below is about to pause the player: leave the volume
    // where the fade-out put it (raising it now would be heard for an instant). It settles on a later run, while paused.
    if (!inside && started.current) return;
    player.volume = volume;
    appliedVolume.current = volume;
  }, [project, track, playhead, recording, isMissing, player]);

  useEffect(() => {
    if (loadedUri.current === null) return;
    const t = songTimeAt(track, playhead);
    if (t === null || !isPlaying) {
      if (started.current) { player.pause(); started.current = false; }
      // Paused inside the track: park the player at the playhead, once per target.
      if (t !== null && lastSeek.current !== t) { lastSeek.current = t; player.seekTo(t, 0, 0).catch(() => {}); }
      return;
    }
    if (!started.current) {
      // About to start: always seek. A player that played to its end stays there, and for a short sound that is inside the
      // drift tolerance of anywhere in it — without this seek it would be silent the second time round.
      player.seekTo(t, 0, 0).catch(() => {});
      player.play();
      started.current = true;
      lastSeek.current = null;
      return;
    }
    // Already playing: only re-seek once drift exceeds the tolerance. expo-audio's own clock advances in small
    // steps against the store's playhead, so re-seeking on every tick would cause audible stutter.
    if (Math.abs(player.currentTime - t) > DRIFT_TOLERANCE) player.seekTo(t, 0, 0).catch(() => {});
  }, [track, playhead, isPlaying, isMissing, player]);

  // useAudioPlayer releases the native player in its own unmount cleanup, which runs before
  // this one; pausing a released player throws, so swallow it (release already stopped audio).
  // The same happens when this track is removed from the project.
  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);
  return null;
}

/** Invisible component: plays the project's audio tracks, one player per track, in sync with the store's playhead. */
export function AudioPreview() {
  const project = useEditorStore((s) => s.project);
  const missing = useEditorStore((s) => s.missingSourceUris);
  // What is heard: a track whose file is missing plays nothing, so it must not duck the music either. The same project object
  // when nothing is missing, and one stable object per (project, missing) otherwise.
  const heard = useMemo(() => {
    if (!project || !project.audioTracks.some((t) => missing.includes(t.sourceUri))) return project;
    return { ...project, audioTracks: project.audioTracks.filter((t) => !missing.includes(t.sourceUri)) };
  }, [project, missing]);

  // The editor's playback mode (see audioMode.ts), set once; a voice-over recording changes it and puts it back.
  useEffect(() => { void restorePlaybackAudioMode(); }, []);

  if (!project || !heard) return null;
  return <>{project.audioTracks.map((track) => <TrackPlayer key={track.id} project={heard} track={track} />)}</>;
}
