import { create } from "zustand";
import { DEFAULT_PAUSE_CHOICE, type PauseChoice, type PauseCut } from "./model/pauses";

/**
 * Remove pauses, in memory for the session: the chips' choice, and the cuts the open strip would make (`shades`, null when it is closed
 * or finds none) — read by the selected clip in the timeline. Never in the project, never in undo, never on disk. Written only by
 * RemovePausesSheet.tsx.
 */
export const usePauses = create<{ choice: PauseChoice; shades: { clipId: string; cuts: PauseCut[] } | null }>(() => ({ choice: DEFAULT_PAUSE_CHOICE, shades: null }));
