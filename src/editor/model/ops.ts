import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration, splitSourceRanges } from "./timeline";
import { fitScale } from "./clipLayout";
import {
  AUDIO_LIMITS, aspectRatioValue, clampAdjust, clampCrop, clampTransform, CLIP_VOLUME, DEFAULT_ADJUST, DEFAULT_TRANSFORM, EFFECT_END_SLACK, EFFECT_LIMITS, makeEffect, isPhoto, isSticker, isTextOverlay, makeOverlay, makeSticker,
  MIN_CLIP_SECONDS, newPhotoClip, normaliseRotation, OVERLAY_LIMITS, PHOTO, SPEED_LIMITS, TRANSITION_LIMITS,
  type AspectRatio, type AudioTrack, type Clip, type ClipAdjust, type ClipBackground, type ClipTransform, type CropRect, type EffectId, type EffectItem, type FilterId, type Overlay, type Project,
  type StickerOverlay, type TextOverlay, type TransitionType,
} from "./types";
import { totalDuration } from "./timeline";
import type { Template } from "../templates";

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
  if (isPhoto(clip)) {
    const cut = offsetInClip;   // photos run at speed 1 from 0
    const left: Clip = { ...clip, trimEnd: cut, transitionOut: NO_TRANSITION };
    const right: Clip = { ...clip, id: newId(), trimStart: 0, trimEnd: clip.trimEnd - cut, adjust: { ...clip.adjust } };
    return touch(p, { clips: normaliseTransitions([...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)]) });
  }
  const { left: l, right: r } = splitSourceRanges(clip, offsetInClip);
  const left: Clip = { ...clip, trimStart: l[0], trimEnd: l[1], transitionOut: NO_TRANSITION };
  const right: Clip = { ...clip, id: newId(), trimStart: r[0], trimEnd: r[1], adjust: { ...clip.adjust } };
  return touch(p, { clips: normaliseTransitions([...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)]) });
}

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
  if (end - start < MIN_CLIP_SECONDS * c.speed - 1e-9) return p;
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
  if (!p.clips.some((c) => c.id === clipId)) return p;
  return touch(p, { clips: normaliseTransitions(p.clips.filter((c) => c.id !== clipId)) });
}

export function duplicateClip(p: Project, clipId: string): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const src = p.clips[i];
  const copy: Clip = { ...src, id: newId(), transitionOut: NO_TRANSITION, transform: { ...src.transform }, crop: { ...src.crop }, background: { ...src.background }, adjust: { ...src.adjust } };
  return touch(p, { clips: [...p.clips.slice(0, i + 1), copy, ...p.clips.slice(i + 1)] });
}

export function setAspectRatio(p: Project, ratio: AspectRatio): Project {
  return p.aspectRatio === ratio ? p : touch(p, { aspectRatio: ratio });
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
  return isTextOverlay(o) ? { ...o, ...shared, fontScale: clamp(o.fontScale, OVERLAY_LIMITS.fontScale) } : { ...o, ...shared };
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
  return replaceOverlay(p, i, normaliseOverlay(p, { ...cur, ...patch }));
}

export function updateOverlayShared(p: Project, id: string, patch: SharedPatch): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...p.overlays[i], ...patch } as Overlay));
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
  return updateOverlayShared(p, id, { start, end: start + d });
}

export function deleteOverlay(p: Project, id: string): Project {
  if (!p.overlays.some((o) => o.id === id)) return p;
  return touch(p, { overlays: p.overlays.filter((o) => o.id !== id) });
}

export function duplicateOverlay(p: Project, id: string): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const src = p.overlays[i];
  const copy = normaliseOverlay(p, { ...src, id: newId(), x: src.x + 0.03, y: src.y + 0.03 } as Overlay);
  return touch(p, { overlays: [...p.overlays.slice(0, i + 1), copy, ...p.overlays.slice(i + 1)] });
}

export function setAudioTrack(p: Project, track: AudioTrack): Project {
  return touch(p, { audioTracks: [track] });
}

export function updateAudioTrack(p: Project, patch: Partial<Omit<AudioTrack, "id" | "sourceUri" | "sourceDuration">>): Project {
  const t = p.audioTracks[0];
  if (!t) return p;
  const merged = { ...t, ...patch };
  let trimEnd = Math.min(merged.trimEnd, t.sourceDuration);
  let trimStart = Math.max(0, Math.min(merged.trimStart, trimEnd));
  if (trimEnd - trimStart < AUDIO_LIMITS.minDuration) {
    if (trimStart + AUDIO_LIMITS.minDuration <= t.sourceDuration) trimEnd = trimStart + AUDIO_LIMITS.minDuration;
    else { trimEnd = t.sourceDuration; trimStart = Math.max(0, trimEnd - AUDIO_LIMITS.minDuration); }
  }
  const next: AudioTrack = { ...merged, trimStart: r3(trimStart), trimEnd: r3(trimEnd), start: r3(Math.max(0, merged.start)), volume: clamp(merged.volume, AUDIO_LIMITS.volume) };
  if (JSON.stringify(next) === JSON.stringify(t)) return p;
  return touch(p, { audioTracks: [next] });
}

export function removeAudioTrack(p: Project): Project {
  return p.audioTracks.length === 0 ? p : touch(p, { audioTracks: [] });
}

export function setClipVolume(p: Project, clipId: string, volume: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || isPhoto(p.clips[i])) return p;
  const v = clamp(volume, CLIP_VOLUME);
  if (v === p.clips[i].volume) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], volume: v };
  return touch(p, { clips });
}

export function setClipMuted(p: Project, clipId: string, muted: boolean): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || isPhoto(p.clips[i]) || p.clips[i].muted === muted) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], muted };
  return touch(p, { clips });
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

export function setClipSpeed(p: Project, clipId: string, speed: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
  if (isPhoto(c)) return p;
  let s = clamp(speed, SPEED_LIMITS);
  const maxForMin = (c.trimEnd - c.trimStart) / MIN_CLIP_SECONDS;   // speed at which output hits 0.1 s
  // Round the cap DOWN so rounding never pushes output under 0.1 s; the 1e-9 absorbs float noise (0.3 / 0.1 = 2.9999…).
  s = Math.min(r2(s), Math.floor(maxForMin * 100 + 1e-9) / 100);
  if (s === c.speed) return p;
  const clips = p.clips.slice(); clips[i] = { ...c, speed: s };
  return touch(p, { clips: normaliseTransitions(clips) });
}

export function setClipFilter(p: Project, clipId: string, filter: FilterId | null): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const f = filter === "none" ? null : filter;
  if (f === p.clips[i].filter) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], filter: f };
  return touch(p, { clips });
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

export function replaceCaptions(p: Project, captions: TextOverlay[]): Project {
  const kept = p.overlays.filter((o) => o.kind !== "caption");
  if (kept.length === p.overlays.length && captions.length === 0) return p;
  return touch(p, { overlays: [...kept, ...captions.map((c) => normaliseOverlay(p, c))] });
}
/**
 * One-tap look: speed + filter (+ transition on every cut but the last) for one clip or every clip, then a title and a sticker
 * over the first 3 s. Project scope also restyles captions and existing text overlays. Built only from the ops above.
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
    next = setCaptionStyleForAll(next, t.caption);
    for (const o of next.overlays) if (o.kind === "text") next = updateOverlay(next, o.id, t.text);
  }
  const end = Math.min(3, totalDuration(next));   // unrounded: r3 could land a hair past a sped-up total
  if (end <= 0) return next;
  next = addTextOverlay(next, makeOverlay({ id: newId(), text: t.title.text, ...t.text, fontScale: t.title.fontScale, x: 0.5, y: t.title.y, start: 0, end }));
  return addSticker(next, makeSticker({ id: newId(), ...t.sticker, start: 0, end }));
}

export function setCaptionStyleForAll(p: Project, style: Partial<Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y">>): Project {
  let changed = false;
  const overlays = p.overlays.map((o) => {
    if (o.kind !== "caption") return o;
    const next = normaliseOverlay(p, { ...o, ...style });
    if (JSON.stringify(next) !== JSON.stringify(o)) { changed = true; return next; }
    return o;
  });
  return changed ? touch(p, { overlays }) : p;
}

/** The 1080-wide reference frame for the project's aspect ratio (what clipLayout works in). */
export function frameSize(p: Project): { width: number; height: number } {
  return { width: 1080, height: 1080 / aspectRatioValue(p.aspectRatio) };
}

/** Replaces one clip with `fn(clip)`; returns the same project when the clip is missing or `fn` returns the same object. */
function updateClip(p: Project, clipId: string, fn: (c: Clip) => Clip): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const next = fn(p.clips[i]);
  if (next === p.clips[i]) return p;
  const clips = p.clips.slice(); clips[i] = next;
  return touch(p, { clips });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function withTransform(c: Clip, t: ClipTransform): Clip {
  return sameJson(t, c.transform) ? c : { ...c, transform: t };
}

export function setClipTransform(p: Project, clipId: string, patch: Partial<ClipTransform>): Project {
  return updateClip(p, clipId, (c) => withTransform(c, clampTransform({ ...c.transform, ...patch })));
}

export function resetClipTransform(p: Project, clipId: string): Project {
  return updateClip(p, clipId, (c) => withTransform(c, { ...DEFAULT_TRANSFORM }));
}

export function rotateClip90(p: Project, clipId: string): Project {
  return updateClip(p, clipId, (c) => withTransform(c, clampTransform({ ...c.transform, rotation: normaliseRotation(c.transform.rotation + 90) })));
}

export function flipClip(p: Project, clipId: string, axis: "h" | "v"): Project {
  return updateClip(p, clipId, (c) => withTransform(c, axis === "h" ? { ...c.transform, flipH: !c.transform.flipH } : { ...c.transform, flipV: !c.transform.flipV }));
}

export function fitClip(p: Project, clipId: string): Project {
  const { width, height } = frameSize(p);
  return updateClip(p, clipId, (c) =>
    withTransform(c, clampTransform({ ...c.transform, scale: fitScale(c, c.crop, c.transform.rotation, width, height), x: 0, y: 0 })));
}

export function fillClip(p: Project, clipId: string): Project {
  return updateClip(p, clipId, (c) => withTransform(c, { ...c.transform, scale: 1, x: 0, y: 0 }));
}

export function setClipCrop(p: Project, clipId: string, crop: CropRect): Project {
  return updateClip(p, clipId, (c) => {
    const next = clampCrop(crop);
    return sameJson(next, c.crop) ? c : { ...c, crop: next };
  });
}

export function setClipBackground(p: Project, clipId: string, bg: ClipBackground): Project {
  return updateClip(p, clipId, (c) => (sameJson(bg, c.background) ? c : { ...c, background: { ...bg } }));
}

export function setBackgroundForAllClips(p: Project, bg: ClipBackground): Project {
  if (p.clips.every((c) => sameJson(c.background, bg))) return p;
  return touch(p, { clips: p.clips.map((c) => (sameJson(c.background, bg) ? c : { ...c, background: { ...bg } })) });
}

/**
 * Swaps a clip's media and keeps its edits (id, filter, transform, crop, background, transition, sound for videos).
 * The new clip keeps the old one's timeline length where the new media allows it. A video too short for a clip is refused.
 */
export function replaceClipMedia(p: Project, clipId: string, media: Pick<Clip, "sourceUri" | "sourceDuration" | "width" | "height" | "kind">): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const old = p.clips[i];
  const prevOut = clipDuration(old);
  const base: Clip = { ...old, sourceUri: media.sourceUri, width: media.width, height: media.height, kind: media.kind, trimStart: 0 };
  let next: Clip;
  if (media.kind === "photo") {
    next = { ...base, speed: 1, muted: true, reversed: false, sourceDuration: PHOTO.maxSeconds, trimEnd: clamp(prevOut, [PHOTO.minSeconds, PHOTO.maxSeconds]) };
  } else if (isPhoto(old)) {
    // A photo runs at speed 1, so its source length is its output length.
    next = { ...base, sourceDuration: media.sourceDuration, speed: 1, muted: false, reversed: false, trimEnd: Math.min(media.sourceDuration, prevOut) };
  } else {
    // Same speed, so the old source span is exactly the previous output length × speed.
    next = { ...base, sourceDuration: media.sourceDuration, trimEnd: Math.min(media.sourceDuration, old.trimEnd - old.trimStart) };
  }
  if (next.kind === "video" && clipDuration(next) < MIN_CLIP_SECONDS - 1e-9) return p;
  const clips = p.clips.slice(); clips[i] = next;
  return touch(p, { clips: normaliseTransitions(clips) });
}

export function setClipReversed(p: Project, clipId: string, reversed: boolean): Project {
  return updateClip(p, clipId, (c) => (isPhoto(c) || c.reversed === reversed ? c : { ...c, reversed }));
}

/**
 * Splits the video clip under `outputTime` and puts a still (PHOTO.freezeSeconds long) between the halves. The still copies the clip's
 * filter, transform, crop and background; the right half keeps the original transition. Refused (same project) on a photo, a missing clip,
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
    transform: { ...src.transform }, crop: { ...src.crop }, background: { ...src.background },
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

/** Adds a timeline effect at the playhead (default length, clamped to the project end); refused when the project has no room for minDuration. */
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

/** The copy sits right after the original when it fits before the project end, otherwise it takes the same range. */
export function duplicateEffect(p: Project, id: string): Project {
  const i = p.effects.findIndex((e) => e.id === id);
  if (i < 0) return p;
  const src = p.effects[i];
  const d = src.end - src.start;
  const fits = src.end + d <= totalDuration(p) + 1e-9;
  const copy: EffectItem = { ...src, id: newId(), start: fits ? src.end : src.start, end: fits ? src.end + d : src.end };
  return touch(p, { effects: [...p.effects.slice(0, i + 1), copy, ...p.effects.slice(i + 1)] });
}
