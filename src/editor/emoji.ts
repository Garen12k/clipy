import data from "../../assets/emoji.json";

export interface EmojiEntry { char: string; name: string; keywords: string[] }

export const EMOJI: EmojiEntry[] = data as EmojiEntry[];

export function searchEmoji(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  const list = q ? EMOJI.filter((e) => e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q))) : EMOJI;
  return list.slice(0, limit);
}

/** The sticker packs, in the chips' order. `more` holds everything that fits none of the six. */
export const EMOJI_PACK_IDS = ["faces", "hands", "hearts", "food", "travel", "symbols", "more"] as const;
export type EmojiPackId = (typeof EMOJI_PACK_IDS)[number];
export const EMOJI_PACKS: Record<EmojiPackId, { label: string }> = {
  faces: { label: "Faces" }, hands: { label: "Hands" }, hearts: { label: "Hearts" }, food: { label: "Food" },
  travel: { label: "Travel" }, symbols: { label: "Symbols" }, more: { label: "More" },
};
/**
 * The data is in Unicode order, so a subgroup is one unbroken run inside its group. Hearts and Hands are such runs, marked by the
 * NAMES of their first / last entries: Hearts is "love letter" … "kiss mark" inside "smileys & emotion" (what comes before is Faces,
 * what comes after is Symbols); Hands is the start of "people & body" through "flexed biceps" (the rest goes to More).
 */
export const PACK_ANCHORS = { heartsFrom: "love letter", heartsTo: "kiss mark", handsTo: "flexed biceps" } as const;
/** Whole Unicode groups (an entry's `keywords[0]`) that are a pack by themselves. Any other group goes to More. */
const GROUP_PACK: Record<string, EmojiPackId> = { "food & drink": "food", "travel & places": "travel", symbols: "symbols" };

/** Every entry of `list` in exactly one pack, in the list's order. Pure: one walk, nothing is changed or dropped. */
export function groupEmoji(list: readonly EmojiEntry[]): Record<EmojiPackId, EmojiEntry[]> {
  const out: Record<EmojiPackId, EmojiEntry[]> = { faces: [], hands: [], hearts: [], food: [], travel: [], symbols: [], more: [] };
  let smiley: EmojiPackId = "faces", body: EmojiPackId = "hands";
  for (const e of list) {
    const group = e.keywords[0];
    if (group === "smileys & emotion") {
      if (e.name === PACK_ANCHORS.heartsFrom) smiley = "hearts";
      out[smiley].push(e);
      if (e.name === PACK_ANCHORS.heartsTo) smiley = "symbols";
    } else if (group === "people & body") {
      out[body].push(e);
      if (e.name === PACK_ANCHORS.handsTo) body = "more";
    } else out[GROUP_PACK[group] ?? "more"].push(e);
  }
  return out;
}
/** The bundled emoji by pack, grouped once. */
export const EMOJI_BY_PACK = groupEmoji(EMOJI);
