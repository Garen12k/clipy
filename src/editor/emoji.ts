import data from "../../assets/emoji.json";

export interface EmojiEntry { char: string; name: string; keywords: string[] }

export const EMOJI: EmojiEntry[] = data as EmojiEntry[];

export function searchEmoji(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  const list = q ? EMOJI.filter((e) => e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q))) : EMOJI;
  return list.slice(0, limit);
}
