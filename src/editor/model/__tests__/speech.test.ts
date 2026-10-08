jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
import { setTrackSound } from "../ops";
import { languagesOf, paceLabel, pickVoice, placeSpeech, speakableText, SPEECH_LIMITS, speechFileName, speechRate, speechRefusal, speechTracksOf, voiceLabel, voicesOf, type VoiceRow } from "../speech";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeOverlay, makeProject, makeSticker, type Overlay } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const text = (id: string, words: string, start = 2): Overlay => makeOverlay({ id, text: words, start, end: start + 3 });
const base = (overlays: Overlay[] = [text("o1", "Hello there")]) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays });
const made = (n: number, seconds = 2.5) => ({ id: `t${n}`, sourceUri: `${MEDIA}/${speechFileName("o1", `s${n}`)}`, seconds });

test("the limits", () => {
  expect(SPEECH_LIMITS).toEqual({ maxChars: 1000, titleChars: 24, pace: [0, 1], defaultPace: 0.5, rate: [0.35, 0.65] });
  expect(AUDIO_LIMITS.maxTracks).toBe(12);   // the tests below fill a project with twelve tracks
});

test("speakableText: emoji, joiners and variation selectors go; white space becomes single spaces", () => {
  expect(speakableText("  Hello   there \n friend ")).toBe("Hello there friend");
  expect(speakableText("Summer \u{1F31E}\u{1F334} vibes ❤\uFE0F")).toBe("Summer vibes");
  expect(speakableText("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}")).toBe("");                // a family emoji: three faces and two joiners
  expect(speakableText("\u{1F1EC}\u{1F1F7} 1\uFE0F\u20E3")).toBe("1");                      // a flag; a keycap keeps its digit
  expect(speakableText("   ")).toBe("");
  expect(speakableText("Καλημέρα κόσμε")).toBe("Καλημέρα κόσμε");
  expect(speakableText("price: 5 € — ok?")).toBe("price: 5 € — ok?");
});

test("speakableText: an emoji between two words leaves a space, never a joined word; skin tones, hearts on fire and tag flags go whole", () => {
  expect(speakableText("Summer\u{1F31E}vibes")).toBe("Summer vibes");
  expect(speakableText("hi \u{1F44B}\u{1F3FD} you")).toBe("hi you");                              // a waving hand with a skin tone
  expect(speakableText("love ❤\uFE0F\u200D\u{1F525} it")).toBe("love it");                         // heart, selector, joiner, fire
  expect(speakableText("\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F} Alba")).toBe("Alba");   // a flag spelled with tags
  expect(speakableText("go → there ▶ now ★")).toBe("go there now");
  expect(speakableText("\u{1F600}\u{1F600}\u{1F600}")).toBe("");
  expect(speakableText("\u{1F600} \u200F\u200E \u{1F600}")).toBe("");                               // only emoji and direction marks: nothing to read
});

test("speakableText: Arabic and other scripts pass through exactly, marks and all", () => {
  const arabic = "مرحبا بالعالم";
  expect(speakableText(arabic)).toBe(arabic);
  const vowelled = "السَّلَامُ عَلَيْكُمْ";                                   // shadda, fatha, damma, sukun stay on their letters
  expect(speakableText(vowelled)).toBe(vowelled);
  expect(speakableText(`  ${arabic}  \u{1F31E}\n Hello 123 ،؟ `)).toBe(`${arabic} Hello 123 ،؟`);
  expect(speakableText(`Clipy ${arabic} ❤\uFE0F ١٢٣`)).toBe(`Clipy ${arabic} ١٢٣`);
  expect(speakableText(`\u200F${arabic}\u200E ok`)).toBe(`\u200F${arabic}\u200E ok`);                         // direction marks inside a text stay where they are
  expect(speakableText("می\u200Cخواهم")).toBe("می\u200Cخواهم");   // Persian: the zero-width non-joiner is part of the word
  expect(speakableText("שלום עולם")).toBe("שלום עולם");
  expect(speakableText("こんにちは世界")).toBe("こんにちは世界");
  expect(speakableText("नमस्ते")).toBe("नमस्ते");
  expect(speakableText("Café déjà")).toBe("Café déjà");                                     // combining accents stay
  expect(speakableText("\u{1D4D7}\u{1D4F2}")).toBe("\u{1D4D7}\u{1D4F2}");                                   // letters above U+FFFF (script "Hi")
});

test("speakableText: a joiner between two letters is part of the word; beside an emoji or a space it goes", () => {
  expect(speakableText("क्\u200Dष")).toBe("क्\u200Dष");                               // Devanagari: the joiner shapes the cluster
  expect(speakableText("ه\u200Dـ")).toBe("ه\u200Dـ");                                     // Arabic: a joiner between two letters
  expect(speakableText("a\u200D b")).toBe("a b");
  expect(speakableText("a\u200D\u{1F600}b")).toBe("a b");
  expect(speakableText("\u200Dabc\u200D")).toBe("abc");
});

test("speakableText: half of a broken pair is dropped, and something that is not a string reads as nothing", () => {
  expect(speakableText("ab\uD83Dcd")).toBe("abcd");
  expect(speakableText("\uDE00")).toBe("");
  expect(speakableText(undefined as unknown as string)).toBe("");
  expect(speakableText(null as unknown as string)).toBe("");
});

test("speechRate: 0.35 at the slow end, the system's normal pace in the middle, 0.65 at the fast end", () => {
  expect([0, 0.25, 0.5, 0.75, 1].map(speechRate)).toEqual([0.35, 0.425, 0.5, 0.575, 0.65]);
  expect(speechRate(-3)).toBe(0.35);
  expect(speechRate(9)).toBe(0.65);
  expect(speechRate(NaN)).toBe(0.5);
  expect(["Slower", "Normal", "Faster"]).toEqual([paceLabel(0.2), paceLabel(0.5), paceLabel(0.8)]);
});

test("the file is named after the text it was read from, safely", () => {
  expect(speechFileName("o1", "s1")).toBe("speech-o1-s1.caf");
  expect(speechFileName("3f2a-11", "9c0d-22")).toBe("speech-3f2a-11-9c0d-22.caf");
  expect(speechFileName("../x y", "a/b")).toMatch(/^speech-[A-Za-z0-9_-]+\.caf$/);
  expect(speechFileName("نص", "\u{1F600}.caf")).toMatch(/^speech-[A-Za-z0-9_-]+\.caf$/);
});

test("two different texts never share a file name, whatever their ids look like", () => {
  const ids = ["a b", "a_b", "a-b", "a/b", "a.b", "A B", "a  b", "a", "ab", "", "_", "__"];
  const names = ids.map((id) => speechFileName(id, "s"));
  expect(new Set(names).size).toBe(ids.length);
  const stamps = ["1/2", "1_2", "1-2", "1.2"].map((s) => speechFileName("o", s));
  expect(new Set(stamps).size).toBe(4);
});

test("speechTracksOf: only this text's readings, by the file's name; an id that begins another id does not take its bars", () => {
  const at = (id: string, name: string) => makeAudioTrack({ id, sourceDuration: 2, kind: "voice", sourceUri: `${MEDIA}/${name}` });
  const p = { ...base([text("o1", "one"), text("o1-b", "two"), text("o10", "three"), text("a b", "four"), text("a_b", "five")]),
    audioTracks: [at("x1", speechFileName("o1", "s1")), at("x2", speechFileName("o1-b", "s2")), at("x3", speechFileName("o10", "s3")),
      at("x4", speechFileName("a b", "s4")), at("x5", speechFileName("a_b", "s5")), at("x6", "speech.caf"), at("x7", "voice-o1-s.caf"),
      at("x8", "speech-o1-s8.m4a"), makeAudioTrack({ id: "x9", sourceDuration: 2, sourceUri: `file:///doc/speech-o1-/music.caf` })] };
  expect(speechTracksOf(p, "o1").map((t) => t.id)).toEqual(["x1"]);
  expect(speechTracksOf(p, "o1-b").map((t) => t.id)).toEqual(["x2"]);
  expect(speechTracksOf(p, "o10").map((t) => t.id)).toEqual(["x3"]);
  expect(speechTracksOf(p, "a b").map((t) => t.id)).toEqual(["x4"]);
  expect(speechTracksOf(p, "a_b").map((t) => t.id)).toEqual(["x5"]);
  expect(speechTracksOf(p, "o")).toEqual([]);
  // Reading "o1" again leaves the bar of "o1-b" alone.
  const next = placeSpeech(p, "o1", { id: "new", sourceUri: `${MEDIA}/${speechFileName("o1", "s9")}`, seconds: 1 });
  expect(next.audioTracks.map((t) => t.id)).toEqual(["x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "new"]);
});

test("speechTracksOf: real ids (UUIDs) find their own bar and nobody else's", () => {
  const a = "3f2a9c0d-1b2c-4d5e-8f90-a1b2c3d4e5f6"; const b = "3f2a9c0d-1b2c-4d5e-8f90-a1b2c3d4e5f7";
  const stamp = "9c0d3f2a-aaaa-4bbb-8ccc-ddddeeeeffff";
  const p = { ...base([text(a, "one"), text(b, "two")]),
    audioTracks: [makeAudioTrack({ id: "ta", sourceDuration: 2, sourceUri: `${MEDIA}/${speechFileName(a, stamp)}` }), makeAudioTrack({ id: "tb", sourceDuration: 2, sourceUri: `${MEDIA}/${speechFileName(b, stamp)}` })] };
  expect(speechFileName(a, stamp)).toBe(`speech-${a}-${stamp}.caf`);
  expect(speechTracksOf(p, a).map((t) => t.id)).toEqual(["ta"]);
  expect(speechTracksOf(p, b).map((t) => t.id)).toEqual(["tb"]);
});

test("speechRefusal: not a text, nothing to read, too long, or no room for one more track", () => {
  const caption = { ...text("c1", "spoken words"), kind: "caption" } as Overlay;
  const p = base([text("o1", "Hello"), text("e", "\u{1F600} "), text("long", "a".repeat(1001)), text("edge", "a".repeat(1000)), caption, makeSticker({ id: "st" })]);
  expect(speechRefusal(p, "o1")).toBeNull();
  expect(speechRefusal(p, "nope")).toBe("notText");
  expect(speechRefusal(p, "c1")).toBe("notText");
  expect(speechRefusal(p, "st")).toBe("notText");
  expect(speechRefusal(p, "e")).toBe("noText");
  expect(speechRefusal(p, "long")).toBe("tooLong");
  expect(speechRefusal(p, "edge")).toBeNull();
  const full = { ...p, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) };
  expect(speechRefusal(full, "o1")).toBe("limit");
  // A reading of this text is already there: the new one takes its place, so the limit does not stand in the way.
  const replacing = { ...full, audioTracks: [...full.audioTracks.slice(1), makeAudioTrack({ id: "old", sourceDuration: 2, sourceUri: `${MEDIA}/speech-o1-s0.caf` })] };
  expect(speechRefusal(replacing, "o1")).toBeNull();
});

test("speechRefusal: the 1000 are counted after the emoji and the extra spaces are gone; Arabic counts letter by letter", () => {
  const p = base([text("pad", `${"a".repeat(1000)}   \u{1F600}\u{1F600}`), text("ar", "ب".repeat(1000)), text("ar+", "ب".repeat(1001)), text("arOnlyEmoji", "\u200F\u{1F600}")]);
  expect(speechRefusal(p, "pad")).toBeNull();
  expect(speechRefusal(p, "ar")).toBeNull();
  expect(speechRefusal(p, "ar+")).toBe("tooLong");
  expect(speechRefusal(p, "arOnlyEmoji")).toBe("noText");
});

test("placeSpeech: one voice track at the text's start, the whole file, titled with the first words", () => {
  const p0 = base([text("o1", "Hello there, this is a rather long sentence", 2)]);
  const p1 = placeSpeech(p0, "o1", made(1));
  expect(p1.audioTracks).toEqual([{ id: "t1", sourceUri: `${MEDIA}/speech-o1-s1.caf`, title: "Hello there, this is a r", sourceDuration: 2.5, start: 2, trimStart: 0, trimEnd: 2.5, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }]);
  expect("sound" in p1.audioTracks[0]).toBe(false);
  expect(speechTracksOf(p1, "o1").map((t) => t.id)).toEqual(["t1"]);
  expect(speechTracksOf(p1, "o2")).toEqual([]);
  // Nothing but the audio row (and the save stamp) changes.
  expect({ ...p1, audioTracks: p0.audioTracks, updatedAt: p0.updatedAt }).toEqual(p0);
  expect(p1.overlays).toBe(p0.overlays);
});

test("placeSpeech: the title is what is read (no emoji), never ends in a space and never in half a letter; the start is stored like every track's", () => {
  const arabic = "مرحبا بالعالم، هذا نص طويل للتجربة";
  const p0 = base([text("o1", `\u{1F31E} ${arabic}`, 1.23456), text("o2", `Hello there, this is an ${"x".repeat(9)}`), text("o3", `${"a".repeat(23)}\u{1D4D7}\u{1D4F2}`), text("o4", "Hi")]);
  const t1 = placeSpeech(p0, "o1", made(1)).audioTracks[0];
  expect(t1.title).toBe(arabic.slice(0, 24));
  expect(t1.start).toBe(1.235);
  expect(placeSpeech(p0, "o2", made(1)).audioTracks[0].title).toBe("Hello there, this is an");
  expect(placeSpeech(p0, "o3", made(1)).audioTracks[0].title).toBe(`${"a".repeat(23)}\u{1D4D7}`);
  expect(placeSpeech(p0, "o4", made(1, 0.3)).audioTracks[0]).toMatchObject({ title: "Hi", trimStart: 0, trimEnd: 0.3, sourceDuration: 0.3 });   // a reading shorter than a bar may be trimmed to is kept whole
});

test("placeSpeech again for the same text REPLACES: one bar where the earliest one was, keeping its volume, fades and sound setting", () => {
  let p = placeSpeech(base(), "o1", made(1));
  p = { ...p, audioTracks: p.audioTracks.map((t) => ({ ...t, start: 5, volume: 1.4, fadeIn: 0.5, trimStart: 0.3 })) };
  p = setTrackSound(p, "t1", { voice: "deep" });
  const later = makeAudioTrack({ id: "piece", sourceDuration: 2.5, sourceUri: `${MEDIA}/speech-o1-s1.caf`, start: 9, kind: "voice" });   // a duplicate of the reading
  const music = makeAudioTrack({ id: "m", sourceDuration: 30 });
  p = { ...p, audioTracks: [...p.audioTracks, later, music] };
  const next = placeSpeech(p, "o1", made(2, 3.2));
  expect(next.audioTracks.map((t) => t.id)).toEqual(["m", "t2"]);
  const bar = next.audioTracks[1];
  expect(bar).toMatchObject({ sourceUri: `${MEDIA}/speech-o1-s2.caf`, start: 5, volume: 1.4, fadeIn: 0.5, fadeOut: 0, trimStart: 0, trimEnd: 3.2, sourceDuration: 3.2, kind: "voice" });
  expect(bar.sound).toEqual(p.audioTracks[0].sound);
  expect(bar.sound).toMatchObject({ voice: "deep" });
  expect(bar.sound).not.toBe(p.audioTracks[0].sound);
  // One project out = one undo step: the project before still has its two bars, untouched.
  expect(p.audioTracks.map((t) => t.id)).toEqual(["t1", "piece", "m"]);
  expect(next.audioTracks[0]).toBe(music);
});

test("placeSpeech: a replaced bar without a sound setting gives a bar without one; a full project still lets a reading be replaced; the new id may be the old one", () => {
  const p1 = placeSpeech(base(), "o1", made(1));
  const p2 = placeSpeech(p1, "o1", made(2));
  expect(p2.audioTracks.map((t) => t.id)).toEqual(["t2"]);
  expect("sound" in p2.audioTracks[0]).toBe(false);
  const full = { ...p1, audioTracks: [...p1.audioTracks, ...Array.from({ length: 11 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 }))] };
  const again = placeSpeech(full, "o1", made(2));
  expect(again.audioTracks).toHaveLength(12);
  expect(again.audioTracks[11].id).toBe("t2");
  expect(placeSpeech(p1, "o1", made(1, 4)).audioTracks).toMatchObject([{ id: "t1", sourceDuration: 4 }]);
});

test("placeSpeech changes nothing for a text that is gone, a caption, a length that is not one, or a full project", () => {
  const p0 = base();
  expect(placeSpeech(p0, "nope", made(1))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, 0))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, NaN))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, -2))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, Infinity))).toBe(p0);
  const full = { ...p0, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) };
  expect(placeSpeech(full, "o1", made(1))).toBe(full);
  const caption = base([{ ...text("o1", "spoken words"), kind: "caption" } as Overlay]);
  expect(placeSpeech(caption, "o1", made(1))).toBe(caption);
});

test("placeSpeech changes nothing when the text has since become unreadable, or the new id is another track's — and the earlier reading stays", () => {
  const read = placeSpeech(base(), "o1", made(1));
  const withText = (words: string) => ({ ...read, overlays: [text("o1", words)] });
  const emoji = withText("\u{1F600}\u{1F600}");
  expect(placeSpeech(emoji, "o1", made(2))).toBe(emoji);
  const long = withText("a".repeat(1001));
  expect(placeSpeech(long, "o1", made(2))).toBe(long);
  const taken = { ...read, audioTracks: [...read.audioTracks, makeAudioTrack({ id: "t2", sourceDuration: 5 })] };
  expect(placeSpeech(taken, "o1", made(2))).toBe(taken);
  expect(taken.audioTracks.map((t) => t.id)).toEqual(["t1", "t2"]);
});

const VOICES: VoiceRow[] = [
  { id: "en.samantha", name: "Samantha", language: "en-US", languageName: "English (United States)", quality: 1 },
  { id: "en.ava", name: "Ava", language: "en-US", languageName: "English (United States)", quality: 3 },
  { id: "en.daniel", name: "Daniel", language: "en-GB", languageName: "English (United Kingdom)", quality: 2 },
  { id: "el.melina", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 },
];

test("languages: the phone's own first, then by name; voices: best quality first, then by name", () => {
  expect(languagesOf(VOICES, "el-GR").map((l) => l.code)).toEqual(["el-GR", "en-GB", "en-US"]);
  expect(languagesOf(VOICES, "fr-FR").map((l) => l.code)).toEqual(["en-GB", "en-US", "el-GR"]);
  expect(languagesOf(VOICES, "en-US")[0]).toEqual({ code: "en-US", name: "English (United States)" });
  expect(voicesOf(VOICES, "en-US").map((v) => v.id)).toEqual(["en.ava", "en.samantha"]);
  expect(voicesOf(VOICES, "xx")).toEqual([]);
  expect(VOICES.map(voiceLabel)).toEqual(["Samantha", "Ava · Premium", "Daniel · Enhanced", "Melina"]);
  expect(voiceLabel({ ...VOICES[0], quality: 9 })).toBe("Samantha");
  expect(VOICES.map((v) => v.id)).toEqual(["en.samantha", "en.ava", "en.daniel", "el.melina"]);   // the list handed in is not reordered
});

test("languages: after the phone's own come the others of the same language (an Arabic phone finds Arabic first)", () => {
  const more: VoiceRow[] = [...VOICES,
    { id: "ar.maged", name: "Maged", language: "ar-001", languageName: "Arabic (World)", quality: 1 },
    { id: "ar.majed", name: "ماجد", language: "ar-001", languageName: "Arabic (World)", quality: 2 }];
  expect(languagesOf(more, "ar-SA").map((l) => l.code)).toEqual(["ar-001", "en-GB", "en-US", "el-GR"]);
  expect(languagesOf(more, "en-US").map((l) => l.code)).toEqual(["en-US", "en-GB", "ar-001", "el-GR"]);
  expect(pickVoice(more, "ar-SA", null)?.id).toBe("ar.majed");
  expect(pickVoice(more, "ar", null)?.id).toBe("ar.majed");
  expect(voiceLabel(more[5])).toBe("ماجد · Enhanced");
});

test("pickVoice: the remembered voice if it is still installed, else the best of the phone's language, else of its base language, else the first", () => {
  expect(pickVoice(VOICES, "el-GR", "en.daniel")?.id).toBe("en.daniel");
  expect(pickVoice(VOICES, "en-US", "gone")?.id).toBe("en.ava");
  expect(pickVoice(VOICES, "en-AU", null)?.id).toBe("en.daniel");          // no en-AU voice: another English one, the first by language name
  expect(pickVoice(VOICES, "fr-FR", null)?.id).toBe("en.daniel");          // nothing French: the first row of the first language shown
  expect(pickVoice([], "en-US", null)).toBeNull();
});
