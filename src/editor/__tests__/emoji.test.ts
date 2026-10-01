import { EMOJI, searchEmoji } from "../emoji";

test("emoji data loads and is searchable", () => {
  expect(EMOJI.length).toBeGreaterThan(1000);
  expect(EMOJI.every((e) => e.char && e.name && e.keywords.length > 0)).toBe(true);
  expect(searchEmoji("fire").some((e) => e.char === "🔥")).toBe(true);
  expect(searchEmoji("").length).toBe(60);
  expect(searchEmoji("zzzzqqq")).toEqual([]);
});
