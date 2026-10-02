/**
 * X's weighted character count — one set of test vectors for BOTH copies of the rule: the server's
 * (supabase/functions/_shared/platforms/x.ts) and the phone's (src/publish/adapters/x.ts). The app and the server cannot
 * import each other, so the code is duplicated on purpose and these vectors keep the two identical. No imports here:
 * the app's test pulls this file in too.
 */
export const X_WEIGHT_VECTORS: ReadonlyArray<readonly [string, number]> = [
  ["", 0], ["hello", 5], ["a".repeat(280), 280],
  ["😀", 2], ["a😀b", 4], ["日本語", 6], ["é", 1], ["—", 1], ["…", 2],
  ["https://example.com/some/long/path?q=1", 23], ["see http://a.co now", 4 + 23 + 4],
  // A full http(s) link is always 23, however long.
  ["https://" + "c".repeat(40) + ".com", 23],
  // Trailing punctuation is not part of the link and counts normally.
  ["https://a.co/x.", 23 + 1], ["(see https://a.co/x)!", 5 + 23 + 2],
  // A bare domain is a link too (X counts it, and bills a post containing one at the "with URL" price).
  ["see clipy.app now", 4 + 23 + 4], ["clipy.app/about, ok", 23 + 4], ["www.Example.COM", 23],
  ["version 1.2 is out", 18], ["e.g. this", 9], ["v1.2.3", 6],
  // By the rule (a final label of 2+ letters is a TLD) a missing space after a full stop reads as a link: conservative.
  ["hello.World", 23],
  // An email's domain counts as a link (conservative).
  ["a@b.com", 2 + 23],
  // A bare domain counts max(23, its plain length): a long word.word that X may not treat as a link is never under-counted.
  ["a".repeat(30) + ".com", 34], ["see " + "b".repeat(25) + ".app now", 4 + 29 + 4],
];

/** Whether the text contains a link (X bills such a post at the higher price) — the same matcher as the count. */
export const X_LINK_VECTORS: ReadonlyArray<readonly [string, boolean]> = [
  ["https://a.co", true], ["see clipy.app now", true], ["hello.World", true], ["a@b.com", true], ["Visit CLIPY.APP!", true],
  ["", false], ["Beach day", false], ["version 1.2 is out", false], ["e.g. this", false], ["😀 ok.", false],
];
