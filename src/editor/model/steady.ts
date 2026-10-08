import { cutoutRange, cutoutSize } from "./cutout";
import { isSlowed, slowestSpeed, transitionHandles } from "./timeline";
import { isPhoto, STABILIZE_IDS, type Clip, type Project, type StabilizeId } from "./types";

/**
 * Stabilize and Smooth slow motion: which copy a clip uses, what it is called and what it covers. One clip, one copy — steadied,
 * filled with in-between frames, or both. TypeScript only: the phone is handed these numbers. Raise STEADY_VERSION when a number
 * that changes the copy changes (a zoom, a window, a grid, the blend): copies rendered from the old numbers are then no longer used.
 */
export const STEADY_VERSION = 1;
/**
 * `maxSeconds`: the longest trimmed source range a clip may have. `maxSide`: the copy's long side, at most. `minFrameGap`: a source
 * frame closer than this to the last kept one is left out (30 and 60 a second stay whole; 240 becomes 120). `measureSide`: the long
 * side of the picture Vision is shown. `bitsPerPixel`: the bitrate, per pixel and frame at 30 a second. `blendFloor`: an in-between
 * frame this close (as a share of the gap) to a source frame IS that frame. `cutShift`: a measured step larger than this share of
 * the picture is a cut, not shake. `scaleX` / `scaleY`: what one unit of Vision's step is as a correction (1 as reported; −1 if a
 * steadied clip shakes MORE on that axis). `measureShare`: the part of the percent that measuring takes.
 */
export const STEADY = { maxSeconds: 60, maxSide: 1920, minFrameGap: 0.008, measureSide: 512, bitsPerPixel: 0.12, blendFloor: 0.02, cutShift: 0.2, scaleX: 1, scaleY: 1, measureShare: 0.4 } as const;
/** What a strength means: its number in a copy's name, the fixed zoom that hides the moving edges, and the seconds of path each side a frame's calm position is averaged over. */
export const STEADY_LEVELS: Record<StabilizeId, { level: number; zoom: number; radius: number }> = {
  low: { level: 1, zoom: 1.05, radius: 0.25 }, medium: { level: 2, zoom: 1.1, radius: 0.5 }, high: { level: 3, zoom: 1.15, radius: 1 },
};
/**
 * Smooth slow motion: frames per SOURCE second of a copy — `fullGrid` when the clip's slowest stretch is `slowBelow` or faster,
 * `slowGrid` when it is slower. `cutDifference`: two neighbouring source frames more different than this are a CUT inside the clip
 * (it was edited before it was imported) and get no blended frames — blending two shots is a ghosted double picture. The number is
 * the mean, over the picture and its three colours, of how far apart the two frames are (0 = the same, 1 = black against white),
 * measured by the phone (`SteadyRender.difference`) and compared there; 0 = never asked. Ordinary movement between two neighbouring
 * frames measures about 0.01 – 0.05 and a fast pan up to about 0.1; two different shots usually 0.15 – 0.35. Too HIGH: a cut between
 * two similar shots still ghosts — lower it. Too LOW: fast movement steps instead of flowing — raise it. The dev server's log says
 * what was measured ("steady cuts": the pairs taken as cuts and the largest difference seen in the copy). Changing it needs no build
 * and no new STEADY_VERSION: smooth copies are swept by `SMOOTH_MARK` (`openSteady`).
 */
export const SMOOTH = { fullGrid: 60, slowGrid: 120, slowBelow: 0.5, cutDifference: 0.12 } as const;
/**
 * The name of an empty file in a project's steady folder that says: every smooth copy here was made by a phone that tells cuts,
 * with THIS threshold. Without it (copies from an older build, or from another threshold) `openSteady` removes the smooth copies
 * once, so they are made again; copies that are only steadied are never touched. Never a copy's name (`parseSteadyName` → null).
 */
export const SMOOTH_MARK = `cuts-${Math.round(SMOOTH.cutDifference * 1000)}`;
/** Whether the preview shows a steady copy: off = that kind of clip plays its original and the Preview tag shows. */
export const STEADY_PREVIEW = { layerVideo: true, mainVideo: true };

const EPS = 1e-6;
const SAFE_STEM = "[A-Za-z0-9_-]+";
const WHOLE = "(0|[1-9][0-9]{0,15})";
const NAME = new RegExp(`^(${SAFE_STEM})-s${STEADY_VERSION}-([0-3])-(0|[1-9][0-9]{0,2})-${WHOLE}-${WHOLE}\\.mov$`);
const STEM_MAX = 80;
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
/** FNV-1a over the text's UTF-16 units, as eight hex digits (the cut-out copies' check). */
function check(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
/** The source's file name without its extension as one safe path component — the rule of cutout.ts, so a file's copies of both kinds share a stem (`steady.test.ts` compares the two). */
function stemOf(uri: string): string {
  const file = String(uri).split("/").pop() ?? "";
  const raw = file.replace(/\.[A-Za-z0-9]+$/, "");
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^part-/, "part_").slice(0, STEM_MAX);
  return safe === raw && safe !== "" ? safe : `${safe === "" ? "file" : safe}-${check(file)}`;
}
/** The source seconds a clip plays, straight from its trim (a copy holds source time; speed is timeline.ts's business). */
function sourceSpan(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { start: number; end: number; length: number } {
  const length = num(c.sourceDuration, 0) > 0 ? c.sourceDuration : Infinity;
  const start = Math.min(Math.max(0, num(c.trimStart, 0)), length);
  const end = Math.min(Math.max(start, num(c.trimEnd, start)), length);
  return { start, end, length };
}

/** `level`: 0 = no Stabilize, 1–3 = low / medium / high. `grid`: 0 = the source's own frames, else frames per source second. Never both 0. */
export interface SteadySetting { level: number; grid: number }
/**
 * What copy a clip has: null for none. A video that plays forwards and has no Remove background, with a Stabilize strength and /
 * or a Smooth slow motion switch that counts — it counts only while the clip is slowed (`isSlowed`), and then the clip's slowest
 * stretch picks the grid. The ONE rule the queue, the preview, the strips and the export go by.
 */
export function steadyOf(c: Clip): SteadySetting | null {
  if (isPhoto(c) || c.reversed || c.cutout === true) return null;
  const level = c.stabilize !== undefined && (STABILIZE_IDS as readonly string[]).includes(c.stabilize) ? STEADY_LEVELS[c.stabilize].level : 0;
  const grid = c.smooth === true && isSlowed(c) ? (slowestSpeed(c) < SMOOTH.slowBelow - 1e-9 ? SMOOTH.slowGrid : SMOOTH.fullGrid) : 0;
  return level === 0 && grid === 0 ? null : { level, grid };
}
/** A strength's zoom and window by its number; null for 0 (no Stabilize) and for a number that is no strength. */
export function levelRule(level: number): { zoom: number; radius: number } | null {
  const found = STABILIZE_IDS.map((id) => STEADY_LEVELS[id]).find((l) => l.level === level);
  return found ? { zoom: found.zoom, radius: found.radius } : null;
}

/** Why a clip cannot have a copy although its setting is on: its trimmed source is longer than `maxSeconds`. */
export type SteadyRefusal = "tooLong";
export function steadyRefusal(c: Clip): SteadyRefusal | null {
  const { start, end } = sourceSpan(c);
  return end - start > STEADY.maxSeconds + EPS ? "tooLong" : null;
}

/** A copy's file name: `abc-s1-2-60-2000-12000.mov` — version, strength, grid, the range in milliseconds (written in order). */
export function steadyFileName(sourceUri: string, setting: SteadySetting, from: number, to: number): string {
  const ms = (seconds: number): number => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(num(seconds, 0) * 1000)));
  const whole = (v: number): number => Math.max(0, Math.round(num(v, 0)));
  const a = ms(from), b = ms(to);
  return `${stemOf(sourceUri)}-s${STEADY_VERSION}-${whole(setting.level)}-${whole(setting.grid)}-${Math.min(a, b)}-${Math.max(a, b)}.mov`;
}
/** What a file name in the steady folder says, or null for anything that is not a finished copy of this version. */
export function parseSteadyName(name: string): { stem: string; level: number; grid: number; from: number; to: number } | null {
  const text = String(name);
  if (text.startsWith("part-")) return null;
  const found = NAME.exec(text);
  if (!found) return null;
  const level = Number(found[2]), grid = Number(found[3]), from = Number(found[4]), to = Number(found[5]);
  if ((level === 0 && grid === 0) || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return null;
  return { stem: found[1], level, grid, from: from / 1000, to: to / 1000 };
}

/**
 * The known copy this clip can use for `setting`: the SMALLEST copy of its file with exactly that strength and grid whose range
 * holds the clip's trim and the transition handle each side of it (`transitionHandles`; the file's own ends need nothing beyond
 * them) — the rule of the cut-out copies. Of two as long as each other, the earlier. null when there is none.
 */
export function coveringSteady(known: readonly string[], c: Clip, setting: SteadySetting): string | null {
  const stem = stemOf(c.sourceUri);
  const { start, end, length } = sourceSpan(c);
  const handles = transitionHandles(c);
  const first = Math.max(0, start - handles.head);
  const last = Math.min(length, end + handles.tail);
  let best: { name: string; from: number; length: number } | null = null;
  for (const name of known) {
    const copy = parseSteadyName(name);
    if (!copy || copy.stem !== stem || copy.level !== setting.level || copy.grid !== setting.grid || copy.from > first + EPS || copy.to < last - EPS) continue;
    const span = copy.to - copy.from;
    if (best === null || span < best.length || (span === best.length && copy.from < best.from)) best = { name, from: copy.from, length: span };
  }
  return best === null ? null : best.name;
}

/** The copy's video bits per second: by its pixels (at most `maxSide` on the long side), more for a denser grid (in-between frames cost little). */
export function steadyBitRate(width: number, height: number, grid: number): number {
  const size = cutoutSize(width, height, STEADY.maxSide);
  const base = Math.max(1000000, size.width * size.height * 30 * STEADY.bitsPerPixel);
  return Math.round(base * (grid >= SMOOTH.slowGrid ? 2 : grid > 0 ? 1.4 : 1));
}

/** One copy: its file name, the source it is rendered from, what it is and what it holds. */
export interface NeededSteady { name: string; sourceUri: string; level: number; grid: number; from: number; to: number; bitRate: number }
/** The copy a clip uses: a known one that covers it, else the one that would be rendered for it now (the cut-out's range: the trim plus the longest transition handle each side, on whole seconds). null for a clip without a copy. */
export function steadyNeed(c: Clip, known: readonly string[]): NeededSteady | null {
  const setting = steadyOf(c);
  if (setting === null) return null;
  const bitRate = steadyBitRate(c.width, c.height, setting.grid);
  const covering = coveringSteady(known, c, setting);
  const held = covering === null ? null : parseSteadyName(covering);
  if (covering !== null && held !== null) return { name: covering, sourceUri: c.sourceUri, ...setting, from: held.from, to: held.to, bitRate };
  const range = cutoutRange(c);
  return { name: steadyFileName(c.sourceUri, setting, range.from, range.to), sourceUri: c.sourceUri, ...setting, from: range.from, to: range.to, bitRate };
}
/** Every different copy the project needs, main clips first, then layers: for each clip that has a setting, whose file is there and that is not too long. */
export function neededSteady(p: Project, missing: readonly string[], known: readonly string[]): NeededSteady[] {
  const out: NeededSteady[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (missing.includes(c.sourceUri) || steadyRefusal(c) !== null) continue;
    const need = steadyNeed(c, known);
    if (need !== null && !out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}

/** About how many bytes a new copy of this clip with `setting` takes: the video bitrate plus the sound, over the copy's range. */
export function steadyBytes(c: Clip, setting: SteadySetting): number {
  const { from, to } = cutoutRange(c);
  return Math.round(((steadyBitRate(c.width, c.height, setting.grid) + 128000) * (to - from)) / 8);
}
/** The longest the two halves of one copy may take, each counted from the moment the phone is handed it: a minute plus ten times the range for measuring, a minute plus thirty times for writing. */
export function steadyDeadlineMs(n: Pick<NeededSteady, "from" | "to">): { measure: number; render: number } {
  const length = Math.max(0, num(n.to - n.from, 0));
  return { measure: 60000 + 10000 * length, render: 60000 + 30000 * length };
}
