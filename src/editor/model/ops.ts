import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration, clipStartTimes, curveSteps, findItem, hasSpeedCurve, isSlowed, isSmoothCurve, layerEnd, smoothCurveSteps, sourceAfter, sourceTimeAt, spanTooShort, splitSourceRanges } from "./timeline";
import { fitScale } from "./clipLayout";
import { clipBaseAt, overlayBaseAt, sampleKeyframes } from "./motion";
import {
  ANIM_COMBO_IDS, ANIM_LOOP_IDS, AUDIO_KINDS, AUDIO_LIMITS, BEAT_LIMITS, BLEND_IDS, captionLength, clampAdjust, clampAnimEdge, clampCaptionWords, clampChroma, clampClipAnimation, clampClipKeyframes, clampCover, clampCrop, clampFade, clampOverlayAnimation, clampOverlayKeyframes, clampSpeedCurve, clampTextStyle, clampTransform,
  clampEffectRect, clampOpacity, CLIP_VOLUME, DEFAULT_ADJUST, DEFAULT_TRANSFORM, EFFECT_END_SLACK, EFFECT_LIMITS, frameAspect, isAspectRatio, isHexColor, isRegionEffect, isSamePinTime, KEYFRAME_LIMITS, makeEffect, activePhotoMotion, isPhoto, isSticker, isTextOverlay, makeOverlay, makeSticker,
  LAYER_LIMITS, MASK_IDS, MIN_CLIP_SECONDS, minAudioDuration, newLayer, newPhotoClip, normaliseRotation, OVERLAY_LIMITS, PHOTO, SPEED_CURVE_IDS, SPEED_LIMITS, STABILIZE_IDS, TRANSITION_LIMITS,
  clampPhotoMotion, clampSound, COMBO_AS_MOTION, NO_SOUND, type PhotoMotion, type SoundSettings, type AnimEdge, type AspectRatio, type AudioTrack, type BlendId, type ChromaKey, type Clip, type ClipAdjust, type ClipAnimation, type ClipBackground, type ClipTransform, type Cover, type CropRect, type EffectId, type EffectItem,
  type EffectRect, type FilterId,
  type Keyframe, type LayerClip, type MaskId, type Overlay, type OverlayAnimation, type Project, type SpeedCurve, type SpeedCurveId, type StabilizeId, type StickerOverlay, type TextOverlay, type TextStyle, type TransitionType,
} from "./types";
import { totalDuration } from "./timeline";
import type { Template } from "../templates";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES, type CaptionPresetId, type TextTemplateId } from "../textTemplates";

/**
 * Drops effects left at or past the end of a project `total` seconds long (within EFFECT_END_SLACK of it: they cannot be reached on
 * the timeline); those still starting inside are untouched. Same array when nothing is dropped.
 */
export function fitEffects(effects: EffectItem[], total: number): EffectItem[] {
  const limit = total - EFFECT_END_SLACK;
  return effects.some((e) => e.start >= limit) ? effects.filter((e) => e.start < limit) : effects;
}

function touch(p: Project, patch: Partial<Project>): Project {
  const next = { ...p, ...patch, updatedAt: nowIso() };
  // Only a change to the clips can shorten the project.
  if (patch.clips) next.effects = fitEffects(next.effects, totalDuration(next));
  return next;
}

export function addClips(p: Project, clips: Clip[]): Project {
  if (clips.length === 0) return p;
  return touch(p, { clips: [...p.clips, ...clips] });
}

export function splitClipAt(p: Project, outputTime: number): Project {
  const hit = clipAt(p, outputTime);
  if (!hit) return p;
  const { clip, index, offsetInClip } = hit;
  const d = clipDuration(clip);
  const min = isPhoto(clip) ? PHOTO.minSeconds : MIN_CLIP_SECONDS;
  if (offsetInClip < min || d - offsetInClip < min) return p;
  // Motion: the left half keeps In, the right half keeps Out, a Combo stays on both; every pin stays on both (pins are in source time).
  // Sound: the left half keeps the fade in, the right half the fade out.
  const a = clip.animation;
  const leftMotion = { animation: { in: copyEdge(a.in), out: null, combo: a.combo }, keyframes: copyPins(clip.keyframes), fadeOut: 0 };
  const rightMotion = { animation: { in: null, out: copyEdge(a.out), combo: a.combo }, keyframes: copyPins(clip.keyframes), fadeIn: 0 };
  if (isPhoto(clip)) {
    const cut = offsetInClip;   // photos run at speed 1 from 0
    const left: Clip = { ...clip, trimEnd: cut, transitionOut: NO_TRANSITION, ...leftMotion };
    // The right half restarts at 0, so its pins move back by the cut; those before it become one pin holding the value at the cut.
    const head = sampleKeyframes(clip.keyframes, cut);
    const keyframes = head ? rebasePins(clip.keyframes, cut, () => head, clampClipKeyframes) : [];
    const right: Clip = { ...clip, id: newId(), trimStart: 0, trimEnd: clip.trimEnd - cut, adjust: { ...clip.adjust }, chroma: copyChroma(clip.chroma), ...rightMotion, keyframes };
    return touch(p, { clips: normaliseTransitions([...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)]) });
  }
  const { left: l, right: r } = splitSourceRanges(clip, offsetInClip);
  // A speed curve is in absolute source time: each half keeps the whole curve (its own copy) and plays the part its trim covers.
  const left: Clip = { ...clip, trimStart: l[0], trimEnd: l[1], transitionOut: NO_TRANSITION, ...leftMotion, speedCurve: copyCurve(clip.speedCurve) };
  const right: Clip = { ...clip, id: newId(), trimStart: r[0], trimEnd: r[1], adjust: { ...clip.adjust }, chroma: copyChroma(clip.chroma), ...rightMotion, speedCurve: copyCurve(clip.speedCurve) };
  return touch(p, { clips: normaliseTransitions([...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)]) });
}

/**
 * Pins moved `by` seconds earlier. Those that land before 0 are replaced by ONE pin at t = 0 holding `head(thosePins)`; the rest are
 * kept. The result goes through the sanity rule (`clampPins`), so it is sorted, spaced and reloads unchanged.
 */
function rebasePins(pins: Keyframe[], by: number, head: (before: Keyframe[]) => Omit<Keyframe, "t">, clampPins: (k: unknown) => Keyframe[]): Keyframe[] {
  const shifted = pins.map((k) => ({ ...k, t: k.t - by }));
  const before = shifted.filter((k) => k.t < 0);
  if (before.length === 0) return clampPins(shifted);
  return clampPins([{ ...head(before), t: 0 }, ...shifted.filter((k) => k.t >= 0)]);
}

const copyEdge = (e: AnimEdge | null): AnimEdge | null => (e ? { ...e } : null);
const copyPins = (k: Keyframe[]): Keyframe[] => k.map((e) => ({ ...e }));
const copyChroma = (k: ChromaKey | null): ChromaKey | null => (k ? { ...k } : null);
const copyCurve = (v: SpeedCurve | null): SpeedCurve | null => (v ? { id: v.id, steps: v.steps.map((s) => ({ ...s })) } : null);
const copyClipAnimation = (a: ClipAnimation): ClipAnimation => ({ in: copyEdge(a.in), out: copyEdge(a.out), combo: a.combo });
const copyOverlayAnimation = (a: OverlayAnimation): OverlayAnimation => ({ in: copyEdge(a.in), out: copyEdge(a.out), loop: a.loop });

export function trimClip(p: Project, clipId: string, trimStart: number, trimEnd: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
  if (isPhoto(c)) {
    const len = Math.max(PHOTO.minSeconds, Math.min(trimEnd, PHOTO.maxSeconds));
    if (c.trimStart === 0 && c.trimEnd === len) return p;
    const clips = p.clips.slice();
    clips[i] = { ...c, trimStart: 0, trimEnd: len };
    return touch(p, { clips: normaliseTransitions(clips) });
  }
  const start = Math.max(0, Math.min(trimStart, c.sourceDuration));
  const end = Math.max(0, Math.min(trimEnd, c.sourceDuration));
  if (spanTooShort(c, start, end, MIN_CLIP_SECONDS)) return p;   // a speed curve keeps its steps: they are absolute source times
  if (start === c.trimStart && end === c.trimEnd) return p;
  const clips = p.clips.slice();
  clips[i] = { ...c, trimStart: start, trimEnd: end };
  return touch(p, { clips: normaliseTransitions(clips) });
}

export function moveClip(p: Project, clipId: string, toIndex: number): Project {
  const from = p.clips.findIndex((c) => c.id === clipId);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(toIndex, p.clips.length - 1));
  if (to === from) return p;
  const clips = p.clips.slice();
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return touch(p, { clips: normaliseTransitions(clips) });
}

export function deleteClip(p: Project, clipId: string): Project {
  if (!p.clips.some((c) => c.id === clipId)) return deleteLayer(p, clipId);   // a layer's id: the layer goes
  return touch(p, { clips: normaliseTransitions(p.clips.filter((c) => c.id !== clipId)) });
}

const copyOfClip = (src: Clip): Clip => ({ ...src, id: newId(), transitionOut: NO_TRANSITION, transform: { ...src.transform }, crop: { ...src.crop }, background: { ...src.background }, adjust: { ...src.adjust },
  animation: copyClipAnimation(src.animation), keyframes: copyPins(src.keyframes), speedCurve: copyCurve(src.speedCurve), chroma: copyChroma(src.chroma) });

export function duplicateClip(p: Project, clipId: string): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return duplicateLayer(p, clipId);   // a layer's id: the layer is copied
  return touch(p, { clips: [...p.clips.slice(0, i + 1), copyOfClip(p.clips[i]), ...p.clips.slice(i + 1)] });
}

/** The ids that are MAIN clips (layers and unknown ids are left out), in timeline order, once each. */
export function mainClipIds(p: Project, ids: readonly string[]): string[] {
  const want = new Set(ids);
  return p.clips.filter((c) => want.has(c.id)).map((c) => c.id);
}

/** One single-clip op run on every given main clip. One project comes out, so one `apply` is one undo step; the same project when nothing changes. */
export function forClips(p: Project, ids: readonly string[], op: (p: Project, id: string) => Project): Project {
  const out = mainClipIds(p, ids).reduce(op, p);
  // Each step refit the effects against its own intermediate length, so the order of the clips would decide which effects survive.
  // Refit once, from the original effects, against the final length.
  if (out.clips === p.clips) return out;
  const effects = fitEffects(p.effects, totalDuration(out));
  return effects === out.effects ? out : { ...out, effects };
}

/** Multi-select Delete. Deleting every clip is allowed, as `deleteClip` allows it. */
export function deleteClips(p: Project, ids: readonly string[]): Project {
  const gone = new Set(mainClipIds(p, ids));
  if (gone.size === 0) return p;
  return touch(p, { clips: normaliseTransitions(p.clips.filter((c) => !gone.has(c.id))) });
}

/** Multi-select Duplicate: each copy right after its original (the copy `duplicateClip` makes). */
export function duplicateClips(p: Project, ids: readonly string[]): Project {
  const want = new Set(mainClipIds(p, ids));
  if (want.size === 0) return p;
  return touch(p, { clips: p.clips.flatMap((c) => (want.has(c.id) ? [c, copyOfClip(c)] : [c])) });
}

/** The cover (through `clampCover` against the project's length) or null for none. Same project when nothing changes or the time is not finite. */
export function setCover(p: Project, cover: Cover | null): Project {
  if (cover === null) return p.cover === null ? p : touch(p, { cover: null });
  const next = clampCover(cover, totalDuration(p));
  if (!next) return p;
  return p.cover && p.cover.time === next.time && p.cover.title === next.title ? p : touch(p, { cover: next });
}

/** Same project when it already has the ratio or the id is unknown. Overlay positions are fractions of the frame and stay as they are. */
export function setAspectRatio(p: Project, ratio: AspectRatio): Project {
  return p.aspectRatio === ratio || !isAspectRatio(ratio) ? p : touch(p, { aspectRatio: ratio });
}

export function renameProject(p: Project, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed || trimmed === p.name) return p;
  return touch(p, { name: trimmed });
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function defaultOverlayRange(p: Project, playhead: number): { start: number; end: number } {
  const total = totalDuration(p);
  let start = Math.max(0, Math.min(playhead, total));
  let end = Math.min(start + 3, total);
  if (end - start < OVERLAY_LIMITS.minDuration) { start = Math.max(0, total - 3); end = total; }
  return { start: r3(start), end: r3(end) };
}

export function addTextOverlay(p: Project, o: TextOverlay): Project {
  return touch(p, { overlays: [...p.overlays, o] });
}

type SharedPatch = Partial<Pick<Overlay, "x" | "y" | "scale" | "rotation" | "start" | "end">>;

function normaliseOverlay<O extends Overlay>(p: Project, o: O): O {
  const total = totalDuration(p);
  let end = Math.min(o.end, total);
  let start = Math.max(0, Math.min(o.start, end));
  if (end - start < OVERLAY_LIMITS.minDuration) {
    if (start + OVERLAY_LIMITS.minDuration <= total) end = start + OVERLAY_LIMITS.minDuration;
    else { end = total; start = Math.max(0, total - OVERLAY_LIMITS.minDuration); }
  }
  const shared = { x: clamp(o.x, [0, 1]), y: clamp(o.y, [0, 1]), scale: clamp(o.scale, OVERLAY_LIMITS.scale), start: r3(start), end: r3(end) };
  if (!isTextOverlay(o)) return { ...o, ...shared };
  const text = { ...o, ...shared, fontScale: clamp(o.fontScale, OVERLAY_LIMITS.fontScale) };
  // A caption's words are seconds from its start: a timing edit keeps them, clamped to the new length by the loader's own rule.
  return o.kind === "caption" && o.words.length > 0 ? { ...text, words: clampCaptionWords(o.words, o.text, captionLength(shared.start, shared.end)) } : text;
}

function replaceOverlay(p: Project, i: number, next: Overlay): Project {
  if (JSON.stringify(next) === JSON.stringify(p.overlays[i])) return p;
  const overlays = p.overlays.slice(); overlays[i] = next;
  return touch(p, { overlays });
}

export function updateOverlay(p: Project, id: string, patch: Partial<Omit<TextOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const cur = p.overlays[i];
  if (!isTextOverlay(cur)) return p;
  // Editing a caption's text clears its words (they no longer are that text); every other edit keeps them.
  const retyped = cur.kind === "caption" && patch.text !== undefined && patch.text !== cur.text && patch.words === undefined;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...cur, ...patch, ...(retyped ? { words: [] } : {}) }));
}

/** An overlay's start and pins when a start-handle drag began (see `updateOverlayShared`). */
export type OverlayTrimOrigin = Pick<Overlay, "start" | "keyframes">;

/**
 * A patch that names `start` trims the start: the pins (seconds from the start) are shifted by the same amount so they stay at the same
 * project time. The pins left before the new start become ONE pin at t = 0 holding the value that was showing there
 * (`sampleKeyframes`, as the photo split does); the result goes through the sanity rule (`clampOverlayKeyframes`), so what is stored
 * always reloads unchanged. `moveOverlay` moves the pins with the overlay instead.
 * A drag calls this once per frame on the already-changed project. Re-basing the re-based pins again and again would lose the pins
 * the handle passed (the curve between two pins cannot be rebuilt from a head pin), so a drag passes `from` — the overlay's start and
 * pins when it began — and every step is computed from that: any number of steps gives exactly the one-step result, and dragging back
 * brings the pins back. `from` is only read by a start trim.
 */
export function updateOverlayShared(p: Project, id: string, patch: SharedPatch, from?: OverlayTrimOrigin): Project {
  return patchOverlayShared(p, id, patch, patch.start !== undefined, from);
}

function patchOverlayShared(p: Project, id: string, patch: SharedPatch, shiftPins: boolean, from?: OverlayTrimOrigin): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const cur = p.overlays[i];
  let next = normaliseOverlay(p, { ...cur, ...patch } as Overlay);
  const origin = shiftPins && from ? from : cur;
  const by = next.start - origin.start;
  if (shiftPins && (by !== 0 || origin !== cur) && origin.keyframes.length > 0) {
    const head = sampleKeyframes(origin.keyframes, by);
    if (head) next = { ...next, keyframes: rebasePins(origin.keyframes, by, () => head, clampOverlayKeyframes) };
  }
  return replaceOverlay(p, i, next);
}

export function addSticker(p: Project, s: StickerOverlay): Project { return touch(p, { overlays: [...p.overlays, s] }); }

export function updateSticker(p: Project, id: string, patch: Partial<Omit<StickerOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const cur = p.overlays[i];
  if (!isSticker(cur)) return p;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...cur, ...patch }));
}

export function moveOverlay(p: Project, id: string, newStart: number): Project {
  const o = p.overlays.find((x) => x.id === id);
  if (!o) return p;
  const d = o.end - o.start;
  const start = Math.max(0, Math.min(newStart, totalDuration(p) - d));
  return patchOverlayShared(p, id, { start, end: start + d }, false);   // pins are relative to the start: they move with the overlay
}

export function deleteOverlay(p: Project, id: string): Project {
  if (!p.overlays.some((o) => o.id === id)) return p;
  return touch(p, { overlays: p.overlays.filter((o) => o.id !== id) });
}

/**
 * The project without the text `id` when that text is empty (nothing but white space); the same project otherwise. Captions and
 * stickers are never dropped. For the save when the editor is left while that text is being edited (see `useLoadProject`).
 */
export function dropEmptyText(p: Project, id: string | null): Project {
  const o = p.overlays.find((x) => x.id === id);
  return o && o.kind === "text" && o.text.trim().length === 0 ? deleteOverlay(p, o.id) : p;
}

/** How far (fraction of the frame, right and down) a duplicated text / sticker sits from its original. */
const DUPLICATE_OFFSET = 0.03;

export function duplicateOverlay(p: Project, id: string): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const src = p.overlays[i];
  // The pins get the same offset (through the sanity rule, so clamped): a keyframed copy must not land exactly on the original.
  const keyframes = clampOverlayKeyframes(src.keyframes.map((k) => ({ ...k, x: k.x + DUPLICATE_OFFSET, y: k.y + DUPLICATE_OFFSET })));
  const own = isTextOverlay(src) ? { style: clampTextStyle(src.style), words: src.words.map((w) => ({ ...w })) } : {};   // the copy's own objects
  const copy = normaliseOverlay(p, { ...src, id: newId(), x: src.x + DUPLICATE_OFFSET, y: src.y + DUPLICATE_OFFSET,
    animation: copyOverlayAnimation(src.animation), keyframes, ...own } as Overlay);
  return touch(p, { overlays: [...p.overlays.slice(0, i + 1), copy, ...p.overlays.slice(i + 1)] });
}

// ---- Audio: tracks, clip fades, ducking, beat markers ----
// Audio tracks and beat markers sit in project time and are never moved or dropped by clip edits (same rule as overlays); a track may
// run past the project's end.

type AudioPatch = Partial<Omit<AudioTrack, "id" | "sourceUri" | "sourceDuration">>;
const AUDIO_NUMBER_KEYS = ["start", "trimStart", "trimEnd", "volume", "fadeIn", "fadeOut"] as const;

/**
 * A track as it is stored: trim clamped to the source and kept at least the kind's minimum long (the end yields first, then the
 * start), start ≥ 0, volume and fades clamped, an unknown kind → "music". The fades are stored as given — fitting them to the track's
 * length is `audioMix`'s job.
 */
function cleanAudioTrack(t: AudioTrack): AudioTrack {
  const kind = (AUDIO_KINDS as readonly unknown[]).includes(t.kind) ? t.kind : "music";
  const min = minAudioDuration(kind);
  let trimEnd = Math.min(t.trimEnd, t.sourceDuration);
  let trimStart = Math.max(0, Math.min(t.trimStart, trimEnd));
  if (trimEnd - trimStart < min) {
    if (trimStart + min <= t.sourceDuration) trimEnd = trimStart + min;
    else { trimEnd = t.sourceDuration; trimStart = Math.max(0, trimEnd - min); }
  }
  return { ...t, kind, trimStart: r3(trimStart), trimEnd: r3(trimEnd), start: r3(Math.max(0, t.start)),
    volume: clamp(t.volume, AUDIO_LIMITS.volume), fadeIn: r2(clampFade(t.fadeIn)), fadeOut: r2(clampFade(t.fadeOut)) };
}

/**
 * The track at index `i` with the patch written and cleaned (`cleanAudioTrack`). The fades are kept as the user set them however
 * short the track is trimmed (this runs on every frame of a trim drag: shrinking them here would lose them for good) — `audioMix`
 * fits them to the length. A key set to `undefined` is ignored (it would wipe the stored value). Same project when nothing
 * changes or a patched number is not finite.
 */
function patchAudioTrack(p: Project, i: number, patch: AudioPatch): Project {
  const t = p.audioTracks[i];
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as AudioPatch;
  if (AUDIO_NUMBER_KEYS.some((k) => defined[k] !== undefined && !Number.isFinite(defined[k]))) return p;
  const next = cleanAudioTrack({ ...t, ...defined });
  if (sameJson(next, t)) return p;
  const audioTracks = p.audioTracks.slice(); audioTracks[i] = next;
  return touch(p, { audioTracks });
}

/**
 * Adds a track (music, voice-over or sound effect), cleaned (`cleanAudioTrack`). Refused (same project) at AUDIO_LIMITS.maxTracks, when
 * the id is already there, or when its start, trims, volume or source length is not a finite number.
 */
export function addAudioTrack(p: Project, track: AudioTrack): Project {
  if (p.audioTracks.length >= AUDIO_LIMITS.maxTracks || p.audioTracks.some((t) => t.id === track.id)) return p;
  if (![track.start, track.trimStart, track.trimEnd, track.volume, track.sourceDuration].every(Number.isFinite)) return p;
  return touch(p, { audioTracks: [...p.audioTracks, cleanAudioTrack(track)] });
}

/** See `patchAudioTrack` for the rules. Unknown id → same project. */
export function updateAudioTrackById(p: Project, id: string, patch: Partial<Pick<AudioTrack, "start" | "trimStart" | "trimEnd" | "volume" | "fadeIn" | "fadeOut">>): Project {
  const i = p.audioTracks.findIndex((t) => t.id === id);
  return i < 0 ? p : patchAudioTrack(p, i, patch);
}

/** The bar drag: only the start moves (never below 0; the track may run past the project's end). */
export function moveAudioTrack(p: Project, id: string, newStart: number): Project {
  return updateAudioTrackById(p, id, { start: newStart });
}

export function deleteAudioTrack(p: Project, id: string): Project {
  if (!p.audioTracks.some((t) => t.id === id)) return p;
  return touch(p, { audioTracks: p.audioTracks.filter((t) => t.id !== id) });
}

/** The copy (new id) starts where the original ends and sits right after it in the list. Refused at AUDIO_LIMITS.maxTracks. */
export function duplicateAudioTrack(p: Project, id: string): Project {
  const i = p.audioTracks.findIndex((t) => t.id === id);
  if (i < 0 || p.audioTracks.length >= AUDIO_LIMITS.maxTracks) return p;
  const src = p.audioTracks[i];
  const copy: AudioTrack = { ...src, id: newId(), start: r3(src.start + (src.trimEnd - src.trimStart)) };
  return touch(p, { audioTracks: [...p.audioTracks.slice(0, i + 1), copy, ...p.audioTracks.slice(i + 1)] });
}

/**
 * The two pieces the track `id` is cut into at project `time`, or null where it cannot be cut: no such track, a time that is not
 * finite, or a piece shorter than the kind's minimum (`minAudioDuration`) — so never at or outside the track's ends.
 * A track plays 1:1, so the cut in source time is `trimStart + (time − start)`, rounded like every stored trim (3 decimals). Both
 * pieces go through `cleanAudioTrack` and must come out meeting at that cut: the first ends there, the second starts there (source
 * time) and at the first one's end (project time, 3 decimals). The first piece keeps the fade in, the second the fade out, stored as
 * they were however short the piece is: `audioMix` fits them to its length. `second.id` is still the track's own.
 */
function audioSplitPieces(p: Project, id: string | null, time: number): { index: number; first: AudioTrack; second: AudioTrack } | null {
  if (id === null || !Number.isFinite(time)) return null;
  const index = p.audioTracks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const t = cleanAudioTrack(p.audioTracks[index]);
  const cut = r3(t.trimStart + (time - t.start));
  const min = minAudioDuration(t.kind) - 1e-9;
  if (!Number.isFinite(cut) || cut - t.trimStart < min || t.trimEnd - cut < min) return null;
  const first = cleanAudioTrack({ ...t, trimEnd: cut, fadeOut: 0 });
  const second = cleanAudioTrack({ ...t, start: t.start + (cut - t.trimStart), trimStart: cut, fadeIn: 0 });
  // The cleaning must not have moved the cut (it keeps the minimum length by moving a trim).
  if (first.trimStart !== t.trimStart || first.trimEnd !== cut || second.trimStart !== cut || second.trimEnd !== t.trimEnd) return null;
  return { index, first, second };
}

/** Whether the track `id` can be cut at project `time` (the rules of `splitAudioTrackAt`, the track limit aside). False for no id. */
export function canSplitAudioAt(p: Project, id: string | null, time: number): boolean {
  return audioSplitPieces(p, id, time) !== null;
}

/**
 * Cuts the track `id` in two at project `time` (see `audioSplitPieces`): the first piece keeps the id, the second gets `pieceId` and
 * sits right after it in the list. Refused (same project) where `canSplitAudioAt` is false, at AUDIO_LIMITS.maxTracks, and when
 * `pieceId` is already a track's id.
 */
export function splitAudioTrackAt(p: Project, id: string, time: number, pieceId: string): Project {
  if (p.audioTracks.length >= AUDIO_LIMITS.maxTracks || p.audioTracks.some((t) => t.id === pieceId)) return p;
  const cut = audioSplitPieces(p, id, time);
  if (!cut) return p;
  return touch(p, { audioTracks: [...p.audioTracks.slice(0, cut.index), cut.first, { ...cut.second, id: pieceId }, ...p.audioTracks.slice(cut.index + 1)] });
}

/**
 * Changes how the track `id` sounds (the Voice and Sound tools): the patch is merged into its setting — or into none — and clamped
 * (`clampSound`). A setting that changes nothing REMOVES the key: a track as recorded has no `sound`. Same project for an unknown
 * track and when nothing changes. Nothing is rendered here; the editor renders the copy the setting needs (soundRenders.ts).
 */
export function setTrackSound(p: Project, trackId: string, patch: Partial<SoundSettings>): Project {
  const i = p.audioTracks.findIndex((t) => t.id === trackId);
  if (i < 0) return p;
  const cur = p.audioTracks[i];
  const sound = clampSound({ ...(cur.sound ?? NO_SOUND), ...patch });
  if (sameJson(sound, cur.sound ?? null)) return p;
  const next: AudioTrack = { ...cur };
  delete next.sound;
  if (sound) next.sound = sound;
  const audioTracks = p.audioTracks.slice(); audioTracks[i] = next;
  return touch(p, { audioTracks });
}

/** The title of a bar made by Extract audio. */
export const EXTRACT_TITLE = "Clip sound";
/** Why a clip's sound cannot be put on the audio row: it has none (a photo, a reversed clip, no such clip), it is not at normal speed (a sound bar has no speed), or the project has every track it may have. */
export type ExtractRefusal = "noSound" | "speed" | "limit";
export function extractRefusal(p: Project, clipId: string): ExtractRefusal | null {
  const item = findItem(p, clipId);
  if (!item || isPhoto(item.clip) || item.clip.reversed) return "noSound";
  if (item.clip.speed !== 1 || hasSpeedCurve(item.clip)) return "speed";
  if (p.audioTracks.length >= AUDIO_LIMITS.maxTracks) return "limit";
  return null;
}
/**
 * How much (source seconds) a track and a clip must share to be the same sound. A track's trims are stored to the millisecond and a
 * clip's are not (a split cuts anywhere), so the bar of one half of a split clip may reach up to half a millisecond into the other.
 */
const EXTRACT_OVERLAP = 0.001;
/** Where a clip (or a layer) starts on the timeline. */
const itemStart = (p: Project, item: NonNullable<ReturnType<typeof findItem>>): number =>
  item.layer ? (item.clip as LayerClip).start : clipStartTimes(p)[p.clips.findIndex((x) => x.id === item.clip.id)];
/**
 * The audio track that already holds this clip's sound: the clip is MUTED, and the track is on the clip's own file with a source
 * range that overlaps the clip's (by more than `EXTRACT_OVERLAP`). Null when there is none. A clip that is not muted still has its
 * sound in it, whatever bars are on its file — a duplicate of an extracted clip's original, or a clip un-muted again — so it is
 * never "already" there. Of several such bars (two copies of one clip, both extracted) the one that lines up with the clip on the
 * timeline is the clip's own; the first on a tie.
 */
export function extractedTrackOf(p: Project, clipId: string): AudioTrack | null {
  const item = findItem(p, clipId);
  if (!item || isPhoto(item.clip) || !item.clip.muted) return null;
  const c = item.clip;
  const on = p.audioTracks.filter((t) => t.sourceUri === c.sourceUri && Math.min(t.trimEnd, c.trimEnd) - Math.max(t.trimStart, c.trimStart) > EXTRACT_OVERLAP);
  if (on.length < 2) return on[0] ?? null;
  // Lined up: the same source second is heard at the same project second.
  const origin = itemStart(p, item) - c.trimStart;
  const off = (t: AudioTrack) => Math.abs(t.start - t.trimStart - origin);
  return on.reduce((best, t) => (off(t) < off(best) ? t : best));
}
/**
 * Extract audio: the clip's (or layer's) own sound becomes an audio track `trackId` — a sound effect (the one kind that neither ducks
 * the music nor is ducked, so the mix stays what it was) on the clip's OWN file, at the clip's place on the timeline, with its source
 * range, volume and fades — and the clip is muted. One project out: one undo step. Refused (same project) where `extractRefusal`
 * says so, when the sound is already on the audio row (`extractedTrackOf`) and when `trackId` is taken.
 */
export function extractClipAudio(p: Project, clipId: string, trackId: string): Project {
  if (extractRefusal(p, clipId) !== null || extractedTrackOf(p, clipId) !== null) return p;
  const item = findItem(p, clipId);
  if (!item) return p;
  const c = item.clip;
  const start = itemStart(p, item);
  const added = addAudioTrack(p, { id: trackId, sourceUri: c.sourceUri, title: EXTRACT_TITLE, sourceDuration: c.sourceDuration, start, trimStart: c.trimStart, trimEnd: c.trimEnd,
    volume: c.volume, kind: "sfx", fadeIn: c.fadeIn, fadeOut: c.fadeOut });
  if (added === p) return p;
  return setClipMuted(added, clipId, true);   // an already muted clip: unchanged, and `added` is still one project out
}

/**
 * Fade in / out of a video clip's own sound, in seconds of output time, clamped to AUDIO_LIMITS.fade (stored as given: `audioMix` fits
 * them to the clip's length). Photos are refused; a non-finite value leaves the project unchanged.
 */
export function setClipFade(p: Project, clipId: string, patch: { fadeIn?: number; fadeOut?: number }): Project {
  if ([patch.fadeIn, patch.fadeOut].some((v) => v !== undefined && !Number.isFinite(v))) return p;
  return updateClip(p, clipId, (c) => {
    if (isPhoto(c)) return c;
    const fadeIn = patch.fadeIn === undefined ? c.fadeIn : r2(clampFade(patch.fadeIn));
    const fadeOut = patch.fadeOut === undefined ? c.fadeOut : r2(clampFade(patch.fadeOut));
    return fadeIn === c.fadeIn && fadeOut === c.fadeOut ? c : { ...c, fadeIn, fadeOut };
  });
}

/** Auto ducking: music dips while a voice-over plays (the maths is in `audioMix`). */
export function setDucking(p: Project, on: boolean): Project {
  return p.ducking === on ? p : touch(p, { ducking: on });
}

/** How close (seconds) a time must be to a beat marker for `removeBeatMarkerNear` to take it. */
const BEAT_REMOVE_REACH = 0.25;

/**
 * A marker at `time` (clamped to the project, 3 decimals), kept sorted. Refused (same project) at BEAT_LIMITS.max, for a non-finite
 * time, on a project with no length (no clips), and closer than BEAT_LIMITS.minGap to an existing marker — the loader's own rule (`clampBeatMarkers`), so what is stored
 * reloads unchanged.
 */
export function addBeatMarker(p: Project, time: number): Project {
  const total = totalDuration(p);
  if (!Number.isFinite(time) || total <= 0 || p.beatMarkers.length >= BEAT_LIMITS.max) return p;
  const t = r3(clamp(time, [0, total]));
  if (p.beatMarkers.some((m) => Math.abs(m - t) < BEAT_LIMITS.minGap - 1e-9)) return p;
  const at = p.beatMarkers.findIndex((m) => m > t);
  return touch(p, { beatMarkers: at < 0 ? [...p.beatMarkers, t] : [...p.beatMarkers.slice(0, at), t, ...p.beatMarkers.slice(at)] });
}

/** Removes the marker nearest to `time` when it is within 0.25 s of it; otherwise the same project. */
export function removeBeatMarkerNear(p: Project, time: number): Project {
  if (!Number.isFinite(time)) return p;
  let best = -1;
  p.beatMarkers.forEach((m, i) => { if (best < 0 || Math.abs(m - time) < Math.abs(p.beatMarkers[best] - time)) best = i; });
  if (best < 0 || Math.abs(p.beatMarkers[best] - time) > BEAT_REMOVE_REACH + 1e-9) return p;
  return touch(p, { beatMarkers: p.beatMarkers.filter((_, i) => i !== best) });
}

export function clearBeatMarkers(p: Project): Project {
  return p.beatMarkers.length === 0 ? p : touch(p, { beatMarkers: [] });
}

export function setClipVolume(p: Project, clipId: string, volume: number): Project {
  const v = clamp(volume, CLIP_VOLUME);
  return updateClip(p, clipId, (c) => (isPhoto(c) || v === c.volume ? c : { ...c, volume: v }));
}

export function setClipMuted(p: Project, clipId: string, muted: boolean): Project {
  return updateClip(p, clipId, (c) => (isPhoto(c) || c.muted === muted ? c : { ...c, muted }));
}

const NO_TRANSITION = { type: "none" as const, duration: 0 };
/** 2 decimals; the `+ 0` turns a rounded −0 into 0, so a slider back at centre stores exactly 0. */
const r2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** Max transition duration for the cut after clip index `i` within `clips`; 0 when there's no next clip. */
function capFor(clips: Clip[], i: number): number {
  const a = clips[i], b = clips[i + 1];
  if (!a || !b) return 0;
  return Math.min(TRANSITION_LIMITS.max, r2(0.5 * Math.min(clipDuration(a), clipDuration(b))));
}

/** Max transition duration for the cut after clip `index`; 0 for the last clip. */
export function transitionCap(p: Project, index: number): number {
  return capFor(p.clips, index);
}

/** Clears the last clip's transition and re-caps every other one against its neighbour; returns the same array if nothing changes. */
export function normaliseTransitions(clips: Clip[]): Clip[] {
  let changed = false;
  const out = clips.map((c, i) => {
    const cap = capFor(clips, i);
    let t = c.transitionOut;
    if (t.type !== "none" && (i === clips.length - 1 || cap < TRANSITION_LIMITS.min)) t = NO_TRANSITION;
    else if (t.type !== "none" && t.duration > cap) t = { type: t.type, duration: cap };
    if (t !== c.transitionOut) { changed = true; return { ...c, transitionOut: t }; }
    return c;
  });
  return changed ? out : clips;
}

/** `speed` (2 decimals), lowered where needed so the clip's source span still plays for `min` seconds (MIN_CLIP_SECONDS; a layer's own minimum). */
function cappedSpeed(c: Clip, speed: number, min = MIN_CLIP_SECONDS): number {
  const maxForMin = (c.trimEnd - c.trimStart) / min;   // speed at which output hits the minimum
  // Round the cap DOWN so rounding never pushes output under 0.1 s; the 1e-9 absorbs float noise (0.3 / 0.1 = 2.9999…).
  return Math.min(r2(speed), Math.floor(maxForMin * 100 + 1e-9) / 100);
}

export function setClipSpeed(p: Project, clipId: string, speed: number): Project {
  if (!Number.isFinite(speed)) return p;
  return updateClip(p, clipId, (c) => {
    if (isPhoto(c)) return c;
    const s = cappedSpeed(c, clamp(speed, SPEED_LIMITS));
    return s === c.speed && c.speedCurve === null ? c : { ...c, speed: s, speedCurve: null };   // a constant speed and a curve are exclusive
  }, true);
}

/**
 * A preset writes its steps across the clip's current [trimStart, trimEnd] and sets `speed` to 1; `null` clears the curve (speed
 * stays 1). Same project when nothing changes (the same preset with the same steps, or clearing no curve). Refused: photos, an unknown
 * id, and a curve that would leave the clip shorter than MIN_CLIP_SECONDS. `smooth` writes the preset as a gradual ramp
 * (`smoothCurveSteps`, 32 steps) instead of eight steps; it needs a longer clip (32 steps of at least `minStep`).
 */
export function setClipSpeedCurve(p: Project, clipId: string, id: SpeedCurveId | null, smooth = false): Project {
  if (id !== null && !(SPEED_CURVE_IDS as readonly string[]).includes(id)) return p;
  const min = findItem(p, clipId)?.layer ? LAYER_LIMITS.minDuration : MIN_CLIP_SECONDS;
  return updateClip(p, clipId, (c) => {
    if (isPhoto(c)) return c;
    if (id === null) {
      if (c.speedCurve === null) return c;
      // "None" always works. A short piece of a slow part of the curve would be under the minimum (MIN_CLIP_SECONDS; a layer's is
      // LAYER_LIMITS.minDuration) at speed 1, so it gets the highest constant speed that keeps it (the cap `setClipSpeed` applies),
      // never under the slowest speed there is.
      return { ...c, speedCurve: null, speed: clamp(cappedSpeed(c, 1, min), SPEED_LIMITS) };
    }
    const speedCurve = presetCurve(c, id, c.trimStart, c.trimEnd, smooth);
    if (!speedCurve) return c;
    if (c.speed === 1 && sameJson(speedCurve, c.speedCurve)) return c;
    const next = { ...c, speed: 1, speedCurve };
    return clipDuration(next) < MIN_CLIP_SECONDS - 1e-9 ? c : next;
  }, true);
}

/**
 * The preset's steps across [trimStart, trimEnd] — eight, or 32 when `smooth` — through the sanity rule so what is stored reloads
 * unchanged. Null when the range is too short to hold every step (the sanity rule merges steps under `minStep`): a collapsed curve
 * is never stored.
 */
function presetCurve(c: Pick<Clip, "kind">, id: SpeedCurveId, trimStart: number, trimEnd: number, smooth = false): SpeedCurve | null {
  const steps = smooth ? smoothCurveSteps(id, trimStart, trimEnd) : curveSteps(id, trimStart, trimEnd);
  const curve = clampSpeedCurve({ id, steps }, c);
  return curve && curve.steps.length >= steps.length ? curve : null;
}

export function setClipFilter(p: Project, clipId: string, filter: FilterId | null): Project {
  const f = filter === "none" ? null : filter;
  return updateClip(p, clipId, (c) => (f === c.filter ? c : { ...c, filter: f }));
}

export function setClipFilterIntensity(p: Project, clipId: string, intensity: number): Project {
  if (!Number.isFinite(intensity)) return p;
  const v = r2(clamp(intensity, [0, 1]));
  return updateClip(p, clipId, (c) => (c.filterIntensity === v ? c : { ...c, filterIntensity: v }));
}

/** Sets the filter on every clip; `intensity` (when given) is copied too, otherwise each clip keeps its own strength. */
export function setFilterForAllClips(p: Project, filter: FilterId | null, intensity?: number): Project {
  const f = filter === "none" ? null : filter;
  const v = intensity === undefined ? undefined : clamp(intensity, [0, 1]);
  const same = (c: Clip) => c.filter === f && (v === undefined || c.filterIntensity === v);
  if (p.clips.every(same)) return p;
  return touch(p, { clips: p.clips.map((c) => (same(c) ? c : { ...c, filter: f, filterIntensity: v ?? c.filterIntensity })) });
}

export function setTransition(p: Project, clipId: string, t: { type: TransitionType; duration: number }): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || i === p.clips.length - 1) return p;
  let next: Clip["transitionOut"];
  if (t.type === "none") next = NO_TRANSITION;
  else {
    const cap = transitionCap(p, i);
    if (cap < TRANSITION_LIMITS.min) return p;
    next = { type: t.type, duration: r2(clamp(t.duration, [TRANSITION_LIMITS.min, cap])) };
  }
  const cur = p.clips[i].transitionOut;
  if (cur.type === next.type && cur.duration === next.duration) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], transitionOut: next };
  return touch(p, { clips });
}

/**
 * Swaps every caption for the new ones. The new captions take the look of the ones they replace (the first one's: captions are styled
 * together) — font, size, colour, background, outline, alignment, position, style and highlight, each its own copy — so re-running the
 * captions does not throw the chosen look away. Text, timing and words are the new captions' own.
 */
export function replaceCaptions(p: Project, captions: TextOverlay[]): Project {
  const kept = p.overlays.filter((o) => o.kind !== "caption");
  if (kept.length === p.overlays.length && captions.length === 0) return p;
  const look = p.overlays.find((o): o is TextOverlay => o.kind === "caption");
  const styled = (c: TextOverlay): TextOverlay => look ? { ...c, fontId: look.fontId, fontScale: look.fontScale, color: look.color,
    background: look.background ? { ...look.background } : null, outline: look.outline, align: look.align, x: look.x, y: look.y,
    style: clampTextStyle(look.style), highlightColor: look.highlightColor } : c;
  return touch(p, { overlays: [...kept, ...captions.map((c) => normaliseOverlay(p, styled(c)))] });
}
/**
 * One-tap look: speed + filter (+ transition on every cut but the last) for one clip or every clip, then a title and a sticker
 * over the first 3 s. Project scope also restyles captions and existing text overlays; a look knows nothing of text styles, so it puts
 * the outline colour of what it restyles back to automatic (an outline colour picked for the old text colour would clash with the new
 * one) and keeps the rest of the style. Built only from the ops above.
 */
export function applyTemplate(p: Project, t: Template, scope: "clip" | "project", clipId: string | null): Project {
  if (p.clips.length === 0) return p;
  const setsFilter = !!t.filter && t.filter !== "none";   // the none template leaves each clip's filter strength alone
  let next = p;
  if (scope === "clip") {
    if (!clipId || !p.clips.some((c) => c.id === clipId)) return p;
    next = setClipFilter(setClipSpeed(next, clipId, t.speed), clipId, t.filter);
    if (setsFilter) next = setClipFilterIntensity(next, clipId, 1);
    next = setTransition(next, clipId, t.transition);   // no-op on the last clip
  } else {
    for (const c of p.clips) {
      next = setClipFilter(setClipSpeed(next, c.id, t.speed), c.id, t.filter);
      if (setsFilter) next = setClipFilterIntensity(next, c.id, 1);
    }
    for (const c of next.clips.slice(0, -1)) next = setTransition(next, c.id, t.transition);
    const clips = normaliseTransitions(next.clips);
    if (clips !== next.clips) next = touch(next, { clips });
    next = setCaptionStyleForAll(next, { ...t.caption, style: { outlineColor: null } });
    for (const o of next.overlays) if (o.kind === "text") next = updateOverlay(next, o.id, { ...t.text, style: { ...o.style, outlineColor: null } });
  }
  const end = Math.min(3, totalDuration(next));   // unrounded: r3 could land a hair past a sped-up total
  if (end <= 0) return next;
  next = addTextOverlay(next, makeOverlay({ id: newId(), text: t.title.text, ...t.text, fontScale: t.title.fontScale, x: 0.5, y: t.title.y, start: 0, end }));
  return addSticker(next, makeSticker({ id: newId(), ...t.sticker, start: 0, end }));
}

export type CaptionStylePatch = Partial<Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y">>
  & { style?: Partial<TextStyle>; highlightColor?: string | null };

/**
 * A style patch as it is merged: keys set to `undefined` are left out (they would wipe the stored value), and numbers — the nested
 * shadow / glow ones too — are rounded to two decimals, the sliders' step, so a slider back at its centre stores exactly 0 or 1.
 */
function cleanStylePatch(patch: Partial<TextStyle>): Partial<TextStyle> {
  const round = (v: unknown): unknown => (typeof v === "number" ? r2(v) : v);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v).map(([n, x]) => [n, round(x)])) : round(v);
  }
  return out as Partial<TextStyle>;
}

/**
 * One change over every caption. `style` is merged into each caption's own style (see `cleanStylePatch`) and clamped; `highlightColor`
 * must be #RRGGBB (anything else → null, no word highlight). Text, timing and words are never touched. Same project when nothing changes.
 */
export function setCaptionStyleForAll(p: Project, patch: CaptionStylePatch): Project {
  const { style: stylePatch, highlightColor, ...fields } = patch;
  const style = stylePatch === undefined ? undefined : cleanStylePatch(stylePatch);
  let changed = false;
  const overlays = p.overlays.map((o) => {
    if (o.kind !== "caption") return o;
    const merged: TextOverlay = { ...o, ...fields };
    if (fields.background) merged.background = { ...fields.background };   // each caption owns its objects
    if (style !== undefined) merged.style = clampTextStyle({ ...o.style, ...style });
    if (highlightColor !== undefined) merged.highlightColor = isHexColor(highlightColor) ? highlightColor : null;
    const next = normaliseOverlay(p, merged);
    if (JSON.stringify(next) !== JSON.stringify(o)) { changed = true; return next; }
    return o;
  });
  return changed ? touch(p, { overlays }) : p;
}

/** The 1080-wide reference frame for the project's aspect ratio (what clipLayout works in). */
export function frameSize(p: Project): { width: number; height: number } {
  return { width: 1080, height: 1080 / frameAspect(p) };
}

/**
 * Replaces one clip OR layer with `fn(item)` — the one lookup every per-clip edit goes through: the id is looked for in the main clips,
 * then in the layers. Same project when the id is missing or `fn` returns the same object.
 * A main clip: `retime` (the edit changes the clip's length) re-normalises the transitions. A layer: only `layers` changes — `clips`
 * keeps its identity, so none of the main-track rules run (transitions, effects past the end); the layer keeps its start and has no
 * transition, and a change of its length or kind must keep the layer rules (`putLayer`) or the edit is refused.
 */
function updateClip(p: Project, clipId: string, fn: (c: Clip) => Clip, retime = false): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i >= 0) {
    const next = fn(p.clips[i]);
    if (next === p.clips[i]) return p;
    const clips = p.clips.slice(); clips[i] = next;
    return touch(p, { clips: retime ? normaliseTransitions(clips) : clips });
  }
  const j = p.layers.findIndex((l) => l.id === clipId);
  if (j < 0) return p;
  const cur = p.layers[j];
  const next = fn(cur);
  return next === cur ? p : putLayer(p, j, { ...next, start: cur.start, transitionOut: NO_TRANSITION });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function withTransform(c: Clip, t: ClipTransform): Clip {
  return sameJson(t, c.transform) ? c : { ...c, transform: t };
}

export function setClipTransform(p: Project, clipId: string, patch: Partial<ClipTransform>): Project {
  return updateClip(p, clipId, (c) => withTransform(c, clampTransform({ ...c.transform, ...patch })));
}

const hasPins = (p: Project, clipId: string): boolean => (findItem(p, clipId)?.clip.keyframes.length ?? 0) > 0;

/**
 * For a short time on 2026-10-06 a build shrank clips to show the whole picture whenever the frame shape changed; the user did not want
 * it and the build was withdrawn, but projects saved in that window kept the small clips. This puts those back to filling the frame
 * when such a project is opened: a main clip that is centred, has no keyframes and is smaller than Fill. (Not "exactly at its Fit
 * scale": after the build was withdrawn the frame shape could be changed again, which leaves the clip at the Fit scale of an EARLIER
 * frame.) Projects saved outside the window are left alone, so a Fit chosen in Transform stays. Layers are never touched.
 */
export const AUTO_FIT_WINDOW = { from: Date.parse("2026-10-06T06:00:00Z"), to: Date.parse("2026-10-06T09:00:00Z") };
export function undoAutoFit(p: Project): Project {
  const saved = Date.parse(p.updatedAt);
  if (!(saved >= AUTO_FIT_WINDOW.from && saved <= AUTO_FIT_WINDOW.to)) return p;
  let changed = false;
  const clips = p.clips.map((c) => {
    const t = c.transform;
    if (t.x !== 0 || t.y !== 0 || c.keyframes.length > 0 || t.scale >= 1) return c;
    changed = true;
    return { ...c, transform: { ...t, scale: 1 } };
  });
  return changed ? { ...p, clips } : p;
}

/**
 * Fit / Fill / Reset on a clip with keyframes write the pin at the playhead (`offsetInClip`); without an offset they do nothing —
 * the static values are hidden while pins exist and must never be edited silently. Without keyframes the offset is ignored.
 */
export function resetClipTransform(p: Project, clipId: string, offsetInClip?: number): Project {
  if (hasPins(p, clipId)) {
    return offsetInClip === undefined ? p : editClipTransformAt(p, clipId, offsetInClip, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  }
  return updateClip(p, clipId, (c) => withTransform(c, { ...DEFAULT_TRANSFORM }));
}

/** Adds 90° to the static rotation (wrapped) and to every pin (not wrapped: a pin may hold a full turn). */
export function rotateClip90(p: Project, clipId: string): Project {
  return updateClip(p, clipId, (c) => {
    const turned = withTransform(c, clampTransform({ ...c.transform, rotation: normaliseRotation(c.transform.rotation + 90) }));
    return c.keyframes.length === 0 ? turned : { ...turned, keyframes: c.keyframes.map((k) => ({ ...k, rotation: k.rotation + 90 })) };
  });
}

export function flipClip(p: Project, clipId: string, axis: "h" | "v"): Project {
  return updateClip(p, clipId, (c) => withTransform(c, axis === "h" ? { ...c.transform, flipH: !c.transform.flipH } : { ...c.transform, flipV: !c.transform.flipV }));
}

export function fitClip(p: Project, clipId: string, offsetInClip?: number): Project {
  const { width, height } = frameSize(p);
  if (hasPins(p, clipId)) {
    if (offsetInClip === undefined || !Number.isFinite(offsetInClip)) return p;
    const c = findItem(p, clipId)!.clip;
    const rotation = clipBaseAt(c, pinMoment(c, offsetInClip).offset).rotation;   // the rotation shown at the playhead
    return editClipTransformAt(p, clipId, offsetInClip, { scale: fitScale(c, c.crop, rotation, width, height), x: 0, y: 0 });
  }
  return updateClip(p, clipId, (c) =>
    withTransform(c, clampTransform({ ...c.transform, scale: fitScale(c, c.crop, c.transform.rotation, width, height), x: 0, y: 0 })));
}

export function fillClip(p: Project, clipId: string, offsetInClip?: number): Project {
  if (hasPins(p, clipId)) return offsetInClip === undefined ? p : editClipTransformAt(p, clipId, offsetInClip, { scale: 1, x: 0, y: 0 });
  return updateClip(p, clipId, (c) => withTransform(c, { ...c.transform, scale: 1, x: 0, y: 0 }));
}

export function setClipCrop(p: Project, clipId: string, crop: CropRect): Project {
  return updateClip(p, clipId, (c) => {
    const next = clampCrop(crop);
    return sameJson(next, c.crop) ? c : { ...c, crop: next };
  });
}

export function setClipBackground(p: Project, clipId: string, bg: ClipBackground): Project {
  if (!p.clips.some((c) => c.id === clipId)) return p;   // main track only: a layer has no background
  return updateClip(p, clipId, (c) => (sameJson(bg, c.background) ? c : { ...c, background: { ...bg } }));
}

export function setBackgroundForAllClips(p: Project, bg: ClipBackground): Project {
  if (p.clips.every((c) => sameJson(c.background, bg))) return p;
  return touch(p, { clips: p.clips.map((c) => (sameJson(c.background, bg) ? c : { ...c, background: { ...bg } })) });
}

/**
 * Swaps a clip's media and keeps its edits (id, filter, transform, crop, background, transition, blend, green screen, sound and its fades for videos).
 * The new clip keeps the old one's timeline length where the new media allows it. A video too short for a clip is refused.
 */
export function replaceClipMedia(p: Project, clipId: string, media: Pick<Clip, "sourceUri" | "sourceDuration" | "width" | "height" | "kind">): Project {
  return updateClip(p, clipId, (old) => replacedMedia(old, media), true);
}

/** `old` with the new media (see `replaceClipMedia`), or `old` itself when the swap is refused. */
function replacedMedia(old: Clip, media: Pick<Clip, "sourceUri" | "sourceDuration" | "width" | "height" | "kind">): Clip {
  const prevOut = clipDuration(old);
  // Pins sit on the old pictures (source time), so they go; the animation stays. The placement they showed at the clip's first frame
  // becomes the static transform (without pins it already is).
  const transform = old.keyframes.length > 0 ? transformAt(old, 0) : old.transform;
  const base: Clip = { ...old, sourceUri: media.sourceUri, width: media.width, height: media.height, kind: media.kind, trimStart: 0, transform, keyframes: [], chroma: copyChroma(old.chroma) };
  let next: Clip;
  if (media.kind === "photo") {
    next = { ...base, speed: 1, speedCurve: null, muted: true, reversed: false, fadeIn: 0, fadeOut: 0, sourceDuration: PHOTO.maxSeconds, trimEnd: clamp(prevOut, [PHOTO.minSeconds, PHOTO.maxSeconds]) };
  } else if (isPhoto(old)) {
    // A photo runs at speed 1, so its source length is its output length.
    next = { ...base, sourceDuration: media.sourceDuration, speed: 1, muted: false, reversed: false, trimEnd: Math.min(media.sourceDuration, prevOut) };
  } else {
    // Same speed (or the same curve, re-applied below), so the new clip takes the old clip's SOURCE span where the new media allows it.
    const trimEnd = Math.min(media.sourceDuration, old.trimEnd - old.trimStart);
    // A curve's steps sit on the old media's source times: the same preset is written again across the new range.
    const speedCurve = old.speedCurve ? presetCurve(base, old.speedCurve.id, 0, trimEnd, isSmoothCurve(old)) : null;
    next = { ...base, sourceDuration: media.sourceDuration, trimEnd, speedCurve };
  }
  if (next.kind !== "photo") delete next.motion;   // a Motion belongs to photos only; the key goes, it is never undefined
  return next.kind === "video" && clipDuration(next) < MIN_CLIP_SECONDS - 1e-9 ? old : next;
}

/** The clip's base placement at `offsetInClip` as a static transform: through `clampTransform`, flips kept, opacity dropped. */
function transformAt(c: Clip, offsetInClip: number): ClipTransform {
  const at = clipBaseAt(c, offsetInClip);
  return clampTransform({ ...c.transform, x: at.x, y: at.y, scale: at.scale, rotation: at.rotation });
}

export function setClipReversed(p: Project, clipId: string, reversed: boolean): Project {
  return updateClip(p, clipId, (c) => (isPhoto(c) || c.reversed === reversed ? c : { ...c, reversed }));
}

// ---- Layers (picture-in-picture), opacity and masks ----
// A layer is a clip with a `start` on the project timeline. It is edited by id through `updateClip` like a main clip; the ops below
// are the ones only a layer has. Layers sit in project time and are never moved or dropped by main-track edits (same rule as overlays
// and audio): one left past the project's end is kept and shows again if the project grows.

/**
 * How far (seconds) a layer's end may reach past another layer's start and still count as ending first. A copy starts where its
 * original ends and a head trim keeps the end, but `start + length` can land one float step past that time.
 */
const LAYER_TOUCH_EPSILON = 1e-6;

/**
 * The largest number of VIDEO layers on screen at once (photo layers are not counted; a layer ending where another starts — or within
 * LAYER_TOUCH_EPSILON after it — does not overlap it).
 */
export function videoLayerOverlap(layers: LayerClip[]): number {
  const edges: [number, number][] = [];
  for (const l of layers) if (!isPhoto(l)) edges.push([l.start, 1], [layerEnd(l) - LAYER_TOUCH_EPSILON, -1]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // at the same time the end comes first: touching is not overlapping
  let now = 0, most = 0;
  for (const [, step] of edges) { now += step; most = Math.max(most, now); }
  return most;
}

const overlapOk = (layers: LayerClip[]): boolean => videoLayerOverlap(layers) <= LAYER_LIMITS.maxVideoAtOnce;

/** The rules a layer list must keep after `layer` (one of its entries) was added or changed length: the minimum length and the overlap limit. */
function layersOk(layers: LayerClip[], layer: LayerClip): boolean {
  return clipDuration(layer) >= LAYER_LIMITS.minDuration - 1e-9 && overlapOk(layers);
}

/**
 * Writes `next` over the layer at index `j`. When its place in time or what counts for the overlap rule changed (start, length,
 * photo / video) the layer rules are re-checked and the edit is refused (same project) if they would break. Only `layers` changes.
 * `moved` (the edit only moves the layer): the minimum length is not re-checked — a short layer from an older file can still be moved.
 */
function putLayer(p: Project, j: number, next: LayerClip, moved = false): Project {
  const cur = p.layers[j];
  const layers = p.layers.slice(); layers[j] = next;
  const retimed = next.start !== cur.start || next.kind !== cur.kind || clipDuration(next) !== clipDuration(cur);
  if (retimed && !(moved ? overlapOk(layers) : layersOk(layers, next))) return p;
  return touch(p, { layers });
}

/**
 * Puts `clip` on top of the others as a layer starting at `start` (through `newLayer`: centred at the default scale, no transition).
 * Refused (same project): a project without main clips, LAYER_LIMITS.max layers already, an id a clip or layer already has, a
 * non-finite start, a layer shorter than the minimum, or a third video layer on screen at once.
 */
export function addLayer(p: Project, clip: Clip, start: number): Project {
  if (!Number.isFinite(start) || p.clips.length === 0 || p.layers.length >= LAYER_LIMITS.max || findItem(p, clip.id)) return p;
  const layer = newLayer(clip, start);
  const layers = [...p.layers, layer];
  return layersOk(layers, layer) ? touch(p, { layers }) : p;
}

/** The bar drag: only the start moves (never below 0, 3 decimals; the layer may run past the project's end). Refused where the overlap rule would break, so a drag stops at the last valid position. */
export function moveLayer(p: Project, id: string, newStart: number): Project {
  const j = p.layers.findIndex((l) => l.id === id);
  if (j < 0 || !Number.isFinite(newStart)) return p;
  const start = Math.max(0, r3(newStart));
  return start === p.layers[j].start ? p : putLayer(p, j, { ...p.layers[j], start }, true);
}

/**
 * A layer's source range, by `trimClip`'s rules (clamped to the source; a photo's length is `trimEnd` within the photo limits) with
 * the layer minimum. `anchor` says which end of the bar stays put: "end" (the tail handle moved) keeps `start`; "start" (the head
 * handle moved) keeps the layer's END at the same project time — `start = old end − new length`, and where that would be before 0 the
 * trim is shortened at its head so the layer starts at 0. Refused (same project): unknown id, non-finite input, too short, or the
 * overlap rule would break.
 */
export function trimLayer(p: Project, id: string, trimStart: number, trimEnd: number, anchor: "start" | "end"): Project {
  const j = p.layers.findIndex((l) => l.id === id);
  if (j < 0 || !Number.isFinite(trimStart) || !Number.isFinite(trimEnd)) return p;
  const cur = p.layers[j];
  const photo = isPhoto(cur);
  const end = layerEnd(cur);
  let from = photo ? 0 : clamp(trimStart, [0, cur.sourceDuration]);
  let to = photo ? clamp(trimEnd, [PHOTO.minSeconds, PHOTO.maxSeconds]) : clamp(trimEnd, [0, cur.sourceDuration]);
  if (anchor === "start" && clipDuration({ ...cur, trimStart: from, trimEnd: to }) > end) {
    // The layer cannot start before 0: its head (the source end of a reversed layer) takes exactly the `end` seconds there are.
    if (photo) to = clamp(end, [PHOTO.minSeconds, PHOTO.maxSeconds]);
    else if (cur.reversed) to = clamp(sourceAfter(cur, from, end), [0, cur.sourceDuration]);
    else from = clamp(sourceAfter(cur, to, -end), [0, cur.sourceDuration]);
  }
  if (!photo && spanTooShort(cur, from, to, LAYER_LIMITS.minDuration)) return p;
  if (from === cur.trimStart && to === cur.trimEnd) return p;
  const next: LayerClip = { ...cur, trimStart: from, trimEnd: to };
  // The start is not rounded here: it must put the end exactly where it was on every frame of a drag.
  return putLayer(p, j, anchor === "start" ? { ...next, start: Math.max(0, end - clipDuration(next)) } : next);
}

export function deleteLayer(p: Project, id: string): Project {
  if (!p.layers.some((l) => l.id === id)) return p;
  return touch(p, { layers: p.layers.filter((l) => l.id !== id) });
}

/** Why a layer cannot be copied: the layer limit, no room (the copy would start at or after the project's end), or the overlap rule. */
export type DuplicateLayerRefusal = "limit" | "noRoom" | "overlap";

/** The layer list with a copy of the layer at index `j` (see `duplicateLayer`), or why the copy is refused. */
function layersWithCopy(p: Project, j: number): LayerClip[] | DuplicateLayerRefusal {
  if (p.layers.length >= LAYER_LIMITS.max) return "limit";
  const src = p.layers[j];
  const start = Math.ceil(layerEnd(src) * 1000 - 1e-6) / 1000;
  if (start >= totalDuration(p)) return "noRoom";
  const copy: LayerClip = { ...newLayer(src, 0), id: newId(), transform: { ...src.transform }, start };
  const layers = [...p.layers.slice(0, j + 1), copy, ...p.layers.slice(j + 1)];
  return layersOk(layers, copy) ? layers : "overlap";
}

/** Why `duplicateLayer` would refuse this layer; null when it would copy it (or the id is not a layer's). */
export function duplicateLayerRefusal(p: Project, id: string): DuplicateLayerRefusal | null {
  const j = p.layers.findIndex((l) => l.id === id);
  if (j < 0) return null;
  const out = layersWithCopy(p, j);
  return typeof out === "string" ? out : null;
}

/**
 * The copy (new id, every nested value its own, the transform KEPT) starts where the original ends — rounded up to 3 decimals, so it
 * never overlaps its original — and sits right above it in the list. Refused (same project) at LAYER_LIMITS.max, when the copy would
 * start at or after the project's end (it would never show), or when the overlap rule would break.
 */
export function duplicateLayer(p: Project, id: string): Project {
  const j = p.layers.findIndex((l) => l.id === id);
  if (j < 0) return p;
  const layers = layersWithCopy(p, j);
  return typeof layers === "string" ? p : touch(p, { layers });
}

/** Bring forward / send back: swaps the layer with its neighbour in draw order (later = on top). Same project at the ends. */
export function reorderLayer(p: Project, id: string, direction: "forward" | "back"): Project {
  const j = p.layers.findIndex((l) => l.id === id);
  const k = direction === "forward" ? j + 1 : j - 1;
  if (j < 0 || k < 0 || k >= p.layers.length) return p;
  const layers = p.layers.slice();
  [layers[j], layers[k]] = [layers[k], layers[j]];
  return touch(p, { layers });
}

/** A clip's or layer's own opacity, clamped to 0–1 (2 decimals). A non-finite value leaves the project unchanged. */
export function setClipOpacity(p: Project, id: string, opacity: number): Project {
  if (!Number.isFinite(opacity)) return p;
  const v = r2(clampOpacity(opacity));
  return updateClip(p, id, (c) => (c.opacity === v ? c : { ...c, opacity: v }));
}

/** A clip's or layer's mask; an unknown mask leaves the project unchanged. */
export function setClipMask(p: Project, id: string, mask: MaskId): Project {
  if (!(MASK_IDS as readonly string[]).includes(mask)) return p;
  return updateClip(p, id, (c) => (c.mask === mask ? c : { ...c, mask }));
}

/** A LAYER's blend mode. Same project for a main clip's id (a main clip is always "normal"), an unknown id or an unknown blend. */
export function setClipBlend(p: Project, id: string, blend: BlendId): Project {
  if (!(BLEND_IDS as readonly string[]).includes(blend) || !findItem(p, id)?.layer) return p;
  return updateClip(p, id, (c) => (c.blend === blend ? c : { ...c, blend }));
}

/**
 * A clip's or layer's green screen; `null` removes it. The key goes through `clampChroma` (strength clamped to 0–1) and the strength
 * is rounded to 2 decimals; the stored key is always its own object. Same project when the value is unchanged (compared by value), and
 * for a key that would not be stored as given: a colour that is not #RRGGBB or a non-finite strength.
 */
export function setClipChroma(p: Project, id: string, chroma: ChromaKey | null): Project {
  let next: ChromaKey | null = null;
  if (chroma !== null) {
    const clean = clampChroma(chroma);
    if (clean === null || !Number.isFinite(chroma.strength)) return p;
    next = { color: clean.color, strength: r2(clean.strength) };
  }
  return updateClip(p, id, (c) => (sameJson(next, c.chroma) ? c : { ...c, chroma: next }));
}

/**
 * Remove background on or off for a main clip or a layer (photo or video). On writes `cutout: true`; off removes the key. Refused
 * (same project) for an unknown id, a reversed clip, a value that is already in place, and a clip that has a Stabilize strength or
 * an ACTIVE Smooth slow motion (one copy per clip: the two do not combine). A Smooth slow motion switch that is idle — the clip is
 * not slowed any more, so its switch is not on screen — is removed by the same tap.
 */
export function setClipCutout(p: Project, id: string, on: boolean): Project {
  return updateClip(p, id, (c) => {
    if (on) {
      if (c.cutout === true || c.reversed || c.stabilize !== undefined || (c.smooth === true && isSlowed(c))) return c;
      const next = { ...c, cutout: true as const };
      delete next.smooth;
      return next;
    }
    if (c.cutout === undefined) return c;
    const next = { ...c };
    delete next.cutout;
    return next;
  });
}

/**
 * Stabilize for a video clip or layer: a strength, or null for off (the key is removed). Refused (same project) for an unknown id
 * or strength, a photo, a reversed clip, a clip with Remove background, and a value that is already in place. Off is never refused.
 */
export function setClipStabilize(p: Project, id: string, level: StabilizeId | null): Project {
  if (level !== null && !(STABILIZE_IDS as readonly string[]).includes(level)) return p;
  return updateClip(p, id, (c) => {
    if (level === null) {
      if (c.stabilize === undefined) return c;
      const next = { ...c };
      delete next.stabilize;
      return next;
    }
    return isPhoto(c) || c.reversed || c.cutout === true || c.stabilize === level ? c : { ...c, stabilize: level };
  });
}

/**
 * Smooth slow motion on or off for a video clip or layer. On writes `smooth: true` and is refused (same project) for an unknown id,
 * a photo, a reversed clip, a clip with Remove background, a clip that is not slowed (`isSlowed`) and a value already in place.
 * Off removes the key and is never refused. Changing the speed afterwards never touches the key.
 */
export function setClipSmooth(p: Project, id: string, on: boolean): Project {
  return updateClip(p, id, (c) => {
    if (!on) {
      if (c.smooth === undefined) return c;
      const next = { ...c };
      delete next.smooth;
      return next;
    }
    return isPhoto(c) || c.reversed || c.cutout === true || c.smooth === true || !isSlowed(c) ? c : { ...c, smooth: true as const };
  });
}

/**
 * Splits the video clip under `outputTime` and puts a still (PHOTO.freezeSeconds long) between the halves. The still copies the clip's
 * filter, crop, background, opacity, mask and green screen (its blend is normal: it is a main-track clip), and its transform — of a keyframed clip the placement shown at the freeze moment; the right half keeps the original transition. Refused (same project) on a photo, a missing clip,
 * or within MIN_CLIP_SECONDS of either end. Overlays and music are not shifted, like every other length-changing op here.
 */
export function insertFreezeFrame(p: Project, outputTime: number, still: { id: string; sourceUri: string; width: number; height: number }): Project {
  const hit = clipAt(p, outputTime);
  if (!hit || isPhoto(hit.clip)) return p;
  const split = splitClipAt(p, outputTime);
  if (split === p) return p;
  const src = hit.clip;
  const photo: Clip = {
    ...newPhotoClip({ ...still, seconds: PHOTO.freezeSeconds }),
    filter: src.filter, filterIntensity: src.filterIntensity, adjust: { ...src.adjust },
    transform: src.keyframes.length > 0 ? transformAt(src, hit.offsetInClip) : { ...src.transform },
    crop: { ...src.crop }, background: { ...src.background }, opacity: src.opacity, mask: src.mask, blend: "normal", chroma: copyChroma(src.chroma),
  };
  const at = hit.index + 1;
  return touch(p, { clips: normaliseTransitions([...split.clips.slice(0, at), photo, ...split.clips.slice(at)]) });
}

/** Patched values are rounded to 2 decimals (slider floats: a slider back at centre must store exactly 0). */
export function setClipAdjust(p: Project, clipId: string, patch: Partial<ClipAdjust>): Project {
  const rounded: Partial<ClipAdjust> = {};
  for (const key of Object.keys(patch) as (keyof ClipAdjust)[]) {
    const v = patch[key];
    if (typeof v === "number") rounded[key] = r2(v);
  }
  return updateClip(p, clipId, (c) => {
    const next = clampAdjust({ ...c.adjust, ...rounded });
    return sameJson(next, c.adjust) ? c : { ...c, adjust: next };
  });
}

export function resetClipAdjust(p: Project, clipId: string): Project {
  return updateClip(p, clipId, (c) => (sameJson(c.adjust, DEFAULT_ADJUST) ? c : { ...c, adjust: { ...DEFAULT_ADJUST } }));
}

export function setAdjustForAllClips(p: Project, adjust: ClipAdjust): Project {
  const next = clampAdjust(adjust);
  if (p.clips.every((c) => sameJson(c.adjust, next))) return p;
  return touch(p, { clips: p.clips.map((c) => (sameJson(c.adjust, next) ? c : { ...c, adjust: { ...next } })) });
}

/** Adds a timeline effect at the playhead (default length, clamped to the project end; a region effect with the default rectangle — `makeEffect`); refused when the project has no room for minDuration. */
export function addEffect(p: Project, type: EffectId, playhead: number, id: string = newId()): Project {
  const total = totalDuration(p);
  if (!Number.isFinite(playhead) || p.clips.length === 0 || total < EFFECT_LIMITS.minDuration) return p;
  let start = clamp(playhead, [0, total]);
  const end = Math.min(total, start + EFFECT_LIMITS.defaultDuration);
  if (end - start < EFFECT_LIMITS.minDuration) start = Math.max(0, end - EFFECT_LIMITS.minDuration - 1e-9);   // tiny nudge: end - start must be >= minDuration exactly
  return touch(p, { effects: [...p.effects, makeEffect({ id, type, start, end, intensity: EFFECT_LIMITS.defaultIntensity })] });
}

function replaceEffect(p: Project, i: number, next: EffectItem): Project {
  if (sameJson(next, p.effects[i])) return p;
  const effects = p.effects.slice(); effects[i] = next;
  return touch(p, { effects });
}

/** The edge named in the patch is the one that moves; the other edge never yields. */
export function updateEffect(p: Project, id: string, patch: Partial<Pick<EffectItem, "start" | "end" | "intensity">>): Project {
  const i = p.effects.findIndex((e) => e.id === id);
  if (i < 0) return p;
  if (Object.values(patch).some((v) => v !== undefined && !Number.isFinite(v))) return p;
  const cur = p.effects[i];
  const total = totalDuration(p);
  const min = EFFECT_LIMITS.minDuration;
  const intensity = patch.intensity === undefined ? cur.intensity : r2(clamp(patch.intensity, [0, 1]));
  if (patch.start === undefined && patch.end === undefined) return replaceEffect(p, i, { ...cur, intensity });   // range untouched
  let { start, end } = cur;
  if (patch.end !== undefined) end = clamp(patch.end, [0, total]);
  if (patch.start !== undefined) start = clamp(patch.start, [0, total]);
  // A yielding edge is nudged 1e-9 further (as addEffect does): `end - (end - min)` can be a hair under `min` in floating point,
  // and the loader would then move the end (`start + min`), so a saved project would not reload byte-for-byte.
  if (end - start < min) {
    if (patch.end !== undefined && patch.start === undefined) end = start + min + 1e-9;
    else start = end - min - 1e-9;
  }
  start = Math.max(0, start); end = Math.min(total, end);
  if (end - start < min) return p;
  return replaceEffect(p, i, { ...cur, start, end, intensity });
}

export function moveEffect(p: Project, id: string, newStart: number): Project {
  const e = p.effects.find((x) => x.id === id);
  if (!e || !Number.isFinite(newStart)) return p;
  const d = e.end - e.start;
  const start = Math.max(0, Math.min(newStart, totalDuration(p) - d));
  return updateEffect(p, id, { start, end: start + d });
}

export function deleteEffect(p: Project, id: string): Project {
  if (!p.effects.some((e) => e.id === id)) return p;
  return touch(p, { effects: p.effects.filter((e) => e.id !== id) });
}

/**
 * The rectangle of a region effect (blur box / mosaic box), through `clampEffectRect` (inside the frame, sides ≥ REGION_LIMITS.min; not
 * rounded). Same project for an unknown id, an effect that is not a region effect, a non-finite value or an unchanged rectangle.
 */
export function setEffectRect(p: Project, effectId: string, rect: EffectRect): Project {
  const i = p.effects.findIndex((e) => e.id === effectId);
  if (i < 0 || !isRegionEffect(p.effects[i].type)) return p;
  if (typeof rect !== "object" || rect === null || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return p;
  return replaceEffect(p, i, { ...p.effects[i], rect: clampEffectRect(rect) });
}

/** The copy (its own rectangle, for a region effect) sits right after the original when it fits before the project end, otherwise it takes the same range. */
export function duplicateEffect(p: Project, id: string): Project {
  const i = p.effects.findIndex((e) => e.id === id);
  if (i < 0) return p;
  const src = p.effects[i];
  const d = src.end - src.start;
  const fits = src.end + d <= totalDuration(p) + 1e-9;
  const copy: EffectItem = { ...src, id: newId(), start: fits ? src.end : src.start, end: fits ? src.end + d : src.end, rect: src.rect ? { ...src.rect } : null };
  return touch(p, { effects: [...p.effects.slice(0, i + 1), copy, ...p.effects.slice(i + 1)] });
}

// ---- Motion: animations and keyframes ----

const EDGES = ["in", "out"] as const;
/** A patch's edges are usable: each is absent, null, or a known id with a finite duration. */
function edgesOk(patch: { in?: AnimEdge | null; out?: AnimEdge | null }): boolean {
  return EDGES.every((k) => { const e = patch[k]; return e == null || (Number.isFinite(e.duration) && clampAnimEdge(e) !== null); });
}

/**
 * `{ in }` / `{ out }` set that edge and clear the combo; `{ combo: id }` sets it and clears both edges; a `null` clears only what it
 * names. Durations are clamped to ANIM_LIMITS. An unknown id or a non-finite duration leaves the project unchanged.
 */
export function setClipAnimation(p: Project, clipId: string, patch: Partial<ClipAnimation>): Project {
  if (!edgesOk(patch)) return p;
  if (patch.combo != null && !(ANIM_COMBO_IDS as readonly string[]).includes(patch.combo)) return p;
  return updateClip(p, clipId, (c) => {
    let next: ClipAnimation = { ...c.animation };
    if (patch.combo !== undefined) next = patch.combo === null ? { ...next, combo: null } : { in: null, out: null, combo: patch.combo };
    for (const k of EDGES) {
      const e = patch[k];
      if (e !== undefined) next = e === null ? { ...next, [k]: null } : { ...next, [k]: e, combo: null };
    }
    const clean = clampClipAnimation(next);
    return sameJson(clean, c.animation) ? c : comboOverMotion({ ...c, animation: clean });
  });
}

/** Every clip gets its own copy of `a` (clamped; a combo wins over edges). Keyframes are not touched. Unknown id / non-finite duration → unchanged. */
export function setAnimationForAllClips(p: Project, a: ClipAnimation): Project {
  if (!edgesOk(a) || (a.combo != null && !(ANIM_COMBO_IDS as readonly string[]).includes(a.combo))) return p;
  const same = (c: Clip) => sameJson(c.animation, clampClipAnimation(a));
  if (p.clips.every(same)) return p;
  return touch(p, { clips: p.clips.map((c) => (same(c) ? c : comboOverMotion({ ...c, animation: clampClipAnimation(a) }))) });
}

/** A Combo owns the whole clip: a clip that now has one loses its photo Motion. A clip without a Motion is returned as it is. */
function comboOverMotion(c: Clip): Clip {
  if (c.animation.combo === null || c.motion === undefined) return c;
  const next = { ...c };
  delete next.motion;
  return next;
}

/**
 * `c` with the Motion (already clamped) or without one. A video and a photo with keyframes are returned as they are (keyframes move
 * the photo already). A Motion clears any Combo — the two never sit on one photo — and keeps In / Out. None removes the key, and with
 * it an older zoom / pan Combo (what the Motion tool shows as its own); Sway and Pulse stay. Same object when nothing changes.
 */
function withPhotoMotion(c: Clip, motion: PhotoMotion | null): Clip {
  if (!isPhoto(c) || c.keyframes.length > 0) return c;
  const combo = c.animation.combo;
  if (motion === null) {
    const twin = combo !== null && COMBO_AS_MOTION[combo] !== undefined;
    if (c.motion === undefined && !twin) return c;
    const next: Clip = { ...c, animation: twin ? { ...c.animation, combo: null } : c.animation };
    delete next.motion;
    return next;
  }
  const stored: PhotoMotion = { id: motion.id, strength: r2(motion.strength) };
  if (combo === null && sameJson(c.motion, stored)) return c;
  return { ...c, motion: stored, animation: combo === null ? c.animation : { ...c.animation, combo: null } };
}

/** `motion` as it may be stored: null for None; `undefined` when it cannot be used (an unknown id, a strength that is not a number). */
function usableMotion(motion: PhotoMotion | null): PhotoMotion | null | undefined {
  if (motion === null) return null;
  const clean = clampPhotoMotion(motion);
  return clean === null || !Number.isFinite(motion.strength) ? undefined : clean;
}

/**
 * A photo's Motion — a main clip's or a layer's. `null` = None. Same project (no undo step) for a video, a photo with keyframes, an
 * unknown clip, a motion that cannot be used, or no change.
 */
export function setPhotoMotion(p: Project, clipId: string, motion: PhotoMotion | null): Project {
  const clean = usableMotion(motion);
  return clean === undefined ? p : updateClip(p, clipId, (c) => withPhotoMotion(c, clean));
}

/** "Apply to all photos": every MAIN-track photo without keyframes gets the motion (None included). Layers are not touched. */
export function setMotionForAllPhotos(p: Project, motion: PhotoMotion | null): Project {
  const clean = usableMotion(motion);
  if (clean === undefined) return p;
  const clips = p.clips.map((c) => withPhotoMotion(c, clean));
  return clips.every((c, i) => c === p.clips[i]) ? p : touch(p, { clips });
}

/** Text and stickers; captions are refused. In, Out and Loop are independent; `null` clears the one it names. */
export function setOverlayAnimation(p: Project, overlayId: string, patch: Partial<OverlayAnimation>): Project {
  const i = p.overlays.findIndex((o) => o.id === overlayId);
  if (i < 0 || p.overlays[i].kind === "caption") return p;
  const cur = p.overlays[i];
  const animation = patchedOverlayAnimation(cur.animation, patch);
  return animation ? replaceOverlay(p, i, { ...cur, animation }) : p;
}

/** `cur` with the patch's In / Out / Loop written (clamped); null when the patch is refused (unknown id, non-finite duration). */
function patchedOverlayAnimation(cur: OverlayAnimation, patch: Partial<OverlayAnimation>): OverlayAnimation | null {
  if (!edgesOk(patch)) return null;
  if (patch.loop != null && !(ANIM_LOOP_IDS as readonly string[]).includes(patch.loop)) return null;
  const next: OverlayAnimation = { ...cur };
  for (const k of EDGES) if (patch[k] !== undefined) next[k] = patch[k] ?? null;
  if (patch.loop !== undefined) next.loop = patch.loop;
  return clampOverlayAnimation(next);
}

// ---- Text style, templates and caption presets ----

/** Text and captions: the patch is merged into the overlay's style (see `cleanStylePatch`) and clamped (TEXT_STYLE_LIMITS, #RRGGBB colours). Same project when nothing changes. */
export function setTextStyle(p: Project, overlayId: string, patch: Partial<TextStyle>): Project {
  const i = p.overlays.findIndex((o) => o.id === overlayId);
  if (i < 0) return p;
  const cur = p.overlays[i];
  if (!isTextOverlay(cur)) return p;
  return replaceOverlay(p, i, { ...cur, style: clampTextStyle({ ...cur.style, ...cleanStylePatch(patch) }) });
}

/**
 * A one-tap look for a text (kind "text" only): font, colour, background, outline and the WHOLE style are replaced, so nothing of an
 * earlier template is left. The entrance and the loop animation are part of the look: they become the template's, or none when it
 * defines none (written by the rules of `setOverlayAnimation`); the exit animation is the text's own unless the template names one.
 * Text, position, size, rotation, alignment, timing and keyframes stay. One change; same project when nothing changes.
 */
export function applyTextTemplate(p: Project, overlayId: string, templateId: TextTemplateId): Project {
  const i = p.overlays.findIndex((o) => o.id === overlayId);
  if (i < 0 || !(TEXT_TEMPLATE_IDS as readonly string[]).includes(templateId)) return p;
  const cur = p.overlays[i];
  if (cur.kind !== "text") return p;
  const t = TEXT_TEMPLATES[templateId].patch;
  const animation = patchedOverlayAnimation(cur.animation, { in: null, loop: null, ...t.animation });
  if (!animation) return p;
  return replaceOverlay(p, i, { ...cur, fontId: t.fontId, color: t.color, background: t.background ? { ...t.background } : null,
    outline: t.outline, style: clampTextStyle(t.style), animation });
}

/** A one-tap look for every caption (font, size, colour, background, outline, whole style, highlight); unchanged when there are none. */
export function applyCaptionPreset(p: Project, presetId: CaptionPresetId): Project {
  if (!(CAPTION_PRESET_IDS as readonly string[]).includes(presetId)) return p;
  return setCaptionStyleForAll(p, CAPTION_PRESETS[presetId].patch);
}

type PinValues = Pick<Keyframe, "x" | "y" | "scale" | "rotation" | "opacity">;
const PIN_KEYS = ["x", "y", "scale", "rotation", "opacity"] as const;

/** The patch's defined values; null when one of them is not a finite number (the edit is then refused). */
function pinPatch(patch: Partial<PinValues>): Partial<PinValues> | null {
  const out: Partial<PinValues> = {};
  for (const k of PIN_KEYS) {
    const v = patch[k];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) return null;
    out[k] = v;
  }
  return out;
}

/** Index of the pin at `t` (`isSamePinTime`; the nearest when two qualify), or −1. */
function pinIndexAt(pins: Keyframe[], t: number): number {
  let best = -1;
  for (let i = 0; i < pins.length; i++) {
    if (isSamePinTime(pins[i].t, t) && (best < 0 || Math.abs(pins[i].t - t) < Math.abs(pins[best].t - t))) best = i;
  }
  return best;
}

type ClampPins = (k: unknown) => Keyframe[];

/** `pins` plus a new one in sorted position, clamped on its own (no neighbour is ever dropped). Same array when full or not finite. */
function insertPin(pins: Keyframe[], pin: Keyframe, clampPins: ClampPins): Keyframe[] {
  if (pins.length >= KEYFRAME_LIMITS.max) return pins;
  const clean = clampPins([pin])[0];
  if (!clean) return pins;
  const at = pins.findIndex((k) => k.t > clean.t);
  return at < 0 ? [...pins, clean] : [...pins.slice(0, at), clean, ...pins.slice(at)];
}

/** Writes `patch` to the pin at `t`, or adds one there starting from `from()`. Same array when nothing changes. */
function upsertPin(pins: Keyframe[], t: number, from: () => PinValues, patch: Partial<PinValues>, clampPins: ClampPins): Keyframe[] {
  const i = pinIndexAt(pins, t);
  if (i < 0) return insertPin(pins, { t, ...from(), ...patch }, clampPins);
  const clean = clampPins([{ ...pins[i], ...patch }])[0];
  if (!clean || (clean.t === pins[i].t && PIN_KEYS.every((k) => clean[k] === pins[i][k]))) return pins;   // by field: key order may differ
  const next = pins.slice(); next[i] = clean;
  return next;
}

/** The moment a clip edit lands on: the offset clamped to the clip, and its source time (pins are in source time). */
function pinMoment(c: Clip, offsetInClip: number): { offset: number; t: number } {
  const offset = Math.max(0, Math.min(offsetInClip, clipDuration(c)));
  return { offset, t: sourceTimeAt(c, offset) };
}

/** The pin within KEYFRAME_LIMITS.minGap of `offsetInClip` (clamped to the clip; compared in source time), or null. */
export function clipKeyframeAt(clip: Clip, offsetInClip: number): Keyframe | null {
  if (!Number.isFinite(offsetInClip)) return null;
  const i = pinIndexAt(clip.keyframes, pinMoment(clip, offsetInClip).t);
  return i < 0 ? null : clip.keyframes[i];
}

/**
 * The diamond: adds a pin at the playhead from the value shown there, or removes the pin the playhead is on. Removing the last pin
 * copies its x / y / scale / rotation to the static transform (opacity is dropped, flips kept). Refused at KEYFRAME_LIMITS.max pins.
 */
export function toggleClipKeyframe(p: Project, clipId: string, offsetInClip: number): Project {
  if (!Number.isFinite(offsetInClip)) return p;
  return updateClip(p, clipId, (c) => {
    const m = pinMoment(c, offsetInClip);
    const i = pinIndexAt(c.keyframes, m.t);
    if (i < 0) {
      if (activePhotoMotion(c)) return c;   // a Motion and pins never share a photo (as `setPhotoMotion` refuses a pinned one)
      const keyframes = insertPin(c.keyframes, { t: m.t, ...clipBaseAt(c, m.offset) }, clampClipKeyframes);
      return keyframes === c.keyframes ? c : { ...c, keyframes };
    }
    const k = c.keyframes[i];
    if (c.keyframes.length > 1) return { ...c, keyframes: c.keyframes.filter((_, j) => j !== i) };
    return { ...c, keyframes: [], transform: clampTransform({ ...c.transform, x: k.x, y: k.y, scale: k.scale, rotation: k.rotation }) };
  });
}

/**
 * A placement edit at the playhead. Without keyframes it is `setClipTransform` (opacity ignored); with keyframes it writes the pin at
 * that moment — the one within minGap, otherwise a new one that starts from the value shown there. Non-finite input → unchanged.
 */
export function editClipTransformAt(p: Project, clipId: string, offsetInClip: number,
  patch: Partial<Pick<ClipTransform, "x" | "y" | "scale" | "rotation">> & { opacity?: number }): Project {
  const values = pinPatch(patch);
  const c = findItem(p, clipId)?.clip;
  if (!c || !values || !Number.isFinite(offsetInClip)) return p;
  if (c.keyframes.length === 0) {
    delete values.opacity;
    return Object.keys(values).length === 0 ? p : setClipTransform(p, clipId, values);
  }
  if (Object.keys(values).length === 0) return p;   // nothing to write: never add a pin
  const m = pinMoment(c, offsetInClip);
  const keyframes = upsertPin(c.keyframes, m.t, () => clipBaseAt(c, m.offset), values, clampClipKeyframes);
  return keyframes === c.keyframes ? p : updateClip(p, clipId, (x) => ({ ...x, keyframes }));
}

/** Seconds from the overlay's start for project time `time`, clamped to its life. */
const overlayLocal = (o: Overlay, time: number): number => Math.max(0, Math.min(time - o.start, o.end - o.start));

/** The pin within KEYFRAME_LIMITS.minGap of project time `time` (clamped to the overlay's life), or null. */
export function overlayKeyframeAt(o: Overlay, time: number): Keyframe | null {
  if (!Number.isFinite(time)) return null;
  const i = pinIndexAt(o.keyframes, overlayLocal(o, time));
  return i < 0 ? null : o.keyframes[i];
}

/** The diamond for text and stickers (captions are refused): same rules as `toggleClipKeyframe`, in the overlay's units. */
export function toggleOverlayKeyframe(p: Project, overlayId: string, time: number): Project {
  const idx = p.overlays.findIndex((o) => o.id === overlayId);
  if (idx < 0 || p.overlays[idx].kind === "caption" || !Number.isFinite(time)) return p;
  const o = p.overlays[idx];
  const t = overlayLocal(o, time);
  const i = pinIndexAt(o.keyframes, t);
  if (i < 0) {
    const keyframes = insertPin(o.keyframes, { t, ...overlayBaseAt(o, o.start + t) }, clampOverlayKeyframes);
    return keyframes === o.keyframes ? p : replaceOverlay(p, idx, { ...o, keyframes });
  }
  const k = o.keyframes[i];
  if (o.keyframes.length > 1) return replaceOverlay(p, idx, { ...o, keyframes: o.keyframes.filter((_, j) => j !== i) });
  return replaceOverlay(p, idx, normaliseOverlay(p, { ...o, keyframes: [], x: k.x, y: k.y, scale: k.scale, rotation: k.rotation }));
}

/**
 * A placement edit of a text / sticker at project time `time` (captions are refused). Without keyframes it is `updateOverlayShared`
 * on x / y / scale / rotation (opacity ignored); with keyframes it writes the pin at `time − start`. Non-finite input → unchanged.
 */
export function editOverlayAt(p: Project, overlayId: string, time: number,
  patch: Partial<Pick<Keyframe, "x" | "y" | "scale" | "rotation" | "opacity">>): Project {
  const values = pinPatch(patch);
  const idx = p.overlays.findIndex((o) => o.id === overlayId);
  if (idx < 0 || p.overlays[idx].kind === "caption" || !values || !Number.isFinite(time)) return p;
  const o = p.overlays[idx];
  if (o.keyframes.length === 0) {
    delete values.opacity;
    return Object.keys(values).length === 0 ? p : updateOverlayShared(p, overlayId, values);
  }
  if (Object.keys(values).length === 0) return p;   // nothing to write: never add a pin
  const t = overlayLocal(o, time);
  const keyframes = upsertPin(o.keyframes, t, () => overlayBaseAt(o, o.start + t), values, clampOverlayKeyframes);
  return keyframes === o.keyframes ? p : replaceOverlay(p, idx, { ...o, keyframes });
}
