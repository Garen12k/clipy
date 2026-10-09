import { FILTERS, SPEED_CURVES } from "@/src/editor/effects";
import { clipDuration, clipStartTimes, timeToX } from "@/src/editor/model/timeline";
import { isPhoto, type Clip, type Project } from "@/src/editor/model/types";
import { formatDuration, formatSpeed } from "@/src/lib/format";
import { CLIP_AREA_HEIGHT, STRIP_HEIGHT } from "./timelineLayout";

/**
 * What is DRAWN on the timeline besides the clips and the bars — the time ruler, a clip's badges, the markers on the cuts and what a
 * narrow bar leaves out. Pure functions of the project, the zoom and a width: nothing here measures, scrolls or decides a height.
 *
 * How the pinned clip area (`CLIP_AREA_HEIGHT`, 120) is divided, top to bottom — its total is `timelineLayout`'s and is not changed:
 *   0–18    the time ruler (`RULER.height`)
 *   18–28   the beat ticks (`BEAT_BAND`), right above the clips
 *   28–92   the clips (`STRIP_HEIGHT`, centred as before)
 *   92–120  free, as before
 */
export const CLIP_TOP = (CLIP_AREA_HEIGHT - STRIP_HEIGHT) / 2;
export const RULER = {
  height: 18,
  /** Two labels are never closer than this (the widest label, "100:00" at the smallest size, is about 40 pt). */
  labelGap: 48,
  /** Two ticks are never closer than this. */
  tickGap: 6,
  /** At this zoom and tighter a second is wide enough for a label of its own. */
  everySecond: 120,
  /** The most labels and ticks a ruler is drawn with: a long project gets a coarser STEP (never marks left out here and there), not hundreds of views. */
  maxLabels: 120, maxTicks: 240,
  /** During a pinch the marks are kept and stretched with the content until the zoom is this many times (or one over it) the zoom they were built at. */
  stretch: 1.25,
  tick: 4, major: 7,
} as const;
/** Where the beat ticks start: right under the ruler. They end where the clips begin. */
export const BEAT_BAND = { top: RULER.height, height: CLIP_TOP - RULER.height } as const;

const LABEL_STEPS = [2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
const whole = (a: number, b: number) => Math.abs(a / b - Math.round(a / b)) < 1e-9;

/**
 * How far apart the ruler's labels and ticks are, in seconds. Labels: every 2 seconds; every second once a second is `everySecond`
 * points wide; coarser (5, 10, 15, 30 s, a minute …) when 2 seconds are narrower than `labelGap`. Ticks: every half second where
 * that leaves `tickGap` between them, else the next step that divides the label's. Both grow for a project too long for the caps.
 */
export function rulerSteps(pps: number, duration: number): { label: number; tick: number } {
  const z = Number.isFinite(pps) && pps > 0 ? pps : 1, d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const last = LABEL_STEPS[LABEL_STEPS.length - 1];
  const fits = (s: number) => s * z >= RULER.labelGap && d / s <= RULER.maxLabels;
  const label = z >= RULER.everySecond && d <= RULER.maxLabels ? 1 : LABEL_STEPS.find(fits) ?? last;
  const tick = TICK_STEPS.find((s) => s <= label && whole(label, s) && s * z >= RULER.tickGap && d / s <= RULER.maxTicks) ?? label;
  return { label, tick };
}

export type RulerMarks = { labels: { t: number; x: number; text: string }[]; ticks: { t: number; x: number; major: boolean }[] };
/** The ruler of a project `duration` seconds long at `pps`: every mark's x is `timeToX` of its time, the clips' own mapping. */
export function rulerMarks(pps: number, duration: number): RulerMarks {
  const { label, tick } = rulerSteps(pps, duration);
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const count = Math.floor(d / tick + 1e-9);
  const marks: RulerMarks = { labels: [], ticks: [] };
  for (let i = 0; i <= count; i++) {
    const t = Number((i * tick).toFixed(3)), x = timeToX(t, pps), major = whole(t, label);
    marks.ticks.push({ t, x, major });
    if (major) marks.labels.push({ t, x, text: formatDuration(t) });
  }
  return marks;
}

/**
 * The zoom the ruler's marks are built at. Outside a pinch (`hold` false): the zoom itself. During one: the zoom they were last built
 * at, until the zoom has moved more than `RULER.stretch` away from it — in between the same marks are only stretched (x × pps / built
 * is the time × pps, so a stretched mark stands where a fresh one would).
 */
export function rulerZoom(built: number, pps: number, hold: boolean): number {
  if (!hold || !(Number.isFinite(built) && built > 0) || !(Number.isFinite(pps) && pps > 0)) return pps;
  const r = pps / built;
  // A hair of slack: 60 → 75 is 1.25 exactly and must still be "within the step".
  return Math.max(r, 1 / r) > RULER.stretch + 1e-9 ? pps : built;
}

/** A mark on a clip. `photo` is drawn as a symbol (it has no words today either); `more` counts the marks that did not fit. */
export type ClipBadge = { id: "photo" | "filter" | "speed" | "reversed" | "more"; text: string };
export const BADGE = {
  /** A clip narrower than this shows no badge at all. */
  minClip: 100,
  /** The most badges shown; the rest collapse into a count. */
  max: 2,
  /** A badge's estimated width: this much a character, plus its padding; a symbol badge is `symbol` wide. */
  char: 6.5, pad: 8, symbol: 18, gap: 4,
  /** Where the row starts: past the border — and past the trim handle on a selected clip. */
  inset: 4, selectedInset: 20,
  /** A selected clip's badges end this far before the Move grip (28 pt wide, at the centre). */
  grip: 28, clear: 8,
} as const;

/** Everything a clip's marks say, in the order they are shown: a photo, the filter's name, the speed (or the curve's name), Reversed. */
export function clipMarks(clip: Clip): ClipBadge[] {
  const out: ClipBadge[] = [];
  if (isPhoto(clip)) out.push({ id: "photo", text: "Photo" });
  if (clip.filter && FILTERS[clip.filter]) out.push({ id: "filter", text: FILTERS[clip.filter].label });
  // One slot for speed: the curve's name when a curve is set, else the constant speed when it is not 1×.
  if (clip.speedCurve) out.push({ id: "speed", text: SPEED_CURVES[clip.speedCurve.id].label });
  else if (clip.speed !== 1) out.push({ id: "speed", text: formatSpeed(clip.speed) });
  if (clip.reversed) out.push({ id: "reversed", text: "Reversed" });
  return out;
}
const badgeWidth = (b: ClipBadge) => (b.id === "photo" ? BADGE.symbol : Math.ceil(b.text.length * BADGE.char) + BADGE.pad);
/** The room a clip `width` points wide has for its badge row. A selected clip's row runs from its trim handle to its Move grip. */
export const badgeRoom = (width: number, selected: boolean): number =>
  selected ? width / 2 - BADGE.grip / 2 - BADGE.clear - BADGE.selectedInset : width - 2 * BADGE.inset - 4;
/**
 * The badges a clip shows: none under `BADGE.minClip`; else its marks in order while they fit the room, two at most; what is left
 * out is a "+N" count when that fits too. Nothing is ever cut off or drawn past the clip.
 */
export function clipBadges(clip: Clip, width: number, selected: boolean): ClipBadge[] {
  const all = clipMarks(clip);
  if (!(width >= BADGE.minClip) || !all.length) return [];
  const room = badgeRoom(width, selected);
  const shown: ClipBadge[] = [];
  let used = 0;
  for (const b of all) {
    const w = badgeWidth(b) + (shown.length ? BADGE.gap : 0);
    if (shown.length >= BADGE.max || used + w > room) break;
    shown.push(b); used += w;
  }
  const left = all.length - shown.length;
  if (left > 0 && shown.length > 0) {
    const more: ClipBadge = { id: "more", text: `+${left}` };
    if (used + BADGE.gap + badgeWidth(more) <= room) shown.push(more);
  }
  return shown;
}

export const CUT = {
  /**
   * The round marker, and its touch target (centred on it): 44 high and only the disc's own 24-pt column wide — 12 pt into each
   * neighbour — so the tap that selects a clip stays the clip's.
   */
  disc: 22, targetHeight: 44, targetWidth: 24,
  /** At a selected clip's cut the marker stands this far OUT of that clip, and its target is only this wide — it starts 2 pt past the cut, so it never lies on the trim handle. */
  shift: 14, shiftedWidth: 24,
  /** A cut whose clip on either side is narrower than this has no marker: with a marker on both its cuts a clip keeps 68 − 12 − 12 = 44 pt of its own. */
  minClip: 68,
  /** The neighbour an outward marker stands in (2–26 pt into it) must be this wide, to keep 44 pt beside it and the 12 pt of its other cut's marker: 26 + 12 + 44. */
  besideSelected: 82,
} as const;
/** A marker on the cut after clip `index`. `x`: its centre; `width`: its target's; `has`: the cut carries a transition (a diamond), else "+". */
export type CutMark = { index: number; x: number; width: number; has: boolean };
/**
 * The markers on the cuts between neighbouring main clips. None in multi-select; none on a cut with a clip narrower than
 * `CUT.minClip` beside it. At the selected clip's two cuts the marker moves out of that clip, beside the trim handle — and is left
 * out where the neighbour it would stand in is narrower than `CUT.besideSelected`.
 */
export function cutMarks(project: Pick<Project, "clips">, pps: number, selectedId: string | null, multi: boolean): CutMark[] {
  if (multi) return [];
  const starts = clipStartTimes(project as Project);
  const widths = project.clips.map((c) => timeToX(clipDuration(c), pps));
  const out: CutMark[] = [];
  for (let i = 0; i < project.clips.length - 1; i++) {
    if (widths[i] < CUT.minClip || widths[i + 1] < CUT.minClip) continue;
    const cut = timeToX(starts[i] + clipDuration(project.clips[i]), pps);
    const way = project.clips[i].id === selectedId ? 1 : project.clips[i + 1].id === selectedId ? -1 : 0;
    if (way && widths[way > 0 ? i + 1 : i] < CUT.besideSelected) continue;
    out.push({ index: i, x: cut + way * CUT.shift, width: way ? CUT.shiftedWidth : CUT.targetWidth, has: project.clips[i].transitionOut.type !== "none" });
  }
  return out;
}

export const BAR = {
  /** A bar's inner padding each side (its handle and 2 pt). */
  pad: 14,
  /** Narrower than this a bar shows no glyph; narrower than `labelMin`, no label. The label goes first. */
  glyphMin: 42, labelMin: 66,
  glyph: 14,
} as const;
/** What a bar `width` points wide shows: its glyph and its label, the label only, … the label hides first, then the glyph. */
export const barParts = (width: number): { glyph: boolean; label: boolean } => ({ glyph: width >= BAR.glyphMin, label: width >= BAR.labelMin });
/** The symbol before a bar's label, by what the bar is (Ionicons outline names — the tools' own, where a tool makes that bar). */
export const BAR_GLYPH = {
  text: "text-outline", caption: "chatbox-ellipses-outline", sticker: "happy-outline",
  music: "musical-notes-outline", voice: "mic-outline", sfx: "volume-high-outline",
  layer: "layers-outline", effect: "flash-outline",
} as const;
export type BarKind = keyof typeof BAR_GLYPH;
