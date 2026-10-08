import { setTrackSound } from "../ops";
import { clampSound, isNeutralSound, makeAudioTrack, makeProject, NO_SOUND, NOISE_LIMITS, SCHEMA_VERSION, type SoundSettings } from "../types";

test("schema is v20; the noise strength runs 0–1 and starts in the middle; the sound as recorded has no noise key", () => {
  expect(SCHEMA_VERSION).toBe(20);
  expect(NOISE_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5 });
  expect("noise" in NO_SOUND).toBe(false);
  expect("sound" in makeAudioTrack({ id: "m", sourceDuration: 5 })).toBe(false);
});

test("a noise strength alone is a setting", () => {
  expect(isNeutralSound(NO_SOUND)).toBe(true);
  expect(isNeutralSound({ ...NO_SOUND, noise: 0.5 })).toBe(false);
  expect(isNeutralSound({ ...NO_SOUND, noise: 0 })).toBe(false);          // on at the lightest strength is still on
});

test("clampSound: a usable strength is kept in range, to 2 decimals; anything else leaves no key", () => {
  const base = { voice: "deep", strength: 0.8, pitch: -3, eq: "warm", level: true };
  expect(clampSound({ ...base, noise: 0.5 })).toEqual({ ...base, noise: 0.5 });
  expect(clampSound({ ...base, noise: 7 })).toEqual({ ...base, noise: 1 });
  expect(clampSound({ ...base, noise: -1 })).toEqual({ ...base, noise: 0 });
  expect(clampSound({ ...base, noise: 0.333 })).toEqual({ ...base, noise: 0.33 });
  for (const junk of [undefined, null, "0.5", true, NaN, Infinity, {}]) {
    const s = clampSound({ ...base, noise: junk });
    expect(s).toEqual(base);
    expect(s !== null && "noise" in s).toBe(false);                        // absent, not undefined
  }
  expect(clampSound({ noise: 0.5 })).toEqual({ ...NO_SOUND, noise: 0.5 });
  expect(clampSound({ noise: "x" })).toBeNull();                           // nothing else set: as recorded
  const once = clampSound({ ...base, noise: 0.333 });
  expect(clampSound(once)).toEqual(once);                                  // idempotent
  expect(clampSound(base)).toEqual(base);                                  // a v18 setting is what it was
  expect("noise" in (clampSound(base) as SoundSettings)).toBe(false);
});

test("setTrackSound switches noise on, changes its strength and takes the key away again (the op is unchanged)", () => {
  const p0 = makeProject({ audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] });
  const p1 = setTrackSound(p0, "v", { noise: NOISE_LIMITS.defaultStrength });
  expect(p1.audioTracks[0].sound).toEqual({ ...NO_SOUND, noise: 0.5 });
  const p2 = setTrackSound(p1, "v", { noise: 0.9 });
  expect(p2.audioTracks[0].sound?.noise).toBe(0.9);
  expect(setTrackSound(p2, "v", { noise: 0.9 })).toBe(p2);                 // nothing changes: same project
  const p3 = setTrackSound(p2, "v", { noise: undefined });
  expect("sound" in p3.audioTracks[0]).toBe(false);                        // nothing else was set: as recorded again
  const withVoice = setTrackSound(setTrackSound(p0, "v", { voice: "deep" }), "v", { noise: 0.25 });
  const off = setTrackSound(withVoice, "v", { noise: undefined });
  expect(off.audioTracks[0].sound).toEqual({ ...NO_SOUND, voice: "deep" });
  expect("noise" in (off.audioTracks[0].sound as SoundSettings)).toBe(false);
  expect(setTrackSound(withVoice, "v", { eq: "warm" }).audioTracks[0].sound?.noise).toBe(0.25);   // another tool keeps it
});
