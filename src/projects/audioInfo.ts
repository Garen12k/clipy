import { createAudioPlayer } from "expo-audio";

/** Duration of an audio file in seconds, read by loading it into a throwaway expo-audio player. */
export function audioDuration(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer({ uri });
    const timeout = setTimeout(() => { sub.remove(); player.release(); reject(new Error("Couldn't read the audio file")); }, 8000);
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.isLoaded && s.duration > 0) { clearTimeout(timeout); sub.remove(); player.release(); resolve(s.duration); }
    });
  });
}
