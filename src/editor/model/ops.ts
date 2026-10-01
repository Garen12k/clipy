import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration } from "./timeline";
import { MIN_CLIP_SECONDS, type AspectRatio, type Clip, type Project } from "./types";

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
  const cut = clip.trimStart + offsetInClip;
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
  if (end - start < MIN_CLIP_SECONDS) return p;
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
