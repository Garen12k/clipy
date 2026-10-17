import { compareNames, compareProjects, DEFAULT_SORT, FIND, foldName, HOME_SORTS, homeRows, keepListed, matchesQuery, orderProjects, showFind, type Orderable } from "../homeOrder";

const at = (d: number) => `2026-10-${String(d).padStart(2, "0")}T00:00:00.000Z`;
const P = (id: string, name: string, o: Partial<Orderable> = {}): Orderable => ({ id, name, durationSec: 10, updatedAt: at(1), createdAt: at(1), broken: false, ...o });
const ids = (l: readonly { id: string }[]) => l.map((p) => p.id);

describe("foldName", () => {
  test.each([
    ["Café Été", "cafe ete"],
    ["İstanbul", "istanbul"],
    ["ΟΔΟΣ", "οδοσ"],
    ["Tiếng Việt", "tieng viet"],
    ["أَحْمَد", "احمد"],
    ["إسلام", "اسلام"],
    ["آمنة", "امنة"],
    ["مــدرسة", "مدرسة"],
    ["می‌خواهم", "میخواهم"],
    ["שָׁלוֹם", "שלום"],
    ["हिंदी", "हिंदी"],
    ["東京旅行", "東京旅行"],
    ["❤️ Trip", "❤ trip"],
  ])("%s -> %s", (name, folded) => { expect(foldName(name)).toBe(folded); });
  test("Korean becomes jamo on both sides", () => { expect(foldName("한국")).toBe("한국".normalize("NFD")); });
});

describe("matchesQuery", () => {
  test.each([
    ["Beach", "  BEA ", true], ["Beach", "ach", true], ["Beach", "x", false], ["Beach", "", true], ["Beach", "   ", true],
    ["Été à Nice", "ete a", true], ["Été à Nice", "etea", false],
    ["أَحْمَد", "احمد", true],
    ["مدرسة", "مدرسه", false],
    ["می‌خواهم", "میخواهم", true],
    ["हिंदी", "हिं", true], ["हिंदी", "हिदी", false],
    ["東京旅行", "京旅", true], ["한국", "하", true], ["❤️ Trip", "❤ trip", true],
    ["Can't open", "can't", true],
  ])("%s / %s -> %s", (name, query, hit) => { expect(matchesQuery(name as string, query as string)).toBe(hit); });
});

test("compareNames: digits by value and first, accents and case folded, a prefix first, scripts by code point", () => {
  const names = ["Project 10", "project 2", "Project 1", "Été", "eta", "Beach", "beach", "10 days", "2 days", "Zoo", "ábc", "abd", "File 02", "File 2", "a", "a1", "ab", "a2", "أحمد", "Ωmega", ""];
  const sorted = [...names].sort((a, b) => compareNames(a, b) || (a < b ? -1 : a > b ? 1 : 0));
  expect(sorted).toEqual(["", "2 days", "10 days", "a", "a1", "a2", "ab", "ábc", "abd", "Beach", "beach", "eta", "Été", "File 02", "File 2", "Project 1", "project 2", "Project 10", "Zoo", "Ωmega", "أحمد"]);
  expect(compareNames("File 02", "File 2")).toBe(0);
  expect(compareNames("Beach", "beach")).toBe(0);
});

describe("the four sorts", () => {
  const A = P("a", "Beach", { updatedAt: at(6), createdAt: at(1), durationSec: 30 });
  const B = P("b", "Été à Nice", { updatedAt: at(5), createdAt: at(6), durationSec: 12 });
  const C = P("c", "Hills", { updatedAt: at(4), createdAt: at(5), durationSec: 65 });
  const D = P("d", "Project 10", { updatedAt: at(3), createdAt: at(4), durationSec: 5 });
  const E = P("e", "Project 2", { updatedAt: at(2), createdAt: at(3), durationSec: 20 });
  const X = P("x", "Can't open", { updatedAt: "", createdAt: "", durationSec: 0, broken: true });
  const all = [X, E, C, A, D, B];
  const order = (sort: (typeof HOME_SORTS)[number]) => ids(orderProjects(all, { sort, pins: [], query: "" }).rest);
  test("Last edited is the default: newest first, broken last", () => { expect(DEFAULT_SORT).toBe("edited"); expect(order("edited")).toEqual(["a", "b", "c", "d", "e", "x"]); });
  test("Date created: newest first", () => { expect(order("created")).toEqual(["b", "c", "d", "e", "a", "x"]); });
  test("Name: A to Z, numbers in natural order", () => { expect(order("name")).toEqual(["a", "b", "c", "e", "d", "x"]); });
  test("Length: longest first", () => { expect(order("length")).toEqual(["c", "a", "e", "b", "d", "x"]); });
  test("the order is the four ids, in that order", () => { expect(HOME_SORTS).toEqual(["edited", "created", "name", "length"]); });
});

test("ties: the chosen order, then the folded name, then the raw name, then the id; a date that does not parse is the oldest", () => {
  const same = { updatedAt: at(3), durationSec: 9 };
  const list = [P("z2", "beach", same), P("z1", "Beach", same), P("y", "Alpha", same), P("w", "Beach", same), P("bad", "Aaa", { updatedAt: "not a date" })];
  expect(ids(orderProjects(list, { sort: "edited", pins: [], query: "" }).rest)).toEqual(["y", "w", "z1", "z2", "bad"]);
  expect(ids(orderProjects(list, { sort: "length", pins: [], query: "" }).rest)).toEqual(["bad", "y", "w", "z1", "z2"]);
  expect(compareProjects("name", P("1", "A"), P("1", "A"))).toBe(0);
});

test("pinned first, each part in the chosen order; a broken project is never in the pinned part; a pin of an id not listed is ignored", () => {
  const list = [P("a", "Beach", { updatedAt: at(3) }), P("b", "Hills", { updatedAt: at(2) }), P("c", "Zoo", { updatedAt: at(1) }), P("x", "Can't open", { broken: true, updatedAt: "" })];
  const o = orderProjects(list, { sort: "edited", pins: ["c", "x", "gone", "a"], query: "" });
  expect(ids(o.pinned)).toEqual(["a", "c"]);
  expect(ids(o.rest)).toEqual(["b", "x"]);
  const q = orderProjects(list, { sort: "name", pins: ["c"], query: "o" });
  expect(ids(q.pinned)).toEqual(["c"]);
  expect(ids(q.rest)).toEqual(["x"]);
});

describe("homeRows", () => {
  const a = P("a", "A"), b = P("b", "B"), c = P("c", "C");
  test("no pinned project in view: rows of two, no heading", () => {
    expect(homeRows({ pinned: [], rest: [a, b, c] }, "edited")).toEqual([
      { kind: "cards", key: "cards:a,b", items: [a, b] }, { kind: "cards", key: "cards:c", items: [c] }]);
  });
  test("pinned: the heading Pinned, its cards, then the heading of the sort and the rest", () => {
    expect(homeRows({ pinned: [c], rest: [a, b] }, "name")).toEqual([
      { kind: "heading", key: "heading:pinned", title: "Pinned" }, { kind: "cards", key: "cards:c", items: [c] },
      { kind: "heading", key: "heading:rest", title: "Name" }, { kind: "cards", key: "cards:a,b", items: [a, b] }]);
  });
  test("everything pinned: no second heading", () => {
    expect(homeRows({ pinned: [a], rest: [] }, "length")).toEqual([{ kind: "heading", key: "heading:pinned", title: "Pinned" }, { kind: "cards", key: "cards:a", items: [a] }]);
  });
  test("the heading names each sort", () => {
    expect(HOME_SORTS.map((s) => (homeRows({ pinned: [a], rest: [b] }, s)[2] as { title: string }).title)).toEqual(["Last edited", "Date created", "Name", "Length"]);
  });
});

test("showFind: from six projects, or while anything is typed", () => {
  expect(FIND.showAt).toBe(6);
  expect([showFind(5, ""), showFind(6, ""), showFind(0, " "), showFind(2, "be")]).toEqual([false, true, true, true]);
});

test("keepListed drops pins whose project is not listed, and is the same array when nothing is dropped", () => {
  const pins = ["a", "b"];
  expect(keepListed(pins, ["a", "b", "c"])).toBe(pins);
  expect(keepListed(pins, ["b"])).toEqual(["b"]);
  expect(keepListed(pins, [])).toEqual([]);
});
