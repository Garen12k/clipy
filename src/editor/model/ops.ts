import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration, outputToSource } from "./timeline";
import { MIN_CLIP_SECONDS, type AspectRatio, type Clip, type Project } from "./types";
import { totalDuration } from "./timeline";
import { AUDIO_LIMITS, CLIP_VOLUME, isTextOverlay, OVERLAY_LIMITS, type AudioTrack, type Overlay, type TextOverlay } from "./types";

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
  const left: Clip = { ...clip, trimEnd: cut };
  const right: Clip = { ...clip, id: newId(), trimStart: cut };
  return touch(p, { clips: [...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)] });
}

export function trimClip(p: Project, clipId: string, trimStart: number, trimEnd: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
  const start = Math.max(0, Math.min(trimStart, c.sourceDuration));
  const end = Math.max(0, Math.min(trimEnd, c.sourceDuration));
  if (end - start < MIN_CLIP_SECONDS - 1e-9) return p;
  if (start === c.trimStart && end === c.trimEnd) return p;
  const clips = p.clips.slice();
  clips[i] = { ...c, trimStart: start, trimEnd: end };
  return touch(p, { clips });
}

export function moveClip(p: Project, clipId: string, toIndex: number): Project {
  const from = p.clips.findIndex((c) => c.id === clipId);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(toIndex, p.clips.length - 1));
  if (to === from) return p;
  const clips = p.clips.slice();
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return touch(p, { clips });
}

export function deleteClip(p: Project, clipId: string): Project {
  if (!p.clips.some((c) => c.id === clipId)) return p;
  return touch(p, { clips: p.clips.filter((c) => c.id !== clipId) });
}

export function duplicateClip(p: Project, clipId: string): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const copy: Clip = { ...p.clips[i], id: newId() };
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

function normaliseOverlay<O extends Overlay>(p: Project, o: O): O {
  const total = totalDuration(p);
  let end = Math.min(o.end, total);
  let start = Math.max(0, Math.min(o.start, end));
  if (end - start < OVERLAY_LIMITS.minDuration) {
    if (start + OVERLAY_LIMITS.minDuration <= total) end = start + OVERLAY_LIMITS.minDuration;
    else { end = total; start = Math.max(0, total - OVERLAY_LIMITS.minDuration); }
  }
  const next: O = { ...o, x: clamp(o.x, [0, 1]), y: clamp(o.y, [0, 1]), scale: clamp(o.scale, OVERLAY_LIMITS.scale),
    start: r3(start), end: r3(end) };
  if (isTextOverlay(next)) (next as TextOverlay).fontScale = clamp(next.fontScale, OVERLAY_LIMITS.fontScale);
  return next;
}

export function updateOverlay(p: Project, id: string, patch: Partial<Omit<TextOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const target = p.overlays[i];
  if (!isTextOverlay(target)) return p;
  const next = normaliseOverlay(p, { ...target, ...patch });
  if (JSON.stringify(next) === JSON.stringify(target)) return p;
  const overlays = p.overlays.slice(); overlays[i] = next;
  return touch(p, { overlays });
}

export function moveOverlay(p: Project, id: string, newStart: number): Project {
  const o = p.overlays.find((x) => x.id === id);
  if (!o) return p;
  const d = o.end - o.start;
  const start = Math.max(0, Math.min(newStart, totalDuration(p) - d));
  return updateOverlay(p, id, { start, end: start + d });
}

export function deleteOverlay(p: Project, id: string): Project {
  if (!p.overlays.some((o) => o.id === id)) return p;
  return touch(p, { overlays: p.overlays.filter((o) => o.id !== id) });
}

export function duplicateOverlay(p: Project, id: string): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const src = p.overlays[i];
  const copy = normaliseOverlay(p, { ...src, id: newId(), x: src.x + 0.03, y: src.y + 0.03 });
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
