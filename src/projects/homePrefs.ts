import "expo-sqlite/localStorage/install";
import { DEFAULT_SORT, HOME_SORTS, type HomeSort } from "./homeOrder";

/**
 * The one key of Home's sort and pins, in the same synchronous localStorage as `src/auth/welcomeSeen.ts` (so Home's first render
 * already has them). A preference of THIS phone, never project data: pinning must not write project.json — that would change its
 * stamp and drop the project's kept undo history, move it in "Last edited" and cost a turn of its chain. Nothing outside this file
 * reads or writes the key.
 */
export const HOME_PREFS_KEY = "clipy.home.v1";
export const HOME_PREFS = { version: 1, idMax: 64 } as const;
/** `pins`: a SET of project ids (their order means nothing on screen). No limit: Home drops a pin as soon as its project is not listed. */
export interface HomePrefs { sort: HomeSort; pins: readonly string[] }
const defaults = (): HomePrefs => ({ sort: DEFAULT_SORT, pins: [] });

type Stored = { kind: "none" | "damaged" | "newer" } | { kind: "ok"; prefs: HomePrefs };

function cleanPins(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const id of v) if (typeof id === "string" && id.length > 0 && id.length <= HOME_PREFS.idMax && !out.includes(id)) out.push(id);
  return out;
}

/** The VERSION is read before the shape: newer = a newer Clipy's, kept as it is; damaged = anything without a whole version ≥ 1. */
function readStored(): Stored {
  let raw: string | null;
  try { raw = localStorage.getItem(HOME_PREFS_KEY); } catch { return { kind: "none" }; }
  if (raw === null) return { kind: "none" };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { kind: "damaged" }; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { kind: "damaged" };
  const { version, sort, pins } = v as { version?: unknown; sort?: unknown; pins?: unknown };
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return { kind: "damaged" };
  if (version > HOME_PREFS.version) return { kind: "newer" };
  const known = (HOME_SORTS as readonly unknown[]).includes(sort);
  return { kind: "ok", prefs: { sort: known ? (sort as HomeSort) : DEFAULT_SORT, pins: cleanPins(pins) } };
}

/** The stored sort and pins; nothing, junk, a newer value or storage that fails → Last edited and no pins. Never throws. */
export function loadHomePrefs(): HomePrefs {
  const s = readStored();
  return s.kind === "ok" ? s.prefs : defaults();
}

/** Writes them as version 1 — unless a newer Clipy's value is there (kept as it is; false). A damaged value is simply replaced. Never throws. */
export function saveHomePrefs(prefs: HomePrefs): boolean {
  if (readStored().kind === "newer") return false;
  try {
    localStorage.setItem(HOME_PREFS_KEY, JSON.stringify({ version: HOME_PREFS.version, sort: prefs.sort, pins: [...prefs.pins] }));
    return true;
  } catch { return false; }
}
