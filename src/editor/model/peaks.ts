/**
 * The outline ("waveform") of a sound FILE, and how a timeline bar draws it. Pure: no React, no store, no file system, no phone.
 * TypeScript only — the phone answers with numbers (`soundPeaks`, SoundPeaks.swift) and nothing here is mirrored in Swift.
 *
 * One outline per FILE, for its whole length, at one density (`PEAKS.perSecond` slices a second; a file longer than
 * `PEAKS.calls` × `PEAKS.perCall` slices at that density gets that many slices and so a lower density). It is the ORIGINAL file's
 * outline: a track's Voice / Sound / Reduce-noise copy changes how the sound sounds, not where it is loud, and waiting for a render
 * would leave the bar blank. Volume, fades and ducking are not in it either: the bar shows the SHAPE of the sound, not its level.
 */
export const PEAKS = {
  /** Slices per second of sound: 20 ms each — 1.2 pt at 60 pt/s, 4 pt at the largest zoom (200 pt/s), where a mark is 3 pt. */
  perSecond: 50,
  /** The most values the phone gives in one answer (`SoundPeaks.most`) and the fewest (`SoundPeaks.fewest`). */
  perCall: 2000, fewest: 16,
  /** The most native calls one file costs: 24 000 slices, eight minutes at the full density. A longer file is cut coarser. */
  calls: 12,
  /** Part of the cache file's name: raise it when a number here changes what is stored. */
  version: 1,
} as const;

/** One native call: the seconds of the file and how many values. `to` 0 = to the end of the file (a file whose length is not known). */
export type PeaksCall = { from: number; to: number; count: number };
/** What the phone answered for one call (`SoundPeaksResult`). */
export type PeaksAnswer = { peaks: readonly number[]; from: number; to: number };
/**
 * A file's outline: `levels[i]` (0 … 255) is the loudest moment of the i-th of `levels.length` equal slices of `duration` seconds,
 * and `top` the largest of them.
 */
export type Peaks = { duration: number; levels: Uint8Array; top: number };

const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The calls a file `duration` seconds long costs: consecutive stretches that together are the whole file, each with 16 … 2000
 * slices, at most `PEAKS.calls` of them. 3 s → one call of 150; 40 s → one of 2000; 3 min → five of 1800 (36 s each); 4 min → six
 * of 2000; 40 min → twelve of 2000 (200 s each: ten slices a second). A length that is not known → one call, to the end.
 */
export function peaksPlan(duration: number): PeaksCall[] {
  if (!known(duration) || duration <= 0) return [{ from: 0, to: 0, count: PEAKS.perCall }];
  const total = Math.max(PEAKS.fewest, Math.min(PEAKS.calls * PEAKS.perCall, Math.round(duration * PEAKS.perSecond)));
  const calls = Math.ceil(total / PEAKS.perCall);
  const edge = (i: number): number => Math.round((i * total) / calls);
  const out: PeaksCall[] = [];
  for (let i = 0; i < calls; i++) out.push({ from: (edge(i) / total) * duration, to: i === calls - 1 ? duration : (edge(i + 1) / total) * duration, count: edge(i + 1) - edge(i) });
  return out;
}

const byte = (v: unknown): number => (known(v) ? Math.round(Math.min(1, Math.max(0, v)) * 255) : 0);
const topOf = (levels: Uint8Array): number => { let top = 0; for (let i = 0; i < levels.length; i++) if (levels[i] > top) top = levels[i]; return top; };

/**
 * The answers of a plan's calls as one outline, or null when they are not that plan's (a call without an answer, an answer without
 * values). Every slice is looked up at ITS OWN TIME in the stretch the phone says it read — a file a little shorter than the project
 * believes ends in silence instead of being stretched — and a value that is not a number is silence.
 */
export function assemblePeaks(plan: readonly PeaksCall[], answers: readonly PeaksAnswer[]): Peaks | null {
  if (!plan.length || answers.length !== plan.length) return null;
  const whole = plan[plan.length - 1].to > 0 ? plan[plan.length - 1].to : answers[answers.length - 1]?.to;
  if (!known(whole) || whole <= 0) return null;
  const levels = new Uint8Array(plan.reduce((n, c) => n + c.count, 0));
  let at = 0;
  for (let i = 0; i < plan.length; i++) {
    const call = plan[i], a = answers[i];
    if (!a || !Array.isArray(a.peaks) || a.peaks.length === 0 || !known(a.from) || !known(a.to)) return null;
    const end = call.to > 0 ? call.to : whole, n = a.peaks.length, read = a.to - a.from;
    for (let j = 0; j < call.count; j++, at++) {
      const t = call.from + ((j + 0.5) * (end - call.from)) / call.count;
      const k = read > 0 ? Math.floor(((t - a.from) / read) * n) : -1;
      levels[at] = k >= 0 && k < n ? byte(a.peaks[k]) : 0;
    }
  }
  return { duration: whole, levels, top: topOf(levels) };
}

const stemOf = (uri: string): string => (uri.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
/** The cache file of a source's outline, in the project's `peaks` folder: the source's own name (as a sound copy's is), so it is found again. */
export const peaksFileName = (sourceUri: string): string => `${stemOf(String(sourceUri))}-p${PEAKS.version}.json`;

const HEX = "0123456789abcdef";
/** The cache file's text: two hex digits a slice — about 18 KB for a three-minute song, 48 KB at the most. */
export function encodePeaks(sourceUri: string, p: Peaks): string {
  let hex = "";
  for (let i = 0; i < p.levels.length; i++) hex += HEX[p.levels[i] >> 4] + HEX[p.levels[i] & 15];
  return JSON.stringify({ clipyPeaks: PEAKS.version, name: peaksFileName(sourceUri), duration: p.duration, count: p.levels.length, hex });
}
/** How far a cached outline's length may be from the length the project knows for the file (seconds) and still be that file's. */
const SAME_LENGTH = 0.05;
/**
 * The outline in a cache file's text, or null for anything that is not exactly one written by `encodePeaks` for this source: text
 * that is not JSON, another version, another file's name, a length that is not this file's (`duration`: what the project knows; not
 * a positive number = not checked), a count that does not match, a character that is not a hex digit. Never throws.
 */
export function decodePeaks(text: unknown, sourceUri: string, duration: number): Peaks | null {
  let v: unknown;
  try { v = JSON.parse(String(text)); } catch { return null; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (r.clipyPeaks !== PEAKS.version || r.name !== peaksFileName(sourceUri)) return null;
  if (!known(r.duration) || r.duration <= 0 || !known(r.count) || typeof r.hex !== "string") return null;
  if (!Number.isInteger(r.count) || r.count < 1 || r.count > PEAKS.calls * PEAKS.perCall || r.hex.length !== r.count * 2 || !/^[0-9a-f]*$/.test(r.hex)) return null;
  if (known(duration) && duration > 0 && Math.abs(duration - r.duration) > SAME_LENGTH) return null;
  const levels = new Uint8Array(r.count);
  for (let i = 0; i < r.count; i++) levels[i] = parseInt(r.hex.slice(i * 2, i * 2 + 2), 16);
  return { duration: r.duration, levels, top: topOf(levels) };
}

/**
 * How a bar draws an outline: thin upright marks, mirrored about the bar's middle, in pieces ("segments") of a fixed width.
 * A mark and a segment are anchored to the FILE's time, not to the bar: mark k is the file's seconds k × pitch / zoom …
 * (k + 1) × pitch / zoom and stands at x = k × pitch from the file's own start, whatever the bar's trim. So a segment's picture
 * depends on the file, the zoom and its number only — moving, trimming or splitting a bar builds nothing again; the bar just shows
 * another part of the same row (shifted by its trim-in × zoom, clipped by its own edges).
 */
export const WAVE = {
  /** One mark every 3 pt, 2 pt wide: 50 ms of sound at 60 pt/s, 15 ms at 200 pt/s (a slice is 20 ms there, so a mark is one slice). */
  pitch: 3, mark: 2,
  /** A segment's width: 100 marks, one small picture. */
  segment: 300,
  /** Segments are drawn only this far past each side of the screen … */
  margin: 300,
  /** … and never more than this many for one bar (800 marks), whatever the screen and the zoom. */
  most: 8,
  /** A file is drawn against its own loudest moment (a quiet voice fills the bar as a loud song does) — but never against less than this, so a silent file stays flat. */
  floor: 0.05,
  /** Loudness to height: a little steeper than straight, so a loud song still shows where it drops. */
  curve: 1.5,
  /** The thinnest a mark is, top to bottom: silence is a flat thin line. */
  thin: 1,
} as const;

const MARKS = WAVE.segment / WAVE.pitch;
const NONE: number[] = [];

/**
 * The marks of segment `index` at `zoom` points a second: each 0 … 1 (its height as a part of the bar's), the loudest slice of its
 * stretch of the file against the file's loudest (`WAVE.floor`, `WAVE.curve`). Only the marks that begin before the file ends;
 * no marks (never a throw) for an outline, a zoom or an index that is not usable.
 */
export function segmentMarks(p: Peaks | null | undefined, zoom: number, index: number): number[] {
  const n = p?.levels?.length ?? 0;
  if (!p || n === 0 || !known(p.duration) || p.duration <= 0 || !known(zoom) || zoom <= 0 || !Number.isInteger(index) || index < 0) return NONE;
  const rate = n / p.duration, full = Math.max(known(p.top) ? p.top : 0, WAVE.floor * 255);
  const out: number[] = [];
  for (let m = 0; m < MARKS; m++) {
    const from = ((index * MARKS + m) * WAVE.pitch) / zoom;
    if (from >= p.duration) break;
    const first = Math.min(n - 1, Math.floor(from * rate + 1e-9));
    const last = Math.min(n - 1, Math.max(first, Math.ceil((from + WAVE.pitch / zoom) * rate - 1e-9) - 1));
    let top = 0;
    for (let i = first; i <= last; i++) if (p.levels[i] > top) top = p.levels[i];
    out.push(Math.min(1, Math.pow(top / full, WAVE.curve)));
  }
  return out;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
/** The marks as one path of upright lines in a box `height` points high (to be stroked `WAVE.mark` wide): mark m is centred on m × pitch + mark / 2. */
export function segmentPath(marks: readonly number[], height: number): string {
  if (!known(height) || height <= 0) return "";
  const mid = height / 2;
  let d = "";
  for (let m = 0; m < marks.length; m++) {
    const half = Math.max(WAVE.thin / 2, ((known(marks[m]) ? Math.min(1, Math.max(0, marks[m])) : 0) * height) / 2);
    d += `M${m * WAVE.pitch + WAVE.mark / 2} ${round2(mid - half)}V${round2(mid + half)}`;
  }
  return d;
}

/** The paths already built for an outline, at ONE zoom (the last asked): a segment that comes back on screen, or the other half of a split bar, builds nothing. */
const built = new WeakMap<Peaks, { zoom: number; height: number; paths: Map<number, string> }>();
export function segmentPathOf(p: Peaks, zoom: number, index: number, height: number): string {
  let cache = built.get(p);
  if (!cache || cache.zoom !== zoom || cache.height !== height) { cache = { zoom, height, paths: new Map() }; built.set(p, cache); }
  let d = cache.paths.get(index);
  if (d === undefined) { d = segmentPath(segmentMarks(p, zoom, index), height); cache.paths.set(index, d); }
  return d;
}

/** What decides which segments of a bar are drawn. `zoom`: the zoom the segments are built at (the zoom itself, or — during a pinch — the one they are stretched from). */
export type WaveWindow = {
  /** The playhead and the bar's start on the timeline, its trim, the file's length — seconds. */
  playhead: number; start: number; trimStart: number; trimEnd: number; duration: number;
  zoom: number; pps: number;
  /** Half the screen's width, in points: the playhead stands at the screen's middle, so the screen shows playhead ± half / pps. */
  half: number;
};
/**
 * The segments to draw: those that hold a part of the bar's own stretch of the file (trim-in … trim-out, and no further than the
 * file) which is on screen or within `WAVE.margin` of it — `WAVE.most` at the most, nearest the playhead. Null when there is none.
 */
export function waveSegments(w: WaveWindow): { first: number; last: number } | null {
  const all = [w.playhead, w.start, w.trimStart, w.trimEnd, w.duration, w.zoom, w.pps, w.half];
  if (!all.every(known) || w.zoom <= 0 || w.pps <= 0 || w.half < 0) return null;
  const centre = w.playhead - w.start + w.trimStart, reach = (w.half + WAVE.margin) / w.pps;
  const from = Math.max(w.trimStart, 0, centre - reach), to = Math.min(w.trimEnd, w.duration, centre + reach);
  if (!(to > from)) return null;
  const at = (t: number): number => Math.floor((t * w.zoom) / WAVE.segment + 1e-9);
  let first = at(from), last = Math.max(first, Math.ceil((to * w.zoom) / WAVE.segment - 1e-9) - 1);
  if (last - first + 1 > WAVE.most) {
    const mid = Math.min(Math.max(at(centre), first), last);
    first = Math.max(first, Math.min(mid - WAVE.most / 2, last - WAVE.most + 1));
    last = first + WAVE.most - 1;
  }
  return { first, last };
}
