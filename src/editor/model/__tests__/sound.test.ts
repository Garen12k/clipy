import { EQ_IDS, makeAudioTrack, makeProject, NO_SOUND, VOICE_IDS, type SoundSettings } from "../types";
import { BAND_TYPES, DISTORTION_PRESETS, EQ_TABLE, neededSounds, PITCH_CENTS_LIMIT, REVERB_PRESETS, SOUND_VERSION, soundChain, soundFileName, VOICE_TABLE } from "../sound";

const set = (patch: Partial<SoundSettings>): SoundSettings => ({ ...NO_SOUND, ...patch });
const voice = (id: SoundSettings["voice"], strength: number) => soundChain(set({ voice: id, strength }));
const NEUTRAL = { pitchCents: 0, distortionPreset: "", distortionWet: 0, distortionPreGain: -6, delayTime: 0, delayFeedback: 0, delayWet: 0, delayLowPass: 15000, reverbPreset: "", reverbWet: 0, bands: [], level: false };

test("no setting is a chain that does nothing", () => {
  expect(soundChain(NO_SOUND)).toEqual(NEUTRAL);
  expect(soundChain(set({ strength: 1 }))).toEqual(NEUTRAL);        // strength alone does nothing
  expect(soundChain(set({ level: true }))).toEqual({ ...NEUTRAL, level: true });
});

test("Deep, High, Chipmunk are pitch only, at strength 0 / 0.5 / 1", () => {
  expect([0, 0.5, 1].map((s) => voice("deep", s).pitchCents)).toEqual([-200, -450, -700]);
  expect([0, 0.5, 1].map((s) => voice("high", s).pitchCents)).toEqual([200, 400, 600]);
  expect([0, 0.5, 1].map((s) => voice("chipmunk", s).pitchCents)).toEqual([700, 950, 1200]);
  for (const id of ["deep", "high", "chipmunk"] as const) expect({ ...voice(id, 0.5), pitchCents: 0 }).toEqual(NEUTRAL);
});

test("Robot: a 12 ms feedback delay, a slight pitch drop and a little distortion", () => {
  expect(voice("robot", 0)).toEqual({ ...NEUTRAL, pitchCents: -100, delayTime: 0.012, delayFeedback: 55, delayWet: 35, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 8, distortionPreGain: -6 });
  expect(voice("robot", 0.5)).toEqual({ ...NEUTRAL, pitchCents: -200, delayTime: 0.012, delayFeedback: 70, delayWet: 52.5, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 19, distortionPreGain: -6 });
  expect(voice("robot", 1)).toEqual({ ...NEUTRAL, pitchCents: -300, delayTime: 0.012, delayFeedback: 85, delayWet: 70, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 30, distortionPreGain: -6 });
});

test("Echo and Hall", () => {
  expect(voice("echo", 0)).toEqual({ ...NEUTRAL, delayTime: 0.22, delayFeedback: 25, delayWet: 20, delayLowPass: 6000 });
  expect(voice("echo", 0.5)).toEqual({ ...NEUTRAL, delayTime: 0.3, delayFeedback: 40, delayWet: 35, delayLowPass: 6000 });
  expect(voice("echo", 1)).toEqual({ ...NEUTRAL, delayTime: 0.38, delayFeedback: 55, delayWet: 50, delayLowPass: 6000 });
  expect([0, 0.5, 1].map((s) => voice("hall", s))).toEqual([15, 37.5, 60].map((reverbWet) => ({ ...NEUTRAL, reverbPreset: "largeHall", reverbWet })));
});

test("Telephone is three bands that close in with the strength", () => {
  const bands = (s: number) => voice("telephone", s).bands;
  expect(bands(0)).toEqual([{ type: "highPass", frequency: 200, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 5000, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 2, bandwidth: 1 }]);
  expect(bands(0.5)).toEqual([{ type: "highPass", frequency: 350, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 3800, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 5, bandwidth: 1 }]);
  expect(bands(1)).toEqual([{ type: "highPass", frequency: 500, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 2600, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 8, bandwidth: 1 }]);
  expect({ ...voice("telephone", 0.5), bands: [] }).toEqual(NEUTRAL);
});

test("the Pitch slider adds whole semitones to the voice's own pitch, inside the unit's range", () => {
  expect(soundChain(set({ pitch: -3 })).pitchCents).toBe(-300);
  expect(soundChain(set({ voice: "deep", strength: 0.5, pitch: 2 })).pitchCents).toBe(-250);
  expect(soundChain(set({ voice: "chipmunk", strength: 1, pitch: 12 })).pitchCents).toBe(PITCH_CENTS_LIMIT);
  expect(soundChain(set({ voice: "deep", strength: 1, pitch: -12 })).pitchCents).toBe(-1900);
  expect(PITCH_CENTS_LIMIT).toBe(2400);
});

test("the equaliser presets are band tables; a voice's own bands come first", () => {
  expect(soundChain(set({ eq: "bassBoost" })).bands).toEqual([{ type: "lowShelf", frequency: 110, gain: 6, bandwidth: 1 }, { type: "parametric", frequency: 250, gain: -1.5, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "clearVoice" })).bands).toEqual([{ type: "highPass", frequency: 90, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 300, gain: -3, bandwidth: 1 },
    { type: "parametric", frequency: 3200, gain: 4, bandwidth: 1.2 }, { type: "highShelf", frequency: 9000, gain: 2, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "warm" })).bands).toEqual([{ type: "lowShelf", frequency: 200, gain: 3, bandwidth: 1 }, { type: "parametric", frequency: 3500, gain: -2, bandwidth: 1.5 }, { type: "highShelf", frequency: 8000, gain: -3, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "bright" })).bands).toEqual([{ type: "parametric", frequency: 3000, gain: 2, bandwidth: 1 }, { type: "highShelf", frequency: 6500, gain: 5, bandwidth: 1 }]);
  const both = soundChain(set({ voice: "telephone", strength: 0.5, eq: "warm" })).bands;
  expect(both.map((b) => b.type)).toEqual(["highPass", "lowPass", "parametric", "lowShelf", "parametric", "highShelf"]);
  // A fresh array every time: a caller may not change the table through it.
  expect(soundChain(set({ eq: "warm" })).bands).not.toBe(soundChain(set({ eq: "warm" })).bands);
  const mine = soundChain(set({ eq: "warm" })).bands;
  mine[0].gain = 99;
  expect(soundChain(set({ eq: "warm" })).bands[0].gain).toBe(3);
});

test("the tables have a row for every id, and no other", () => {
  expect(Object.keys(VOICE_TABLE)).toEqual([...VOICE_IDS]);
  expect(Object.keys(EQ_TABLE)).toEqual([...EQ_IDS]);
});

test("everything a chain may name is a name the native side knows; every number is finite", () => {
  expect(BAND_TYPES).toEqual(["parametric", "lowShelf", "highShelf", "highPass", "lowPass"]);
  expect(REVERB_PRESETS).toHaveLength(14);
  expect(DISTORTION_PRESETS).toHaveLength(22);
  expect(new Set(REVERB_PRESETS).size).toBe(14);
  expect(new Set(DISTORTION_PRESETS).size).toBe(22);
  for (const id of VOICE_IDS) for (const s of [0, 0.25, 0.5, 1]) {
    const c = voice(id, s);
    expect(c.reverbPreset === "" || REVERB_PRESETS.includes(c.reverbPreset)).toBe(true);
    expect(c.distortionPreset === "" || DISTORTION_PRESETS.includes(c.distortionPreset)).toBe(true);
    for (const b of c.bands) { expect(BAND_TYPES).toContain(b.type); expect([b.frequency, b.gain, b.bandwidth].every(Number.isFinite)).toBe(true); }
    for (const n of [c.pitchCents, c.distortionWet, c.distortionPreGain, c.delayTime, c.delayFeedback, c.delayWet, c.delayLowPass, c.reverbWet]) expect(Number.isFinite(n)).toBe(true);
    expect(c.delayTime).toBeLessThanOrEqual(2);
  }
});

test("a setting that is not a number never reaches a unit: strength stays inside 0 … 1, pitch inside the unit's range", () => {
  const numbers = (c: ReturnType<typeof soundChain>) => [c.pitchCents, c.distortionWet, c.distortionPreGain, c.delayTime, c.delayFeedback, c.delayWet, c.delayLowPass, c.reverbWet,
    ...c.bands.flatMap((b) => [b.frequency, b.gain, b.bandwidth])];
  for (const id of [null, ...VOICE_IDS]) for (const strength of [NaN, Infinity, -Infinity, -3, 7]) for (const pitch of [NaN, Infinity, -Infinity, 1e9, -1e9, 2.4]) {
    const c = soundChain(set({ voice: id, strength, pitch }));
    expect(numbers(c).every(Number.isFinite)).toBe(true);
    expect(Math.abs(c.pitchCents)).toBeLessThanOrEqual(PITCH_CENTS_LIMIT);
    expect(Object.is(c.pitchCents, -0)).toBe(false);
  }
  expect(voice("robot", 7)).toEqual(voice("robot", 1));
  expect(voice("robot", -3)).toEqual(voice("robot", 0));
  expect(voice("robot", NaN)).toEqual(voice("robot", 0));
  expect(soundChain(set({ pitch: 2.4 })).pitchCents).toBe(200);               // whole semitones only
  // An id that is not in the table (a hand-edited file that skipped the sanity pass) is no voice / no equaliser, not a crash.
  expect(soundChain(set({ voice: "toString" as never, eq: "constructor" as never }))).toEqual(NEUTRAL);
});

test("soundFileName: the source's name and the setting, nothing else", () => {
  expect(SOUND_VERSION).toBe(1);
  expect(soundFileName("file:///doc/projects/p1/media/abc.mov", { voice: "deep", strength: 0.5, pitch: -3, eq: "warm", level: true })).toBe("abc-v1-deep-s50-pm3-warm-l1.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ pitch: 2 }))).toBe("abc-v1-plain-s0-p2-flat-l0.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ pitch: 2, strength: 0.9 }))).toBe("abc-v1-plain-s0-p2-flat-l0.m4a");   // strength without a voice does not count
  expect(soundFileName("file:///x/my song (1).mp3", set({ level: true }))).toBe("my_song__1_-v1-plain-s0-p0-flat-l1.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ voice: "echo", strength: 0.33 }))).toBe("abc-v1-echo-s33-p0-flat-l0.m4a");
  expect(soundFileName("file:///x/a.m4a", set({ voice: "echo" }))).not.toBe(soundFileName("file:///x/b.m4a", set({ voice: "echo" })));
});

test("soundFileName names what soundChain plays: the same numbers, read the same way", () => {
  expect(soundFileName("file:///x/abc.m4a", set({ voice: "echo", strength: NaN, pitch: NaN }))).toBe("abc-v1-echo-s0-p0-flat-l0.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ voice: "echo", strength: 7 }))).toBe("abc-v1-echo-s100-p0-flat-l0.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ pitch: -0.4 }))).toBe("abc-v1-plain-s0-p0-flat-l0.m4a");   // rounds to 0: no "m"
  expect(soundFileName("", NO_SOUND)).toBe("-v1-plain-s0-p0-flat-l0.m4a");
  // Only letters, digits, _ and - from the source: the name is always one safe path segment.
  expect(soundFileName("file:///x/..%2F..%2Fé ü.m4a", set({ level: true }))).toMatch(/^[A-Za-z0-9_-]+\.m4a$/);
});

test("neededSounds: one entry per different copy the project plays; none for a track as recorded or a missing file", () => {
  const deep = set({ voice: "deep" });
  const p = makeProject({ audioTracks: [
    makeAudioTrack({ id: "plain", sourceDuration: 5 }),
    { ...makeAudioTrack({ id: "a", sourceDuration: 5, sourceUri: "file:///m/v.m4a" }), sound: deep },
    { ...makeAudioTrack({ id: "b", sourceDuration: 5, sourceUri: "file:///m/v.m4a", start: 5 }), sound: deep },        // the other half of a split: the same copy
    { ...makeAudioTrack({ id: "c", sourceDuration: 5, sourceUri: "file:///m/v.m4a" }), sound: set({ voice: "high" }) },
    { ...makeAudioTrack({ id: "gone", sourceDuration: 5, sourceUri: "file:///m/gone.m4a" }), sound: deep },
  ] });
  const before = JSON.stringify(p);
  expect(neededSounds(p, ["file:///m/gone.m4a"])).toEqual([
    { name: "v-v1-deep-s50-p0-flat-l0.m4a", sourceUri: "file:///m/v.m4a", sound: deep },
    { name: "v-v1-high-s50-p0-flat-l0.m4a", sourceUri: "file:///m/v.m4a", sound: set({ voice: "high" }) },
  ]);
  expect(neededSounds(p).map((n) => n.name)).toContain("gone-v1-deep-s50-p0-flat-l0.m4a");
  expect(neededSounds(makeProject())).toEqual([]);
  expect(JSON.stringify(p)).toBe(before);                                    // reading never changes the project
});
