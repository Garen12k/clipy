import { create } from "zustand";
import { totalDuration } from "./model/timeline";
import type { Project } from "./model/types";

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
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  select: (id: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (b: boolean) => void;
  setZoom: (pps: number) => void;
  markSaved: () => void;
  reset: () => void;
}

const initial = {
  project: null, missingSourceUris: [], selectedClipId: null, playhead: 0, isPlaying: false,
  pixelsPerSecond: DEFAULT_PPS, past: [], future: [], dirty: false,
};

function afterChange(s: EditorState, next: Project): Partial<EditorState> {
  const selected = s.selectedClipId && next.clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null;
  return { project: next, dirty: true, selectedClipId: selected, playhead: Math.min(s.playhead, totalDuration(next)) };
}

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
    const next = op(s.project);
    if (next === s.project) return;
    set(afterChange(s, next));
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev || !s.project) return;
    set({ ...afterChange(s, prev), past: s.past.slice(0, -1), future: [s.project, ...s.future] });
  },
  redo: () => {
    const s = get();
    const [next, ...rest] = s.future;
    if (!next || !s.project) return;
    set({ ...afterChange(s, next), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: rest });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  select: (id) => set({ selectedClipId: id }),
  seek: (t) => {
    const p = get().project;
    set({ playhead: Math.max(0, Math.min(t, p ? totalDuration(p) : 0)) });
  },
  setPlaying: (b) => set({ isPlaying: b }),
  setZoom: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),
  markSaved: () => set({ dirty: false }),
  reset: () => set({ ...initial }),
}));
