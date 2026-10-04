import { normaliseTransitions } from "./ops";
import {
  AUDIO_KINDS, AUDIO_LIMITS, captionLength, clampBeatMarkers, clampFade, clampAdjust, clampCaptionWords, clampClipAnimation, clampClipKeyframes, clampCrop, clampNum, clampOverlayAnimation, clampOverlayKeyframes, clampSpeedCurve, clampTextStyle, clampTransform, CLIP_KINDS, DEFAULT_TRANSFORM, EFFECT_IDS, FONT_IDS, EFFECT_LIMITS, FILTER_IDS, FULL_CROP, isHexColor, PHOTO, POST_PLATFORMS, SCHEMA_VERSION, SHAPE_IDS, SPEED_LIMITS, TRANSITION_TYPES,
  type AudioKind, type AudioTrack, type Clip, type ClipAdjust, type ClipBackground, type ClipKind, type ClipTransform, type CropRect, type EffectItem, type Overlay, type PostRecord, type Project, type ShapeId,
} from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
type Raw = Record<string, unknown> & { clips: unknown[] };

function v1to2(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...raw, clips, overlays: [], audioTracks: [], schemaVersion: 2 };
}

const isKnownShape = (s: unknown) => (SHAPE_IDS as readonly string[]).includes(s as string);

/** A sticker needs a known shape or a non-empty emoji; an unknown shape falls back to the emoji, else the sticker is dropped. */
function normaliseSticker(o: Record<string, unknown>): Overlay | null {
  const emoji = typeof o.emoji === "string" && o.emoji.length > 0 ? o.emoji : null;
  const shape = isKnownShape(o.shape) ? (o.shape as ShapeId) : null;
  if (!emoji && !shape) return null;
  return { ...o, emoji, shape } as unknown as Overlay;
}

/** Animation + keyframes repaired; captions are forced to none (they are generated, never animated). */
function withMotion(o: Record<string, unknown>): Overlay {
  if (o.kind === "caption") return { ...o, animation: clampOverlayAnimation(undefined), keyframes: [] } as unknown as Overlay;
  return { ...o, animation: clampOverlayAnimation(o.animation), keyframes: clampOverlayKeyframes(o.keyframes) } as unknown as Overlay;
}

/** Text style repaired for text and captions; words and highlight only survive on captions (words only while they still match the text). Stickers untouched. */
function withTextStyle(o: Overlay): Overlay {
  if (o.kind === "sticker") return o;
  const style = clampTextStyle((o as unknown as Record<string, unknown>).style);
  const fontId = (FONT_IDS as readonly unknown[]).includes((o as unknown as Record<string, unknown>).fontId) ? o.fontId : "montserrat";
  if (o.kind !== "caption") return { ...o, fontId, style, words: [], highlightColor: null };
  const text = typeof o.text === "string" ? o.text : "";
  const start = typeof o.start === "number" ? o.start : 0, end = typeof o.end === "number" ? o.end : 0;
  return { ...o, fontId, style, words: clampCaptionWords(o.words, text, captionLength(start, end)), highlightColor: isHexColor(o.highlightColor) ? o.highlightColor : null };
}

/**
 * Brings a v2–v10 file to a safe v10 shape. Idempotent, so it runs on EVERY load: unknown speed → 1, unknown filter →
 * null, unknown transition → dissolve (duration kept), transitions re-capped (last clip cleared), overlays get a kind, bad stickers fixed/dropped,
 * clips get kind/transform/crop/background/reversed defaults or repairs, photos forced to the photo rules, look fields (strength, adjust) clamped, effects repaired,
 * speed curves repaired (a curve forces speed 1; photos never have one), audio tracks get a known kind and clamped fades (at most maxTracks kept), clips get clamped fades (photos 0),
 * ducking is a boolean and beat markers are sorted, spaced and capped.
 */
function normaliseCurrent(raw: Raw): Raw {
  const mapped = (raw.clips as Clip[]).map((c) => {
    const kind: ClipKind = (CLIP_KINDS as readonly string[]).includes(c.kind as string) ? c.kind : "video";
    const speedCurve = clampSpeedCurve(c.speedCurve, { kind });
    const speed = !speedCurve && typeof c.speed === "number" && c.speed >= SPEED_LIMITS[0] && c.speed <= SPEED_LIMITS[1] ? c.speed : 1;
    const filter = (FILTER_IDS as readonly string[]).includes(c.filter as string) && c.filter !== "none" ? c.filter : null;
    const t = c.transitionOut;
    const tDur = t && typeof t.duration === "number" && Number.isFinite(t.duration) && t.duration > 0 ? t.duration : 0;
    const known = t && (TRANSITION_TYPES as readonly string[]).includes(t.type);
    const transitionOut = tDur > 0 && typeof t?.type === "string" && t.type !== "none" ? { type: known ? t.type : ("dissolve" as const), duration: tDur } : { type: "none" as const, duration: 0 };
    const transform = clampTransform(isObj(c.transform) ? (c.transform as ClipTransform) : DEFAULT_TRANSFORM);
    const crop = clampCrop(isObj(c.crop) ? (c.crop as CropRect) : FULL_CROP);
    const bg = c.background as Record<string, unknown> | undefined;
    const background: ClipBackground = isObj(bg) && bg.type === "blur" ? { type: "blur" }
      : isObj(bg) && bg.type === "color" && isHexColor(bg.color) ? { type: "color", color: bg.color }
      : { type: "black" };
    const reversed = c.reversed === true;
    const filterIntensity = typeof c.filterIntensity === "number" && Number.isFinite(c.filterIntensity) ? clampNum(c.filterIntensity, 0, 1) : 1;
    const adjust = clampAdjust(isObj(c.adjust) ? (c.adjust as Partial<ClipAdjust>) : undefined);
    const animation = clampClipAnimation(c.animation);
    const keyframes = clampClipKeyframes(c.keyframes);
    const base = { ...c, speed, filter, transitionOut, kind, transform, crop, background, reversed, filterIntensity, adjust, animation, keyframes, speedCurve, fadeIn: clampFade(c.fadeIn), fadeOut: clampFade(c.fadeOut) } as Clip;
    if (kind !== "photo") return base;
    const trimEnd = clampNum(typeof c.trimEnd === "number" && Number.isFinite(c.trimEnd) ? c.trimEnd : PHOTO.defaultSeconds, PHOTO.minSeconds, PHOTO.maxSeconds);
    return { ...base, fadeIn: 0, fadeOut: 0, speed: 1, muted: true, reversed: false, trimStart: 0, sourceDuration: PHOTO.maxSeconds, trimEnd };
  });
  const clips = normaliseTransitions(mapped);
  const overlays = ((raw.overlays as Array<Record<string, unknown>> | undefined) ?? []).flatMap((o): Overlay[] => {
    if (!o.kind) return [withTextStyle(withMotion({ ...o, kind: "text" as const }))];
    if (o.kind === "sticker") { const s = normaliseSticker(o); return s ? [withMotion(s as unknown as Record<string, unknown>)] : []; }
    return [withTextStyle(withMotion(o))];
  });
  const posts = (Array.isArray(raw.posts) ? raw.posts : []).filter((r): r is PostRecord =>
    isObj(r) && (POST_PLATFORMS as readonly unknown[]).includes(r.platform) && (typeof r.url === "string" || r.url === null) && typeof r.postedAt === "string");
  const effects = (Array.isArray(raw.effects) ? raw.effects : []).flatMap((e): EffectItem[] => {
    if (!isObj(e) || typeof e.id !== "string" || !(EFFECT_IDS as readonly unknown[]).includes(e.type)) return [];
    const start = typeof e.start === "number" && Number.isFinite(e.start) ? Math.max(0, e.start) : 0;
    const end = typeof e.end === "number" && Number.isFinite(e.end) ? e.end : start + EFFECT_LIMITS.defaultDuration;
    const intensity = typeof e.intensity === "number" && Number.isFinite(e.intensity) ? clampNum(e.intensity, 0, 1) : EFFECT_LIMITS.defaultIntensity;
    return [{ id: e.id, type: e.type as EffectItem["type"], start, end: Math.max(end, start + EFFECT_LIMITS.minDuration), intensity }];
  });
  const audioTracks = (Array.isArray(raw.audioTracks) ? raw.audioTracks : []).filter((a): a is Record<string, unknown> => isObj(a) && !Array.isArray(a)).slice(0, AUDIO_LIMITS.maxTracks).map((a): AudioTrack => ({
    ...(a as unknown as AudioTrack),
    kind: (AUDIO_KINDS as readonly unknown[]).includes(a.kind) ? (a.kind as AudioKind) : "music",
    fadeIn: clampFade(a.fadeIn), fadeOut: clampFade(a.fadeOut),
  }));
  return { ...raw, clips, overlays, effects, audioTracks, posts, ducking: raw.ducking === true, beatMarkers: clampBeatMarkers(raw.beatMarkers), schemaVersion: SCHEMA_VERSION };
}

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  let cur = raw as Raw;
  if (version === 1) cur = v1to2(cur);
  // v2 → v10 and the sanity pass are the same idempotent step, so corrupted files of any supported version load safely too.
  return normaliseCurrent(cur) as unknown as Project;
}
