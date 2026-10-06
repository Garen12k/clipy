import { EMOJI, EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS, groupEmoji, PACK_ANCHORS, searchEmoji, type EmojiEntry } from "../emoji";

test("emoji data loads and is searchable", () => {
  expect(EMOJI.length).toBeGreaterThan(1000);
  expect(EMOJI.every((e) => e.char && e.name && e.keywords.length > 0)).toBe(true);
  expect(searchEmoji("fire").some((e) => e.char === "🔥")).toBe(true);
  expect(searchEmoji("").length).toBe(60);
  expect(searchEmoji("zzzzqqq")).toEqual([]);
});

test("seven packs with their labels, in the chips' order", () => {
  expect(EMOJI_PACK_IDS).toEqual(["faces", "hands", "hearts", "food", "travel", "symbols", "more"]);
  expect(EMOJI_PACK_IDS.map((id) => EMOJI_PACKS[id].label)).toEqual(["Faces", "Hands", "Hearts", "Food", "Travel", "Symbols", "More"]);
  expect(PACK_ANCHORS).toEqual({ heartsFrom: "love letter", heartsTo: "kiss mark", handsTo: "flexed biceps" });
});

test("the bundled emoji: every one is in exactly one pack, in the data's order; the sizes (they move only when the data is regenerated)", () => {
  expect(Object.fromEntries(EMOJI_PACK_IDS.map((id) => [id, EMOJI_BY_PACK[id].length]))).toEqual({ faces: 131, hands: 44, hearts: 26, food: 131, travel: 219, symbols: 238, more: 1125 });
  const all = EMOJI_PACK_IDS.flatMap((id) => EMOJI_BY_PACK[id]);
  expect(all).toHaveLength(EMOJI.length);                                  // 131 + 44 + 26 + 131 + 219 + 238 + 1125 = 1914
  expect(new Set(all.map((e) => e.char)).size).toBe(EMOJI.length);
  for (const id of EMOJI_PACK_IDS) { const at = EMOJI_BY_PACK[id].map((e) => EMOJI.indexOf(e)); expect(at).toEqual([...at].sort((a, b) => a - b)); }
  const ends = (id: (typeof EMOJI_PACK_IDS)[number]) => [EMOJI_BY_PACK[id][0].name, EMOJI_BY_PACK[id][EMOJI_BY_PACK[id].length - 1].name];
  expect(ends("faces")).toEqual(["grinning face", "speak-no-evil monkey"]);
  expect(ends("hearts")).toEqual(["love letter", "kiss mark"]);
  expect(ends("hands")).toEqual(["waving hand", "flexed biceps"]);
  expect(ends("symbols")[0]).toBe("hundred points");
  expect(EMOJI_BY_PACK.food.every((e) => e.keywords[0] === "food & drink")).toBe(true);
  expect(EMOJI_BY_PACK.travel.every((e) => e.keywords[0] === "travel & places")).toBe(true);
  expect(new Set(EMOJI_BY_PACK.more.map((e) => e.keywords[0]))).toEqual(new Set(["people & body", "animals & nature", "activities", "objects", "flags"]));
  expect(EMOJI_BY_PACK.hearts.some((e) => e.name === "red heart")).toBe(true);
  expect(EMOJI_BY_PACK.hands.some((e) => e.name === "thumbs up")).toBe(true);
});

test("groupEmoji is a pure walk over any list: groups by keywords[0], cuts Hearts and Hands out by the anchor names", () => {
  const e = (name: string, group: string): EmojiEntry => ({ char: name, name, keywords: [group] });
  const list = [e("grin", "smileys & emotion"), e("love letter", "smileys & emotion"), e("red heart", "smileys & emotion"), e("kiss mark", "smileys & emotion"), e("zzz", "smileys & emotion"),
    e("waving hand", "people & body"), e("flexed biceps", "people & body"), e("ear", "people & body"),
    e("dog", "animals & nature"), e("pizza", "food & drink"), e("car", "travel & places"), e("ball", "activities"), e("lamp", "objects"), e("warning", "symbols"), e("flag", "flags"), e("odd", "something new")];
  const frozen = JSON.stringify(list);
  const names = (xs: EmojiEntry[]) => xs.map((x) => x.name);
  const g = groupEmoji(list);
  expect(JSON.stringify(list)).toBe(frozen);
  expect(names(g.faces)).toEqual(["grin"]);
  expect(names(g.hearts)).toEqual(["love letter", "red heart", "kiss mark"]);
  expect(names(g.symbols)).toEqual(["zzz", "warning"]);
  expect(names(g.hands)).toEqual(["waving hand", "flexed biceps"]);
  expect(names(g.food)).toEqual(["pizza"]);
  expect(names(g.travel)).toEqual(["car"]);
  expect(names(g.more)).toEqual(["ear", "dog", "ball", "lamp", "flag", "odd"]);        // an unknown group lands in More, never lost
  expect(groupEmoji([])).toEqual({ faces: [], hands: [], hearts: [], food: [], travel: [], symbols: [], more: [] });
  // Without the anchors nothing is lost either: the whole group stays in its first pack (the size test above is what notices).
  expect(names(groupEmoji([e("grin", "smileys & emotion"), e("red heart", "smileys & emotion")]).faces)).toEqual(["grin", "red heart"]);
});

test("search is unchanged: it still looks through every emoji, whatever its pack", () => {
  expect(searchEmoji("pizza").some((x) => x.name === "pizza")).toBe(true);
  expect(searchEmoji("flag").length).toBe(60);
  expect(searchEmoji("").length).toBe(60);
});
