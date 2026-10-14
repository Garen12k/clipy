import { edgeDurations } from "./motion";
import { isRevealId, type Overlay, type RevealId, type TextOverlay } from "./types";

/**
 * Text reveals (Typewriter / Word by word): which part of a text shows at a time. TypeScript ONLY — the export is sent the result
 * (`exportReveal`), never the rule, so nothing here is mirrored in Swift. Offsets are UTF-16 (a JS string's, and NSAttributedString's).
 * The shown part is always a PREFIX in logical (reading) order; the rest is laid out but invisible (spec section 3).
 * `stepsPerSecond` / `maxSteps` bound how many states a reveal has: the export draws one set of layers per state. Tuning them needs no build.
 */
export const REVEAL = { stepsPerSecond: 30, maxSteps: 30 } as const;

type Range = readonly [number, number];
const within = (p: number, ranges: readonly Range[]): boolean => ranges.some(([lo, hi]) => p >= lo && p <= hi);
/** White space: never a unit; the next character begins a new word. */
const SPACE: readonly Range[] = [[0x09, 0x0d], [0x20, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]];
/** Invisible marks (soft hyphen, ALM, Mongolian VS, ZWSP, ZWNJ, LRM / RLM, embeddings, word joiner…, isolates, BOM): glued to what is before. */
const INVISIBLE: readonly Range[] = [[0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200c], [0x200e, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
/** The zero-width joiner: glued, and so is the code point after it. */
const JOINER = 0x200d;
/** Combining marks and emoji modifiers: glued to the character before (accents, Hebrew points, tashkeel, keycap, variation selectors, skin tones, tags). */
const MARK: readonly Range[] = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05c7], [0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc], [0x06df, 0x06e4],
  [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x08d3, 0x08ff], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x20d0, 0x20ff], [0x3099, 0x309a], [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f], [0x1f3fb, 0x1f3ff], [0xe0020, 0xe007f], [0xe0100, 0xe01ef],
];
/** Regional indicators: two make a flag. */
const REGIONAL: readonly Range[] = [[0x1f1e6, 0x1f1ff]];
/**
 * Scripts whose letters change shape with their neighbours (Arabic incl. Persian / Urdu, Syriac, Thaana, NKo, Mandaic, the Indic blocks,
 * Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, conjoining Hangul jamo, Balinese and neighbours, Arabic presentation forms): Typewriter
 * reveals a word holding one of them WHOLE, so a colour boundary never falls inside a joined word.
 */
const JOINED: readonly Range[] = [
  [0x0600, 0x08ff], [0x0900, 0x0dff], [0x0e00, 0x0eff], [0x0f00, 0x0fff], [0x1000, 0x109f], [0x1100, 0x11ff], [0x1780, 0x18af],
  [0x1b00, 0x1b7f], [0xa960, 0xa97f], [0xa980, 0xa9ff], [0xaa60, 0xaa7f], [0xd7b0, 0xd7ff], [0xfb50, 0xfdff], [0xfe70, 0xfefe],
];
/** CJK (radicals, punctuation, kana, bopomofo, ideographs, compatibility ideographs, fullwidth forms): each character is its own word. */
const CJK: readonly Range[] = [
  [0x2e80, 0x2fdf], [0x3001, 0x30ff], [0x3100, 0x312f], [0x31a0, 0x31ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef], [0x20000, 0x3134f],
];

interface Cluster { start: number; joined: boolean; cjk: boolean; spaced: boolean; regional: number }

/** What the eye calls one character each, with where it starts and whether white space came before it. */
function clustersOf(text: string): Cluster[] {
  const out: Cluster[] = [];
  let spaced = false;
  let glued = false;
  for (let i = 0; i < text.length;) {
    const p = text.codePointAt(i) ?? 0;
    const at = i;
    i += p > 0xffff ? 2 : 1;
    const cur = out.length > 0 ? out[out.length - 1] : null;
    if (within(p, SPACE)) { spaced = true; glued = false; continue; }
    if (glued) { glued = p === JOINER; continue; }
    if (p === JOINER) { glued = cur !== null && !spaced; continue; }
    if (within(p, INVISIBLE) || within(p, MARK)) continue;
    const regional = within(p, REGIONAL);
    if (regional && cur !== null && !spaced && cur.regional === 1) { cur.regional = 2; continue; }
    out.push({ start: at, joined: within(p, JOINED), cjk: within(p, CJK), spaced: spaced || cur === null, regional: regional ? 1 : 0 });
    spaced = false;
  }
  return out;
}

/** Where the shown part ends after each unit, ascending; the last is `text.length`. `[]` when nothing would be seen. */
export function revealUnits(text: string, id: RevealId): number[] {
  const s = typeof text === "string" ? text : "";
  const words: Cluster[][] = [];
  clustersOf(s).forEach((c, k, all) => {
    const prev = k > 0 ? all[k - 1] : null;
    if (prev === null || c.spaced || c.cjk || prev.cjk) words.push([c]); else words[words.length - 1].push(c);
  });
  const starts: number[] = [];
  for (const w of words) {
    if (id === "wordByWord" || w.some((c) => c.joined)) starts.push(w[0].start);
    else for (const c of w) starts.push(c.start);
  }
  return starts.map((_, k) => (k + 1 < starts.length ? starts[k + 1] : s.length));
}

export interface RevealStep { cut: number; from: number }
/**
 * The states of a reveal lasting `duration` seconds: step j (1 … m) shows the text before `cut` from `from` seconds after the text's
 * start. The first starts at 0, the last is the whole text and holds to the end. `m` = the units, at most `duration × stepsPerSecond`
 * and `maxSteps` (units are then shown several at a time). Fewer than two steps = no reveal (the caller draws the text whole).
 */
export function revealPlan(text: string, id: RevealId, duration: number): RevealStep[] {
  const cuts = revealUnits(text, id);
  const n = cuts.length;
  if (n === 0 || !Number.isFinite(duration) || !(duration > 0)) return [];
  const m = Math.max(1, Math.min(n, REVEAL.maxSteps, Math.ceil(duration * REVEAL.stepsPerSecond - 1e-9)));
  const steps: RevealStep[] = [];
  for (let j = 1; j <= m; j++) steps.push({ cut: cuts[Math.ceil((j * n) / m) - 1], from: (duration * (j - 1)) / m });
  return steps;
}

/** A text (never a caption or a sticker) whose In is a reveal. */
export const hasReveal = (o: Overlay): o is TextOverlay => o.kind === "text" && o.animation.in !== null && isRevealId(o.animation.in.id);
/** The reveal's length as the export receives it: the In scaled with the Out to fit the text's life (`edgeDurations`). */
export const revealDuration = (o: TextOverlay): number =>
  edgeDurations(o.animation.in?.duration ?? 0, o.animation.out?.duration ?? 0, o.end - o.start).in;

function planOf(o: Overlay): RevealStep[] {
  if (!hasReveal(o)) return [];
  const id = o.animation.in?.id;
  return id !== undefined && isRevealId(id) ? revealPlan(o.text, id, revealDuration(o)) : [];
}

/** The preview: where the shown part ends at project time `time` — null = draw the whole text (no reveal, one step, or the last step reached). */
export function revealCut(o: TextOverlay, time: number): number | null {
  const plan = planOf(o);
  if (plan.length < 2) return null;
  const local = Number.isFinite(time) ? Math.max(0, time - o.start) : 0;
  let cut = plan[0].cut;
  for (const s of plan) { if (s.from <= local) cut = s.cut; else break; }
  return cut >= o.text.length ? null : cut;
}

/** The export: the plan as the request's `reveal` key, or null (no key) when the text has no reveal of two steps or more. */
export function exportReveal(o: Overlay): { cuts: number[]; from: number[] } | null {
  const plan = planOf(o);
  return plan.length < 2 ? null : { cuts: plan.map((s) => s.cut), from: plan.map((s) => s.from) };
}
