import { useAudioPlayer } from "expo-audio";
import { useEffect, useMemo, useRef } from "react";
import { restorePlaybackAudioMode } from "@/src/editor/audioMode";
import { restGain, trackGainAt } from "@/src/editor/model/audioMix";
import { audioSyncStep, trackPhaseAt, type RolledFor } from "@/src/editor/model/audioSync";
import type { AudioTrack, Project } from "@/src/editor/model/types";
import { PREVIEW_VOLUME_CAP, shouldWriteVolume } from "@/src/editor/previewVolume";
import { playUri, useSoundFiles } from "@/src/editor/soundFiles";
import { useEditorStore } from "@/src/editor/store";

const DRIFT_TOLERANCE = 0.25; // seconds before we re-seek the song while playing

/**
 * Invisible: one audio track's player, kept in sync with the store's playhead. Its volume is the track's gain at the
 * playhead (volume × fades × ducking, from audioMix.ts), capped at 1, and 0 while a voice-over is being recorded.
 * A track that begins during playback is started a moment early, silent (the gain before a track's start is 0), so that it is
 * already moving when the playhead reaches it: see `audioSyncStep`, which takes every decision about play / pause / seek here.
 */
function TrackPlayer({ project, track }: { project: Project; track: AudioTrack }) {
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const recording = useEditorStore((s) => s.recording);
  const isMissing = useEditorStore((s) => s.missingSourceUris.includes(track.sourceUri));
  // The file to play: the track's changed copy once it is rendered (Voice / Sound), otherwise its own file — and its own file while
  // a Strength / Pitch slider of THIS track is held, so a drag across a setting that already has a copy does not swap files back and
  // forth (a drag on another track changes nothing here).
  // A string, so this re-renders only when the file really changes. A track without a setting: always `track.sourceUri`.
  const uri = useSoundFiles((s) => (s.holdTrack === track.id ? track.sourceUri : playUri(s.files, track)));
  const player = useAudioPlayer(null, { keepAudioSessionActive: true });
  const loadedUri = useRef<string | null>(null);
  // The volume last written to the player (null: none since the file was loaded), so a write that would change nothing is skipped.
  const appliedVolume = useRef<number | null>(null);
  // play() has been called for the playhead's current stay inside the track (cleared by pause / leaving the track): play() is
  // called once per entry, and the native `player.playing` is never read on a playhead tick.
  const started = useRef(false);
  // play() has been called early, before the track's start (the one remembered here), and the player is silently on its way to it.
  // Cleared when the playhead gets there (it is `started` then, with no second play()) or when that start is not coming after all.
  const rolling = useRef<RolledFor | null>(null);
  // Where the paused player was last seeked to (null: it has played, or the file changed, since), so that an edit which leaves
  // the target where it is — every frame of a volume or fade drag replaces `track` — does not seek again.
  const lastSeek = useRef<number | null>(null);

  // Load (or swap) the file. A missing file is never loaded: the player stays paused and the effects below do nothing.
  useEffect(() => {
    if (isMissing) { player.pause(); loadedUri.current = null; appliedVolume.current = null; started.current = false; rolling.current = null; lastSeek.current = null; return; }
    if (loadedUri.current !== uri) {
      // Another file takes the place of one that is playing (or rolling silently towards its start): pause first. expo-audio starts
      // a player again by itself when the new item is ready if it was PLAYING at the replace (AudioPlayer.swift,
      // replaceCurrentSource) — even if the editor was paused in between, and nothing here would ever pause it then. Paused, it
      // stays paused; the sync effect below starts it again if the editor plays. A player this component has not started is not
      // playing: its swap, and the first load of every track, are exactly the calls they always were.
      if (loadedUri.current !== null && (started.current || rolling.current !== null)) player.pause();
      player.replace({ uri });
      loadedUri.current = uri; appliedVolume.current = null; started.current = false; rolling.current = null; lastSeek.current = null;
    }
  }, [uri, isMissing, player]);

  // Volume. Declared before the sync effect so that, on the tick playback enters the track, the fade's volume is written
  // before play(). Outside the track the player is paused (nothing is heard), and it rests at the track's own volume — what
  // an un-faded track is at everywhere, so such a track is written once and never again. In the lead before the track's start
  // (while playing) the volume is the track's gain there — `trackGainAt` is 0 before the start — so the early start below is
  // silent: 0 is written before that play(), and the sound becomes audible on the tick the playhead reaches the start.
  // This effect also re-runs for edits that have nothing to do with audio (every frame of a gesture replaces `project`):
  // it writes only when the value moved (see shouldWriteVolume), never seeks, and sets no state.
  // `uri` is listed for a copy that becomes ready (or goes): the file was just swapped above, so its volume is written again here.
  // For a track without a setting `uri` is `track.sourceUri`, which only changes together with `track`: no run is added.
  useEffect(() => {
    if (loadedUri.current === null) return;
    const phase = trackPhaseAt(track, playhead, isPlaying);
    const gain = phase === "outside" ? restGain(track) : trackGainAt(project, track, playhead);
    const volume = recording ? 0 : Math.min(PREVIEW_VOLUME_CAP, gain);
    if (!shouldWriteVolume(appliedVolume.current, volume)) return;
    // The playhead has just left the track and the sync effect below is about to pause the player: leave the volume
    // where the fade-out put it (raising it now would be heard for an instant). It settles on a later run, while paused.
    if (phase === "outside" && started.current) return;
    // The same for a player that is rolling silently towards a start that is not coming after all (the sync effect is about to
    // pause it): it stays silent while it still moves. A rolling player that simply reaches its start is not paused: written.
    if (rolling.current && audioSyncStep(track, playhead, isPlaying, { started: started.current, rolling: rolling.current }).pause) return;
    player.volume = volume;
    appliedVolume.current = volume;
  }, [project, track, uri, playhead, isPlaying, recording, isMissing, player]);

  // Play / pause / seek: the decision is `audioSyncStep`; here it is carried out, each native call at most once per decision.
  // No timer and nothing asynchronous starts the player, so nothing can reach it after it has been released (the seek's promise
  // is caught); this runs only on a playhead tick or an edit, while the component is mounted.
  // `uri` is listed so that a swapped file is put in its place in the same pass as the swap: the load effect above has cleared
  // `started` / `lastSeek`, so this is an ordinary start (seek to the playhead's place in the file, then play) or an ordinary park.
  // The copy has the timing of the original, so the source times are right for both files.
  useEffect(() => {
    if (loadedUri.current === null) return;
    const step = audioSyncStep(track, playhead, isPlaying, { started: started.current, rolling: rolling.current });
    if (step.pause) player.pause();
    started.current = step.next.started;
    rolling.current = step.next.rolling;
    if (step.start !== null) {
      // About to start: always seek. A player that played to its end stays there, and for a short sound that is inside the
      // drift tolerance of anywhere in it — without this seek it would be silent the second time round.
      player.seekTo(step.start, 0, 0).catch(() => {});
      player.play();
      lastSeek.current = null;
      return;
    }
    // Paused inside the track: park the player at the playhead, once per target.
    if (step.park !== null) {
      if (lastSeek.current !== step.park) { lastSeek.current = step.park; player.seekTo(step.park, 0, 0).catch(() => {}); }
      return;
    }
    // Already playing: only re-seek once drift exceeds the tolerance. expo-audio's own clock advances in small
    // steps against the store's playhead, so re-seeking on every tick would cause audible stutter.
    if (step.drift !== null && Math.abs(player.currentTime - step.drift) > DRIFT_TOLERANCE) player.seekTo(step.drift, 0, 0).catch(() => {});
  }, [track, uri, playhead, isPlaying, isMissing, player]);

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
