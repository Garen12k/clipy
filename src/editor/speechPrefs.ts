import "expo-sqlite/localStorage/install";
import { SPEECH_LIMITS } from "./model/speech";

/** Where the last Read aloud voice and speed are kept, in the same synchronous localStorage as `src/auth/welcomeSeen.ts`. A preference of this phone, not project data. Nothing outside this file reads or writes it. */
export const SPEECH_PREFS_KEY = "clipy.readAloud.v1";
/** `voiceId` null = no voice chosen yet (or none remembered): the picker starts on the best voice of the phone's language (`pickVoice`, which also takes over when the remembered voice is no longer installed). */
export interface SpeechPrefs { voiceId: string | null; pace: number }
const NONE: SpeechPrefs = { voiceId: null, pace: SPEECH_LIMITS.defaultPace };

/** The remembered voice and pace; nothing stored, junk, or storage that fails → no voice yet and the normal pace. */
export function loadSpeechPrefs(): SpeechPrefs {
  try {
    const raw = localStorage.getItem(SPEECH_PREFS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { ...NONE };
    const { voiceId, pace } = v as { voiceId?: unknown; pace?: unknown };
    if (typeof voiceId !== "string" && voiceId !== null) return { ...NONE };
    if (typeof pace !== "number" || !Number.isFinite(pace)) return { ...NONE };
    return { voiceId: voiceId ?? null, pace: Math.min(SPEECH_LIMITS.pace[1], Math.max(SPEECH_LIMITS.pace[0], pace)) };
  } catch { return { ...NONE }; }
}
export function saveSpeechPrefs(prefs: SpeechPrefs): void {
  try { localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ voiceId: prefs.voiceId, pace: prefs.pace })); } catch { /* not stored: the next opening starts from the defaults */ }
}
