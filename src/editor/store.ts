import { create } from "zustand";
import { fitEffects } from "./model/ops";
import { totalDuration } from "./model/timeline";
import type { EffectItem, PostRecord, Project } from "./model/types";

export const HISTORY_LIMIT = 50;
export const MIN_PPS = 20;
export const MAX_PPS = 200;
export const DEFAULT_PPS = 60;

export type EditOp = (p: Project) => Project;

interface EditorState {
  project: Project | null;
  /** Source files (not clip ids: split clips share one) that were missing when the project loaded. */
  missingSourceUris: string[];
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  selectedEffectId: string | null;
  playhead: number;
  isPlaying: boolean;
  pixelsPerSecond: number;
  past: Project[];
  future: Project[];
  dirty: boolean;
  setProject: (p: Project, missingSourceUris?: string[]) => void;
  apply: (op: EditOp) => void;
  beginTransaction: () => void;
  applyTransient: (op: EditOp) => void;
  addPostRecord: (record: PostRecord) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  select: (id: string | null) => void;
  selectOverlay: (id: string | null) => void;
  selectEffect: (id: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (b: boolean) => void;
  setZoom: (pps: number) => void;
  markSaved: () => void;
  reset: () => void;
}

const initial = {
  project: null, missingSourceUris: [], selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, playhead: 0, isPlaying: false,
  pixelsPerSecond: DEFAULT_PPS, past: [], future: [], dirty: false,
};

function afterChange(s: EditorState, next: Project): Partial<EditorState> {
  const selected = s.selectedClipId && next.clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null;
  const selectedOverlay = s.selectedOverlayId && next.overlays.some((o) => o.id === s.selectedOverlayId) ? s.selectedOverlayId : null;
  const selectedEffect = s.selectedEffectId && next.effects.some((e) => e.id === s.selectedEffectId) ? s.selectedEffectId : null;
  return { project: next, dirty: true, selectedClipId: selected, selectedOverlayId: selectedOverlay, selectedEffectId: selectedEffect, playhead: Math.min(s.playhead, totalDuration(next)) };
}

const sameItems = (a: EffectItem[], b: EffectItem[]) => a === b || (a.length === b.length && a.every((e, i) => e === b[i]));

/**
 * One frame of a clip drag (trim, speed): clip ops drop effects stranded past the project's end, and every frame is applied to the
 * result of the one before, so an effect dropped on one frame would stay gone when the drag comes back. The effects are therefore
 * taken from the transaction's snapshot (`base`, what `beginTransaction` pushed) and fitted to the new length. Left alone when the
 * clips did not change, or when the op changed the effects itself (an effect drag).
 */
function refitEffects(cur: Project, next: Project, base: Project | undefined): Project {
  if (!base || next.clips === cur.clips) return next;
  const total = totalDuration(next);
  if (!sameItems(next.effects, fitEffects(cur.effects, total))) return next;   // the op did more to the effects than drop stranded ones
  const effects = fitEffects(base.effects, total);
  return sameItems(effects, next.effects) ? next : { ...next, effects };
}

/** Post records are not undoable: carry the live list onto a restored snapshot (same object when unchanged). */
const withPosts = (p: Project, posts: PostRecord[]): Project => (p.posts === posts ? p : { ...p, posts });

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initial,
  setProject: (p, missingSourceUris = []) => set({ ...initial, project: p, missingSourceUris }),
  apply: (op) => {
    const s = get();
    if (!s.project) return;
    const next = op(s.project);
    if (next === s.project) return;
    set({ ...afterChange(s, next), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] });
  },
  beginTransaction: () => {
    const s = get();
    if (!s.project) return;
    set({ past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] });
  },
  applyTransient: (op) => {
    const s = get();
    if (!s.project) return;
    const changed = op(s.project);
    if (changed === s.project) return;
    set(afterChange(s, refitEffects(s.project, changed, s.past[s.past.length - 1])));
  },
  addPostRecord: (record) => {
    const s = get();
    if (!s.project) return;
    set({ project: { ...s.project, posts: [...s.project.posts, record] }, dirty: true });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev || !s.project) return;
    set({ ...afterChange(s, withPosts(prev, s.project.posts)), past: s.past.slice(0, -1), future: [s.project, ...s.future] });
  },
  redo: () => {
    const s = get();
    const [next, ...rest] = s.future;
    if (!next || !s.project) return;
    set({ ...afterChange(s, withPosts(next, s.project.posts)), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: rest });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  select: (id) => set(id ? { selectedClipId: id, selectedOverlayId: null, selectedEffectId: null } : { selectedClipId: null }),
  selectOverlay: (id) => set(id ? { selectedOverlayId: id, selectedClipId: null, selectedEffectId: null } : { selectedOverlayId: null }),
  selectEffect: (id) => set(id ? { selectedEffectId: id, selectedClipId: null, selectedOverlayId: null } : { selectedEffectId: null }),
  seek: (t) => {
    const p = get().project;
    set({ playhead: Math.max(0, Math.min(t, p ? totalDuration(p) : 0)) });
  },
  setPlaying: (b) => set({ isPlaying: b }),
  setZoom: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),
  markSaved: () => set({ dirty: false }),
  reset: () => set({ ...initial }),
}));
