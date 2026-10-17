import { FIND_WORDS } from "./homeFindWords";

/**
 * Home's order and search, PURE (no React, no Expo). The spec's §2.2: what each sort reads, the stable ties, the fold that makes case
 * and accents not matter (also for Arabic, Persian and Hebrew — a hand-written table, no `\p{…}`), and the rows the list draws.
 * The name order is our own and deterministic (folded text, digit runs by value, everything else by UTF-16 code unit), NOT
 * Intl.Collator: Hermes' collation on iOS cannot be pinned by a Jest vector, this can.
 */
export type HomeSort = "edited" | "created" | "name" | "length";
export const HOME_SORTS: readonly HomeSort[] = ["edited", "created", "name", "length"];
export const DEFAULT_SORT: HomeSort = "edited";
/** The search field and the sort button show from this many projects (or while a search is typed). */
export const FIND = { showAt: 6 } as const;
const SORT_TITLES: Record<HomeSort, string> = FIND_WORDS.sorts;

/** What the order reads of a listed project (`ProjectSummary` has all of it). */
export interface Orderable { id: string; name: string; durationSec: number; updatedAt: string; createdAt: string; broken: boolean }

/**
 * Code points a fold drops: combining diacritics, Hebrew points, Arabic marks (harakat, the dagger alef, Quranic marks — and so the
 * hamza / madda that NFD splits off أ إ آ ؤ ئ), the tatweel, ZWNJ / ZWJ, variation selectors. NOT the Indic / Thai vowel signs and
 * viramas: they are part of the word.
 */
const DROPPED: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], [0x0591, 0x05bd], [0x05bf, 0x05bf], [0x05c1, 0x05c2], [0x05c4, 0x05c5], [0x05c7, 0x05c7],
  [0x0610, 0x061a], [0x0640, 0x0640], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc], [0x06df, 0x06e4], [0x06e7, 0x06e8], [0x06ea, 0x06ed],
  [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x200c, 0x200d], [0x20d0, 0x20ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f],
];
const dropped = (c: number) => DROPPED.some(([lo, hi]) => c >= lo && c <= hi);
const FINAL_SIGMA = 0x03c2;

/** A name as the search and the name order see it: lower case, NFD, the marks above dropped, ς read as σ. */
export function foldName(s: string): string {
  let out = "";
  for (const ch of s.toLowerCase().normalize("NFD")) {
    const c = ch.codePointAt(0) as number;
    if (dropped(c)) continue;
    out += c === FINAL_SIGMA ? "σ" : ch;
  }
  return out;
}

/** The query trimmed and folded; empty matches everything; else a substring of the folded name. */
export function matchesQuery(name: string, query: string): boolean {
  const q = foldName(query.trim());
  return q === "" || foldName(name).includes(q);
}
/** `matchesQuery` on what is already folded (the query trimmed first). */
const matchesFolded = (name: string, q: string) => q === "" || name.includes(q);

const DIGITS = /([0-9]+)/;
function compareDigits(a: string, b: string): number {
  const x = a.replace(/^0+(?=.)/, ""), y = b.replace(/^0+(?=.)/, "");
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}
/** A → Z on folded names: runs of ASCII digits by their value ("2" before "10", digits before letters), the rest by code unit; a prefix first. 0 = the same to the eye. */
export function compareNames(a: string, b: string): number {
  return compareFolded(foldName(a), foldName(b));
}
/** `compareNames` on names already folded: the list folds each name once per ordering, never inside its comparator. */
function compareFolded(a: string, b: string): number {
  const xs = a.split(DIGITS), ys = b.split(DIGITS);
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const p = xs[i] as string, q = ys[i] as string;
    if (p === q) continue;
    if (i % 2 === 1) { const r = compareDigits(p, q); if (r !== 0) return r; continue; }
    return p < q ? -1 : 1;
  }
  return xs.length - ys.length;
}

/** A date that does not parse is the oldest. */
const time = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : -Infinity; };
const desc = (a: number, b: number) => (a > b ? -1 : a < b ? 1 : 0);
const raw = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const BY: Record<HomeSort, (a: Orderable, b: Orderable) => number> = {
  edited: (a, b) => desc(time(a.updatedAt), time(b.updatedAt)),
  created: (a, b) => desc(time(a.createdAt), time(b.createdAt)),
  name: () => 0,
  length: (a, b) => desc(a.durationSec, b.durationSec),
};
/** Broken last (as the listing always had it), then the sort, then the folded name, the raw name, the id: one order whatever the listing's order. */
export function compareProjects(sort: HomeSort, a: Orderable, b: Orderable): number {
  return compareWith(sort, a, b, foldName(a.name), foldName(b.name));
}
function compareWith(sort: HomeSort, a: Orderable, b: Orderable, fa: string, fb: string): number {
  return Number(a.broken) - Number(b.broken) || BY[sort](a, b) || compareFolded(fa, fb) || raw(a.name, b.name) || raw(a.id, b.id);
}

export interface HomeOptions { sort: HomeSort; pins: readonly string[]; query: string }
/** The projects that match, in the sort's order, split: pinned (and not broken) first, all the others after. */
export function orderProjects<T extends Orderable>(list: readonly T[], o: HomeOptions): { pinned: T[]; rest: T[] } {
  const pins = new Set(o.pins);
  // Each name folded once, and the query once (with many projects the comparator runs thousands of times a keystroke).
  const q = foldName(o.query.trim());
  const folded = new Map<T, string>();
  for (const p of list) folded.set(p, foldName(p.name));
  const f = (p: T) => folded.get(p) as string;
  const shown = list.filter((p) => matchesFolded(f(p), q)).sort((a, b) => compareWith(o.sort, a, b, f(a), f(b)));
  return { pinned: shown.filter((p) => !p.broken && pins.has(p.id)), rest: shown.filter((p) => p.broken || !pins.has(p.id)) };
}

/** One row of Home's list: a small heading, or up to two cards side by side (each card's cell is 50 % — the grid as it always was). */
export type HomeRow<T> = { kind: "heading"; key: string; title: string } | { kind: "cards"; key: string; items: T[] };
function pairs<T extends { id: string }>(list: readonly T[]): HomeRow<T>[] {
  const out: HomeRow<T>[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const items = list.slice(i, i + 2);
    out.push({ kind: "cards", key: `cards:${items.map((p) => p.id).join(",")}`, items });
  }
  return out;
}
/** Headings only while a pinned project is in view: "Pinned", then the sort's name over the rest (none over an empty rest). */
export function homeRows<T extends { id: string }>(order: { pinned: readonly T[]; rest: readonly T[] }, sort: HomeSort): HomeRow<T>[] {
  if (order.pinned.length === 0) return pairs(order.rest);
  const rows: HomeRow<T>[] = [{ kind: "heading", key: "heading:pinned", title: FIND_WORDS.pinned }, ...pairs(order.pinned)];
  if (order.rest.length > 0) rows.push({ kind: "heading", key: "heading:rest", title: SORT_TITLES[sort] }, ...pairs(order.rest));
  return rows;
}

/** The search row: from `FIND.showAt` projects (all listed, broken too), or while anything — even a space — is typed. */
export function showFind(count: number, query: string): boolean {
  return count >= FIND.showAt || query !== "";
}

/** The pins whose project is listed; THE SAME array when none is dropped (so nothing is written). */
export function keepListed(pins: readonly string[], ids: readonly string[]): readonly string[] {
  const here = new Set(ids);
  const kept = pins.filter((id) => here.has(id));
  return kept.length === pins.length ? pins : kept;
}
