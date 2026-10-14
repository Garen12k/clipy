/**
 * Text reveal segmentation vectors (`revealUnits` in src/editor/model/textReveal.ts): a plain data table, ASCII only — every
 * non-ASCII character is a `\u{…}` escape so the table can be copied verbatim into Swift (`\u{…}` is Swift's escape too).
 * Each row: the text, then the UTF-16 offsets where the shown part ends after each unit for Typewriter, then for Word by word.
 * The rule (spec section 3): white space is never a unit and belongs to the unit before it (leading space shows from the first
 * step); combining marks, emoji modifiers, variation selectors and invisible marks stay on the character before; a ZWJ glues the
 * code point after it; two regional indicators make a flag; a word holding a letter of a joined script (Arabic, Indic, Thai …)
 * is one Typewriter unit; each CJK character is its own word. Offsets are in logical (reading) order.
 */
export interface RevealUnitVector { name: string; text: string; typewriter: number[]; wordByWord: number[] }

export const REVEAL_UNIT_VECTORS: RevealUnitVector[] = [
  { name: "a space belongs to the unit before it", text: "Hi you", typewriter: [1, 3, 4, 5, 6], wordByWord: [3, 6] },
  { name: "leading space in every prefix; a newline is space", text: "  Hi\nyou ", typewriter: [3, 5, 6, 7, 9], wordByWord: [5, 9] },
  { name: "multiple spaces", text: "a   b", typewriter: [4, 5], wordByWord: [4, 5] },
  { name: "trailing spaces end with the last unit", text: "ab  ", typewriter: [1, 4], wordByWord: [4] },
  { name: "two newlines", text: "a\n\nb", typewriter: [3, 4], wordByWord: [3, 4] },
  { name: "combining accents stay on their letter", text: "e\u{0301}te\u{0301}", typewriter: [2, 3, 5], wordByWord: [5] },
  { name: "a leading combining mark shows from the first step", text: "\u{0301}ab", typewriter: [2, 3], wordByWord: [3] },
  { name: "a ZWJ family is one character", text: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}!", typewriter: [8, 9], wordByWord: [9] },
  { name: "ZWJ sequence with a variation selector", text: "\u{2764}\u{FE0F}\u{200D}\u{1F525}x", typewriter: [5, 6], wordByWord: [6] },
  { name: "flags are pairs; a lone indicator is one", text: "\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}\u{1F1EE}", typewriter: [4, 8, 10], wordByWord: [10] },
  { name: "a skin tone stays on its emoji", text: "\u{1F44D}\u{1F3FD} ok", typewriter: [5, 6, 7], wordByWord: [5, 7] },
  { name: "keycap", text: "1\u{FE0F}\u{20E3}", typewriter: [3], wordByWord: [3] },
  { name: "Arabic with tashkeel: whole words in both", text: "\u{0633}\u{064E}\u{0644}\u{0627}\u{0645} \u{062F}\u{0646}\u{06CC}\u{0627}", typewriter: [6, 10], wordByWord: [6, 10] },
  { name: "Persian: a ZWNJ is inside the word", text: "\u{0645}\u{06CC}\u{200C}\u{062E}\u{0648}\u{0627}\u{0647}\u{0645} \u{0628}\u{0631}\u{0648}\u{0645}", typewriter: [9, 13], wordByWord: [9, 13] },
  { name: "Hebrew: letter by letter, its points glued", text: "\u{05E9}\u{05B8}\u{05C1}\u{05DC}\u{05D5}\u{05B9}\u{05DD}", typewriter: [3, 4, 6, 7], wordByWord: [7] },
  { name: "mixed LTR / RTL: logical order; the Arabic word is one unit", text: "Hi \u{0633}\u{0644}\u{0627}\u{0645} you", typewriter: [1, 3, 8, 9, 10, 11], wordByWord: [3, 8, 11] },
  { name: "Hebrew first, then Latin", text: "\u{05E9}\u{05DC}\u{05D5}\u{05DD} hi", typewriter: [1, 2, 3, 5, 6, 7], wordByWord: [5, 7] },
  { name: "Devanagari: whole words", text: "\u{0928}\u{092E}\u{0938}\u{094D}\u{0924}\u{0947} \u{0926}\u{0941}\u{0928}\u{093F}\u{092F}\u{093E}", typewriter: [7, 13], wordByWord: [7, 13] },
  { name: "Thai: whole words", text: "\u{0E2A}\u{0E27}\u{0E31}\u{0E2A}\u{0E14}\u{0E35} \u{0E04}\u{0E23}\u{0E31}\u{0E1A}", typewriter: [7, 11], wordByWord: [7, 11] },
  { name: "CJK: each character is a word", text: "\u{4F60}\u{597D}\u{4E16}\u{754C}", typewriter: [1, 2, 3, 4], wordByWord: [1, 2, 3, 4] },
  { name: "CJK then Latin", text: "\u{65E5}\u{672C} go", typewriter: [1, 3, 4, 5], wordByWord: [1, 3, 5] },
  { name: "plain Latin", text: "fi", typewriter: [1, 2], wordByWord: [2] },
  { name: "only spaces: nothing to reveal", text: "   ", typewriter: [], wordByWord: [] },
  { name: "empty", text: "", typewriter: [], wordByWord: [] },
];
