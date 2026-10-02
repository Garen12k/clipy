import type { ClientAdapter } from "./types";

const MAX_WEIGHT = 280;
const MAX_DURATION_SEC = 1200;
const MAX_BYTES = 1024 ** 3;

// ---------- X's weighted character count ----------
// A copy of the server's rule (supabase/functions/_shared/platforms/x.ts): the app and the server cannot import each other,
// so the code is duplicated on purpose. Both are pinned to the same test vectors
// (supabase/functions/_shared/__tests__/xWeightVectors.ts) — change them together.

/** These ranges weigh 1, every other code point 2 (twitter-text v3 config). */
const LIGHT: ReadonlyArray<readonly [number, number]> = [[0x0000, 0x10ff], [0x2000, 0x200d], [0x2010, 0x201f], [0x2032, 0x2037]];
/** A link weighs 23 (t.co); a bare domain (no `http(s)://`) weighs max(23, its plain length). */
const URL_WEIGHT = 23;
/** `http(s)://…`, or a bare domain `label(.label)*.tld` (optional path) whose last label is 2+ letters. Group 2 is the character before a bare domain. */
const LINK = /(https?:\/\/\S+)|(^|[^\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![\w-])(?:\/\S*)?)/gi;
/** Trailing punctuation is not part of a link. */
const TRAILING = /[.,;:!?)\]}'"]+$/;
const weightOf = (cp: number) => (LIGHT.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2);
const plainWeight = (s: string) => { let n = 0; for (const ch of s) n += weightOf(ch.codePointAt(0)!); return n; };

type Piece = { link: boolean; bare?: boolean; text: string };
/** The text as plain runs and links, in order. */
function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const start = m.index! + (m[1] ? 0 : m[2].length);
    const link = (m[1] ?? m[3]).replace(TRAILING, "");
    if (!link) continue;
    if (start > at) out.push({ link: false, text: text.slice(at, start) });
    out.push({ link: true, bare: !m[1], text: link });
    at = start + link.length;
  }
  if (at < text.length) out.push({ link: false, text: text.slice(at) });
  return out;
}
const linkWeight = (p: Piece) => (p.bare ? Math.max(URL_WEIGHT, plainWeight(p.text)) : URL_WEIGHT);

/** True when part of the text counts (and is billed by X) as a link — the same matcher as weightedLength. */
export function hasLink(text: string): boolean { return pieces(text).some((p) => p.link); }

/** The caption's length the way X counts it (emoji and wide characters 2, links 23). */
export function weightedLength(text: string): number {
  let n = 0;
  for (const p of pieces(text)) n += p.link ? linkWeight(p) : plainWeight(p.text);
  return n;
}

/**
 * X is pay-per-use for Clipy (about 1.5¢ a post, about 20¢ when the text has a link). The video is relayed through Clipy's
 * server in 4 MiB pieces; the post is created only after X has processed the video, so the server's wait hint keeps the row
 * polling (every 5 s, up to 5 minutes) and a timeout ends in Resume, never "upload again".
 */
export const x: ClientAdapter = {
  id: "x",
  captionMax: MAX_WEIGHT,
  hasOptions: false,
  defaultOptions: () => ({}),
  validate(video, caption) {
    if (weightedLength(caption) > MAX_WEIGHT) return "X posts can be up to 280 characters (emoji and links count extra).";
    if (video.durationSec > MAX_DURATION_SEC) return "X accepts videos up to 20 minutes.";
    if (video.fileSize > MAX_BYTES) return "X uploads go through Clipy's server and are limited to 1 GB.";
    return null;
  },
  note: () => "Posting to X costs about 1.5¢ (about 20¢ if the caption has a link). The video goes through Clipy's server in small pieces.",
  captionNote: (caption) => (hasLink(caption) ? "This caption contains a link — X charges about 20¢ for posts with links." : null),
};
