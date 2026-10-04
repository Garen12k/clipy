import { setAudioModeAsync, type AudioMode } from "expo-audio";

/**
 * The editor's normal audio session: mix with the video's own session instead of taking exclusive focus or deactivating the
 * shared session when a player pauses (which would either pause expo-video's playback or silence it mid-scene).
 * `allowsRecording` is left out on purpose: the native default is false, so applying this mode also turns recording off.
 */
export const PLAYBACK_AUDIO_MODE: Partial<AudioMode> = { interruptionMode: "mixWithOthers", playsInSilentMode: true };
/** The same session with the microphone allowed, for the length of a voice-over recording. */
export const RECORDING_AUDIO_MODE: Partial<AudioMode> = { ...PLAYBACK_AUDIO_MODE, allowsRecording: true };

/** Puts the session back to the playback mode. Never throws: it runs on error and unmount paths. */
export async function restorePlaybackAudioMode(): Promise<void> {
  try { await setAudioModeAsync(PLAYBACK_AUDIO_MODE); } catch { /* nothing more can be done */ }
}
