import { addAudioTrack, deleteAudioTrack, setTrackSound } from "./ops";
import { AUDIO_LIMITS, isTextOverlay, type AudioTrack, type Project } from "./types";

/**
 * Read aloud: what is read, how fast, where the spoken file lives and how its bar is placed. TypeScript only — the native side
 * receives a text, a voice id and a rate, and writes one file. Nothing here is stored in the project but an ordinary audio track.
 */
export const SPEECH_LIMITS = { maxChars: 1000, titleChars: 24, pace: [0, 1] as const, defaultPace: 0.5, rate: [0.35, 0.65] as const };

type Range = readonly [number, number];
const within = (point: number, ranges: readonly Range[]): boolean => ranges.some(([lo, hi]) => point >= lo && point <= hi);
/** Code points the system would read by name (emoji, pictographs, arrows, shapes): a gap in what is read. */
const NOT_READ: readonly Range[] = [
  [0x1f000, 0x1faff], [0x2600, 0x27bf], [0x2b00, 0x2bff], [0x2300, 0x23ff],   // emoji and pictographs, symbols and dingbats
  [0x2190, 0x21ff], [0x25a0, 0x25ff],                                         // arrows, geometric shapes
];
/** Code points that only dress or glue an emoji (variation selectors, the keycap, tags), and halves of a broken pair: left out, no gap. */
const DROPPED: readonly Range[] = [[0xfe00, 0xfe0f], [0x20e3, 0x20e3], [0xe0020, 0xe007f], [0xd800, 0xdfff]];
/** The zero-width joiner: glue inside an emoji, but part of the word between two letters (Arabic, Persian, the Indic scripts). */
const JOINER = 0x200d;
/** White space and the marks nobody hears (direction marks, zero-width spaces, the soft hyphen): a text of only these has nothing to read. */
const UNHEARD = /[\s­؜​-‏‪-‮⁠-⁤⁦-⁩]/g;

/**
 * The text as it is spoken: no emoji, single spaces, trimmed. Empty = nothing to read. Every script passes through as written,
 * its marks and direction marks included: only the ranges above are taken out. (Code-point ranges: no `\p{…}` on purpose.)
 */
export function speakableText(text: string): string {
  const s = typeof text === "string" ? text : "";
  const points: number[] = [];
  for (let i = 0; i < s.length;) {
    const point = s.codePointAt(i) ?? 0;
    points.push(point);
    i += point > 0xffff ? 2 : 1;
  }
  const kept = (point: number | undefined): boolean =>
    point !== undefined && point !== JOINER && !within(point, NOT_READ) && !within(point, DROPPED) && !/\s/.test(String.fromCodePoint(point));
  let out = "";
  points.forEach((point, i) => {
    if (within(point, NOT_READ)) out += " ";
    else if (within(point, DROPPED)) return;
    else if (point === JOINER) { if (kept(points[i - 1]) && kept(points[i + 1])) out += String.fromCodePoint(point); }
    else out += String.fromCodePoint(point);
  });
  const spoken = out.replace(/\s+/g, " ").trim();
  return spoken.replace(UNHEARD, "").length === 0 ? "" : spoken;
}

const unit = (v: number): number => Math.min(1, Math.max(0, v));
/** The rate sent to the native side for a pace 0 … 1: 0.5 is the system's normal pace (the native side maps it around Apple's default). */
export function speechRate(pace: number): number {
  const p = Number.isFinite(pace) ? unit(pace) : SPEECH_LIMITS.defaultPace;
  return Math.round((SPEECH_LIMITS.rate[0] + (SPEECH_LIMITS.rate[1] - SPEECH_LIMITS.rate[0]) * p) * 1000) / 1000;
}
export const paceLabel = (pace: number): string => (pace < 0.45 ? "Slower" : pace > 0.55 ? "Faster" : "Normal");

/** An id as part of a file name: letters, digits and "-" as they are, anything else as `_<its code>_` — so two ids never give one name. */
const namePart = (s: string): string => String(s).replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
const prefixOf = (overlayId: string): string => `speech-${namePart(overlayId)}-`;
const SPEECH_EXT = ".caf";
/** The file one reading of a text is written to (in the project's media folder): the text's id, then a new id per reading. */
export const speechFileName = (overlayId: string, stamp: string): string => `${prefixOf(overlayId)}${namePart(stamp)}${SPEECH_EXT}`;
/**
 * The audio tracks that were read from this text: recognised by their file's name, so nothing extra is stored. Where one text's id
 * begins another's ("o1", "o1-b"), a file belongs to the text with the longer name — a reading never takes another text's bar.
 */
export function speechTracksOf(p: Project, overlayId: string): AudioTrack[] {
  const prefix = prefixOf(overlayId);
  const longer = p.overlays.map((o) => prefixOf(o.id)).filter((other) => other.length > prefix.length && other.startsWith(prefix));
  return p.audioTracks.filter((t) => {
    const name = t.sourceUri.split("/").pop() ?? "";
    return name.startsWith(prefix) && name.endsWith(SPEECH_EXT) && !longer.some((other) => name.startsWith(other));
  });
}

const textOf = (p: Project, overlayId: string): string | null => {
  const o = p.overlays.find((x) => x.id === overlayId);
  return o && isTextOverlay(o) && o.kind === "text" ? o.text : null;
};
/** Why this text cannot be read aloud: it is not a text (gone, a caption, a sticker), has nothing to read, is too long, or the project has every track it may have and no earlier reading to replace. */
export type SpeechRefusal = "notText" | "noText" | "tooLong" | "limit";
export function speechRefusal(p: Project, overlayId: string): SpeechRefusal | null {
  const raw = textOf(p, overlayId);
  if (raw === null) return "notText";
  const spoken = speakableText(raw);
  if (spoken.length === 0) return "noText";
  if (spoken.length > SPEECH_LIMITS.maxChars) return "tooLong";
  if (speechTracksOf(p, overlayId).length === 0 && p.audioTracks.length >= AUDIO_LIMITS.maxTracks) return "limit";
  return null;
}

/** The first words of what is read, as the bar's title: whole characters only (never half of a pair), no space at the end. */
const titleOf = (spoken: string): string => Array.from(spoken).slice(0, SPEECH_LIMITS.titleChars).join("").trim();

/**
 * Puts a finished reading on the audio row: ONE voice track for the text. A first reading starts where the text starts. A later one
 * replaces every bar read from the same text and sits where the earliest of them started, with that bar's volume, fades and sound
 * setting (trims start afresh: the new speech has its own length). Same project when the text cannot be read (`speechRefusal`: gone,
 * not a text, nothing to read, too long, no room), the length is not a positive number, or the track cannot be added
 * (`addAudioTrack`, which also cleans it). One project out = one undo step.
 */
export function placeSpeech(p: Project, overlayId: string, made: { id: string; sourceUri: string; seconds: number }): Project {
  const overlay = p.overlays.find((x) => x.id === overlayId);
  if (!overlay || !isTextOverlay(overlay) || speechRefusal(p, overlayId) !== null || !Number.isFinite(made.seconds) || made.seconds <= 0) return p;
  const old = speechTracksOf(p, overlayId);
  const first = old.length > 0 ? old.reduce((a, b) => (b.start < a.start ? b : a)) : null;
  let cleared = p;
  for (const t of old) cleared = deleteAudioTrack(cleared, t.id);
  const track: AudioTrack = {
    id: made.id, sourceUri: made.sourceUri, title: titleOf(speakableText(overlay.text)), sourceDuration: made.seconds,
    start: first ? first.start : overlay.start, trimStart: 0, trimEnd: made.seconds, volume: first ? first.volume : 1, kind: "voice",
    fadeIn: first ? first.fadeIn : 0, fadeOut: first ? first.fadeOut : 0,
  };
  const next = addAudioTrack(cleared, track);
  if (next === cleared) return p;
  return first?.sound ? setTrackSound(next, made.id, first.sound) : next;
}

/** One installed voice as the native side lists it. `quality`: Apple's raw value (1 default, 2 enhanced, 3 premium). */
export interface VoiceRow { id: string; name: string; language: string; languageName: string; quality: number }
/** "en" of "en-US": what two codes of one language share. */
const baseOf = (code: string): string => code.split(/[-_]/)[0].toLowerCase();
/** The languages that have a voice: the phone's own first, then the others of the same language ("en-GB" for an "en-US" phone), the rest by name. */
export function languagesOf(voices: readonly VoiceRow[], current: string): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const v of voices) if (!seen.has(v.language)) seen.set(v.language, v.languageName);
  const rank = (code: string): number => (code === current ? 0 : baseOf(code) === baseOf(current) ? 1 : 2);
  return Array.from(seen, ([code, name]) => ({ code, name }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}
/** The voices of one language: best quality first, then by name. */
export function voicesOf(voices: readonly VoiceRow[], language: string): VoiceRow[] {
  return voices.filter((v) => v.language === language).sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name));
}
const QUALITY: Record<number, string> = { 2: "Enhanced", 3: "Premium" };
export const voiceLabel = (v: VoiceRow): string => (QUALITY[v.quality] ? `${v.name} · ${QUALITY[v.quality]}` : v.name);
/** The voice to start with: the remembered one if it is still installed, else the best of the phone's language, else of a language with the same base ("en"), else the first voice shown. */
export function pickVoice(voices: readonly VoiceRow[], current: string, wantedId: string | null): VoiceRow | null {
  const wanted = voices.find((v) => v.id === wantedId);
  if (wanted) return wanted;
  const first = languagesOf(voices, current)[0];   // the phone's own, else one of the same base, else the first by name
  return first ? voicesOf(voices, first.code)[0] ?? null : null;
}
