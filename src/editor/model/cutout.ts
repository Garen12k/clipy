import { transitionHandles } from "./timeline";
import { activeCutout, isPhoto, type Clip, type Project } from "./types";

/**
 * Remove background: which cut-out copy a clip uses, what it is called and what it covers. TypeScript only — the native render is
 * handed these numbers and writes one file. Raise CUTOUT_VERSION when a number that changes the copy changes (size, gap, quality):
 * copies rendered from the old numbers are then no longer used.
 */
export const CUTOUT_VERSION = 1;
/**
 * `maxSeconds`: the longest trimmed source range a video may have. `pad`: seconds rendered each side of the trim — whole, and never
 * less than the longest transition handle the export reads outside a trim (`TRANSITION_HANDLE_MAX`, timeline.ts). `videoMaxSide` /
 * `photoMaxSide`: the copy's long side, at most. `minFrameGap`: a frame closer than this to the last kept one is left out (about
 * 30 a second). `minPerson`: the share of the picture the people mask must cover in at least one measured frame. `alphaQuality`:
 * the see-through layer's quality (0 … 1). `bitsPerPixel`: the colour bitrate, per pixel and frame at 30 a second. `stillSeconds`:
 * the length of a photo's still movie. `exportOpacity`: a main clip's opacity is capped at this in the export so the compositor
 * draws the clip's background behind the see-through picture.
 */
export const CUTOUT = { maxSeconds: 60, pad: 2, videoMaxSide: 1920, photoMaxSide: 2560, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillSeconds: 60, exportOpacity: 0.999 } as const;
/** Whether the preview shows a VIDEO's cut-out (a photo's always shows): off = that kind plays its original and the Preview tag shows. */
export const CUTOUT_PREVIEW = { layerVideo: true, mainVideo: true };

const EPS = 1e-6;
const SAFE_STEM = "[A-Za-z0-9_-]+";
const WHOLE = "(0|[1-9][0-9]{0,15})";
/** A finished copy's name, as `cutoutFileName` writes it (built once: `parseCutoutName` runs on every playhead tick). */
const PHOTO_NAME = new RegExp(`^(${SAFE_STEM})-c${CUTOUT_VERSION}-photo\\.png$`);
const VIDEO_NAME = new RegExp(`^(${SAFE_STEM})-c${CUTOUT_VERSION}-${WHOLE}-${WHOLE}\\.mov$`);
/** The longest a stem's own text may be before it is cut (a check of the whole name is added, so two long names stay apart). */
const STEM_MAX = 80;
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
/** FNV-1a over the text's UTF-16 units, as eight hex digits: the same text gives the same check on every phone and in every run. */
function check(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
/**
 * The source's file name without its extension, as one safe path component (letters, digits, "_" and "-"). The app's own media files
 * are "<uuid>.<ext>" (storage.ts) and keep their name as it is, like a sound copy's. A name that had to be changed to be safe (other
 * characters, nothing left, too long, or a leading "part-", which is what a half-written copy is called) also carries a check of the
 * whole file name, so two such sources never share a stem. Two files that differ ONLY in their extension do share one: storage.ts
 * never writes such a pair.
 */
function stemOf(uri: string): string {
  const file = String(uri).split("/").pop() ?? "";
  const raw = file.replace(/\.[A-Za-z0-9]+$/, "");
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^part-/, "part_").slice(0, STEM_MAX);
  return safe === raw && safe !== "" ? safe : `${safe === "" ? "file" : safe}-${check(file)}`;
}
/**
 * The source seconds a clip plays, straight from its trim (never from its speed: only timeline.ts knows speed, and a copy holds
 * source time). Total: a number that is not one counts as the start, a backwards trim as nothing, a trim past the file's end as the
 * file's end; a length that is not known does not cap.
 */
function sourceSpan(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { start: number; end: number } {
  const length = num(c.sourceDuration, 0) > 0 ? c.sourceDuration : Infinity;
  const start = Math.min(Math.max(0, num(c.trimStart, 0)), length);
  const end = Math.min(Math.max(start, num(c.trimEnd, start)), length);
  return { start, end };
}

/**
 * The source seconds a new copy of this clip would hold: its trim plus `pad` each side, on whole seconds, inside the file. Always at
 * least a second. The pad is the same at every speed (a copy's name never changes with the clip's speed) and is never less than a
 * transition handle, so the copy planned for a clip always covers it (`coveringCopy`).
 */
export function cutoutRange(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { from: number; to: number } {
  const { start, end } = sourceSpan(c);
  const fileEnd = num(c.sourceDuration, 0) > 0 ? Math.ceil(c.sourceDuration) : Infinity;
  const from = Math.max(0, Math.floor(start - CUTOUT.pad));
  const to = Math.max(from + 1, Math.min(fileEnd, Math.ceil(end + CUTOUT.pad)));
  return { from, to };
}
/**
 * A copy's file name: `abc-c1-3000-11000.mov` (a video's range in milliseconds) or `p-c1-photo.png` (a photo has no range). The
 * same source, kind and range always give the same name; a different range or kind gives another. The two ends are written in order.
 */
export function cutoutFileName(sourceUri: string, photo: boolean, from = 0, to = 0): string {
  const head = `${stemOf(sourceUri)}-c${CUTOUT_VERSION}`;
  if (photo) return `${head}-photo.png`;
  const ms = (seconds: number): number => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(num(seconds, 0) * 1000)));
  const a = ms(from), b = ms(to);
  return `${head}-${Math.min(a, b)}-${Math.max(a, b)}.mov`;
}
/** The still movie written beside a photo's PNG (what the export plays). */
export const cutoutStillName = (pngName: string): string => String(pngName).replace(/\.png$/, ".mov");
/**
 * What a file name in the cut-out folder says, or null for anything that is not a finished copy of this version (a part file, a
 * photo's still movie, another version, a range that is empty or not written the way `cutoutFileName` writes it).
 */
export function parseCutoutName(name: string): { stem: string; photo: boolean; from: number; to: number } | null {
  const text = String(name);
  if (text.startsWith("part-")) return null;
  const photo = PHOTO_NAME.exec(text);
  if (photo) return { stem: photo[1], photo: true, from: 0, to: 0 };
  const video = VIDEO_NAME.exec(text);
  if (!video) return null;
  const from = Number(video[2]), to = Number(video[3]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return null;
  return { stem: video[1], photo: false, from: from / 1000, to: to / 1000 };
}

/**
 * The known copy this clip can use: a photo's own; for a video the SMALLEST copy of its file whose range holds everything an export
 * can read for the clip — its trim AND the transition handle each side of it (`transitionHandles`: half a second of output at the
 * clip's edge speed, up to `pad` seconds of source; the file's own ends need nothing beyond them). A copy that only contained the
 * trim would have nothing where a transition into the clip begins, and the transition would start late with a jump. Of two as long
 * as each other, the earlier: the order of `known` never decides. null when there is none. So a clip trimmed INWARDS, or split,
 * keeps its copy, and one trimmed OUTWARDS (or sped up) until a handle passes either end of it has none until a new copy is made.
 */
export function coveringCopy(known: readonly string[], c: Clip): string | null {
  if (isPhoto(c)) {
    const name = cutoutFileName(c.sourceUri, true);
    return known.includes(name) ? name : null;
  }
  const stem = stemOf(c.sourceUri);
  const { start, end } = sourceSpan(c);
  const handles = transitionHandles(c);
  const first = Math.max(0, start - handles.head);
  const last = Math.min(num(c.sourceDuration, 0) > 0 ? c.sourceDuration : Infinity, end + handles.tail);
  let best: { name: string; from: number; length: number } | null = null;
  for (const name of known) {
    const copy = parseCutoutName(name);
    if (!copy || copy.photo || copy.stem !== stem || copy.from > first + EPS || copy.to < last - EPS) continue;
    const length = copy.to - copy.from;
    if (best === null || length < best.length || (length === best.length && copy.from < best.from)) best = { name, from: copy.from, length };
  }
  return best === null ? null : best.name;
}

/** Why a clip cannot have its background removed: it plays backwards, or (a video) its trimmed source is longer than `maxSeconds`. */
export type CutoutRefusal = "reversed" | "tooLong";
export function cutoutRefusal(c: Clip): CutoutRefusal | null {
  if (c.reversed) return "reversed";
  if (isPhoto(c)) return null;
  const { start, end } = sourceSpan(c);
  return end - start > CUTOUT.maxSeconds + EPS ? "tooLong" : null;
}

/** One copy: its file name, the source it is rendered from and what it holds. */
export interface NeededCutout { name: string; sourceUri: string; photo: boolean; from: number; to: number }
/** The copy a clip uses: a known one that covers it, else the one that would be rendered for it now. */
export function cutoutNeed(c: Clip, known: readonly string[]): NeededCutout {
  const photo = isPhoto(c);
  const covering = coveringCopy(known, c);
  const held = covering === null ? null : parseCutoutName(covering);
  if (covering !== null && held !== null) return { name: covering, sourceUri: c.sourceUri, photo, from: held.from, to: held.to };
  const range = photo ? { from: 0, to: 0 } : cutoutRange(c);
  return { name: cutoutFileName(c.sourceUri, photo, range.from, range.to), sourceUri: c.sourceUri, photo, from: range.from, to: range.to };
}
/**
 * Every different copy the project needs, main clips first, then layers: for each clip whose switch is on (`activeCutout`), whose
 * file is there and that can be served (`cutoutRefusal`). `known` = the copies that exist or are being rendered.
 */
export function neededCutouts(p: Project, missing: readonly string[], known: readonly string[]): NeededCutout[] {
  const out: NeededCutout[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (!activeCutout(c) || missing.includes(c.sourceUri) || cutoutRefusal(c) !== null) continue;
    const need = cutoutNeed(c, known);
    if (!out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}

/** The copy's pixel size for an upright picture: the long side at most `maxSide`, both sides even, at least 2 (the rule of `CutoutRender.evenSize`). */
export function cutoutSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const w = Number.isFinite(width) && width > 0 ? width : 2, h = Number.isFinite(height) && height > 0 ? height : 2;
  const k = Number.isFinite(maxSide) && maxSide > 0 ? Math.min(1, maxSide / Math.max(w, h)) : 1;
  const even = (v: number): number => Math.max(2, Math.floor(Math.round(v * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}
/** The longest one copy may take: a minute for a photo; a minute plus twenty times its length for a video. */
export function cutoutDeadlineMs(n: Pick<NeededCutout, "photo" | "from" | "to">): number {
  return n.photo ? 60000 : 60000 + 20000 * Math.max(0, num(n.to - n.from, 0));
}
/** About how many bytes a new copy of this clip takes: the colour bitrate plus a fifth for the see-through layer plus the sound. A photo: 5 MB. */
export function cutoutBytes(c: Clip): number {
  if (isPhoto(c)) return 5000000;
  const { from, to } = cutoutRange(c);
  const size = cutoutSize(c.width, c.height, CUTOUT.videoMaxSide);
  const bits = Math.max(1000000, size.width * size.height * 30 * CUTOUT.bitsPerPixel) * 1.2 + 128000;
  return Math.round((bits * (to - from)) / 8);
}
