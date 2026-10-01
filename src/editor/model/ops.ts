import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration, outputToSource } from "./timeline";
import { MIN_CLIP_SECONDS, SPEED_LIMITS, TRANSITION_LIMITS, type AspectRatio, type Clip, type FilterId, type Project, type TransitionType } from "./types";
import { totalDuration } from "./timeline";
import { AUDIO_LIMITS, CLIP_VOLUME, isSticker, isTextOverlay, OVERLAY_LIMITS, type AudioTrack, type Overlay, type StickerOverlay, type TextOverlay } from "./types";

function touch(p: Project, patch: Partial<Project>): Project {
  return { ...p, ...patch, updatedAt: nowIso() };
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
  if (offsetInClip < MIN_CLIP_SECONDS || d - offsetInClip < MIN_CLIP_SECONDS) return p;
  const cut = outputToSource(clip, offsetInClip);
  const left: Clip = { ...clip, trimEnd: cut, transitionOut: NO_TRANSITION };
  const right: Clip = { ...clip, id: newId(), trimStart: cut };
  return touch(p, { clips: [...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)] });
}

export function trimClip(p: Project, clipId: string, trimStart: number, trimEnd: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
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
  const copy: Clip = { ...p.clips[i], id: newId(), transitionOut: NO_TRANSITION };
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
  if (i < 0) return p;
  const v = clamp(volume, CLIP_VOLUME);
  if (v === p.clips[i].volume) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], volume: v };
  return touch(p, { clips });
}

export function setClipMuted(p: Project, clipId: string, muted: boolean): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || p.clips[i].muted === muted) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], muted };
  return touch(p, { clips });
}

const NO_TRANSITION = { type: "none" as const, duration: 0 };
const r2 = (v: number) => Math.round(v * 100) / 100;

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
  return normaliseTransitionsForClips(clips);
}

export function normaliseTransitionsForClips(clips: Clip[]): Clip[] {
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
  let s = clamp(speed, SPEED_LIMITS);
  const maxForMin = (c.trimEnd - c.trimStart) / MIN_CLIP_SECONDS;   // speed at which output hits 0.1 s
  s = r2(Math.min(s, maxForMin));
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

export function setFilterForAllClips(p: Project, filter: FilterId | null): Project {
  const f = filter === "none" ? null : filter;
  if (p.clips.every((c) => c.filter === f)) return p;
  return touch(p, { clips: p.clips.map((c) => (c.filter === f ? c : { ...c, filter: f })) });
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
