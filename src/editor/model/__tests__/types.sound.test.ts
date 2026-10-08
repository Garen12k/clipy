import { clampSound, EQ_IDS, isNeutralSound, makeAudioTrack, NO_SOUND, SCHEMA_VERSION, SOUND_LIMITS, VOICE_IDS, type SoundSettings } from "../types";

test("schema is v18; the voices, the equaliser presets and their limits are as specified", () => {
  expect(SCHEMA_VERSION).toBe(18);
  expect(VOICE_IDS).toEqual(["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"]);
  expect(EQ_IDS).toEqual(["bassBoost", "clearVoice", "warm", "bright"]);
  expect(SOUND_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5, pitch: [-12, 12] });
  expect(NO_SOUND).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: false });
});

test("no factory writes the field: a new track has the shape it always had", () => {
  expect("sound" in makeAudioTrack({ id: "m", sourceDuration: 5 })).toBe(false);
});

test("isNeutralSound: no voice, no pitch, no equaliser, level off (the strength does not count)", () => {
  expect(isNeutralSound(NO_SOUND)).toBe(true);
  expect(isNeutralSound({ ...NO_SOUND, strength: 0.9 })).toBe(true);
  for (const s of [{ voice: "deep" }, { pitch: 1 }, { pitch: -1 }, { eq: "warm" }, { level: true }] as Partial<SoundSettings>[]) expect(isNeutralSound({ ...NO_SOUND, ...s })).toBe(false);
});

test("clampSound: a usable setting is kept with every value in range; a neutral or unusable one is null", () => {
  const full = { voice: "robot", strength: 0.8, pitch: -3, eq: "warm", level: true };
  expect(clampSound(full)).toEqual(full);
  expect(clampSound({ ...full, extra: 1 })).toEqual(full);                                   // unknown keys dropped
  expect(clampSound({ ...full, strength: 4 })).toEqual({ ...full, strength: 1 });
  expect(clampSound({ ...full, strength: -1 })).toEqual({ ...full, strength: 0 });
  expect(clampSound({ ...full, strength: NaN })).toEqual({ ...full, strength: 0.5 });
  expect(clampSound({ ...full, strength: 0.333 })).toEqual({ ...full, strength: 0.33 });     // 2 decimals
  expect(clampSound({ ...full, pitch: 40 })).toEqual({ ...full, pitch: 12 });
  expect(clampSound({ ...full, pitch: -40 })).toEqual({ ...full, pitch: -12 });
  expect(clampSound({ ...full, pitch: 2.6 })).toEqual({ ...full, pitch: 3 });                // whole steps
  expect(clampSound({ ...full, pitch: "x" })).toEqual({ ...full, pitch: 0 });
  expect(clampSound({ ...full, voice: "alien" })).toEqual({ ...full, voice: null });
  expect(clampSound({ ...full, eq: "loud" })).toEqual({ ...full, eq: null });
  expect(clampSound({ ...full, level: "yes" })).toEqual({ ...full, level: false });
  expect(clampSound({ voice: "deep" })).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
  expect(clampSound({ pitch: -0.2 })).toBeNull();                                            // rounds to 0: neutral
  for (const junk of [null, undefined, "deep", 3, [], {}, NO_SOUND, { voice: "alien", eq: "loud" }, { strength: 1 }]) expect(clampSound(junk)).toBeNull();
  const once = clampSound({ ...full, strength: 0.333, pitch: 2.6 });
  expect(clampSound(once)).toEqual(once);                                                    // idempotent
});
