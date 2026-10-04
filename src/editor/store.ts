import { create } from "zustand";
import { fitEffects } from "./model/ops";
import { findItem, totalDuration } from "./model/timeline";
import { clampExportSettings, type EffectItem, type ExportSettings, type PostRecord, type Project } from "./model/types";

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
  selectedAudioId: string | null;
  /** Multi-select mode: the chosen MAIN clip ids (null = not in the mode). Transient — not saved, not undoable. */
  multiSelect: string[] | null;
  playhead: number;
  isPlaying: boolean;
  /** A voice-over is being recorded: the preview's audio players and the video are silent. Transient — not saved, not undoable. */
  recording: boolean;
  pixelsPerSecond: number;
  past: Project[];
  future: Project[];
  dirty: boolean;
  setProject: (p: Project, missingSourceUris?: string[]) => void;
  apply: (op: EditOp) => void;
  beginTransaction: () => void;
  applyTransient: (op: EditOp) => void;
  addPostRecord: (record: PostRecord) => void;
  setExportSettings: (s: ExportSettings) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  select: (id: string | null) => void;
  selectOverlay: (id: string | null) => void;
  selectEffect: (id: string | null) => void;
  selectAudio: (id: string | null) => void;
  enterMultiSelect: () => void;
  toggleMultiSelect: (id: string) => void;
  selectAllClips: () => void;
  exitMultiSelect: () => void;
  seek: (t: number) => void;
  setPlaying: (b: boolean) => void;
  setRecording: (v: boolean) => void;
  setZoom: (pps: number) => void;
  markSaved: () => void;
  reset: () => void;
}

const initial = {
  project: null, missingSourceUris: [], selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null, multiSelect: null, playhead: 0, isPlaying: false, recording: false,
  pixelsPerSecond: DEFAULT_PPS, past: [], future: [], dirty: false,
};

function afterChange(s: EditorState, next: Project): Partial<EditorState> {
  // `selectedClipId` holds a main clip's or a layer's id.
  const selected = s.selectedClipId && findItem(next, s.selectedClipId) ? s.selectedClipId : null;
  const selectedOverlay = s.selectedOverlayId && next.overlays.some((o) => o.id === s.selectedOverlayId) ? s.selectedOverlayId : null;
  const selectedEffect = s.selectedEffectId && next.effects.some((e) => e.id === s.selectedEffectId) ? s.selectedEffectId : null;
  const selectedAudio = s.selectedAudioId && next.audioTracks.some((t) => t.id === s.selectedAudioId) ? s.selectedAudioId : null;
  // Multi-select drops clips that are gone; the mode ends when none is left.
  let multiSelect = s.multiSelect;
  if (multiSelect) {
    const kept = multiSelect.filter((id) => next.clips.some((c) => c.id === id));
    if (kept.length === 0 && multiSelect.length > 0) multiSelect = null;
    else if (kept.length !== multiSelect.length) multiSelect = kept;
  }
  return { project: next, dirty: true, multiSelect, selectedClipId: selected, selectedOverlayId: selectedOverlay, selectedEffectId: selectedEffect, selectedAudioId: selectedAudio, playhead: Math.min(s.playhead, totalDuration(next)) };
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

/** Post records and export settings are not undoable: carry the live ones onto a restored snapshot (same object when unchanged). */
const withLive = (p: Project, live: Project): Project =>
  p.posts === live.posts && p.exportSettings === live.exportSettings ? p : { ...p, posts: live.posts, exportSettings: live.exportSettings };

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
  setExportSettings: (v) => {
    const s = get();
    if (!s.project) return;
    const next = clampExportSettings(v);
    if (next.fps === s.project.exportSettings.fps && next.quality === s.project.exportSettings.quality) return;
    set({ project: { ...s.project, exportSettings: next }, dirty: true });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev || !s.project) return;
    set({ ...afterChange(s, withLive(prev, s.project)), past: s.past.slice(0, -1), future: [s.project, ...s.future] });
  },
  redo: () => {
    const s = get();
    const [next, ...rest] = s.future;
    if (!next || !s.project) return;
    set({ ...afterChange(s, withLive(next, s.project)), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: rest });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  // Selection is exclusive across clip / overlay / effect / audio: selecting one clears the others; deselecting (null) clears only its own.
  select: (id) => set(id ? { selectedClipId: id, multiSelect: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null } : { selectedClipId: null }),
  selectOverlay: (id) => set(id ? { selectedOverlayId: id, multiSelect: null, selectedClipId: null, selectedEffectId: null, selectedAudioId: null } : { selectedOverlayId: null }),
  selectEffect: (id) => set(id ? { selectedEffectId: id, multiSelect: null, selectedClipId: null, selectedOverlayId: null, selectedAudioId: null } : { selectedEffectId: null }),
  selectAudio: (id) => set(id ? { selectedAudioId: id, multiSelect: null, selectedClipId: null, selectedOverlayId: null, selectedEffectId: null } : { selectedAudioId: null }),
  enterMultiSelect: () => {
    const s = get();
    if (!s.project) return;
    const seed = s.selectedClipId && s.project.clips.some((c) => c.id === s.selectedClipId) ? [s.selectedClipId] : [];
    set({ multiSelect: seed, selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
  },
  toggleMultiSelect: (id) => {
    const s = get();
    if (!s.multiSelect || !s.project?.clips.some((c) => c.id === id)) return;
    set({ multiSelect: s.multiSelect.includes(id) ? s.multiSelect.filter((x) => x !== id) : [...s.multiSelect, id] });
  },
  selectAllClips: () => {
    const s = get();
    if (!s.multiSelect || !s.project) return;
    set({ multiSelect: s.project.clips.map((c) => c.id) });
  },
  exitMultiSelect: () => set({ multiSelect: null }),
  seek: (t) => {
    const p = get().project;
    set({ playhead: Math.max(0, Math.min(t, p ? totalDuration(p) : 0)) });
  },
  setPlaying: (b) => set({ isPlaying: b }),
  setRecording: (v) => set({ recording: v }),
  setZoom: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),
  markSaved: () => set({ dirty: false }),
  reset: () => set({ ...initial }),
}));
