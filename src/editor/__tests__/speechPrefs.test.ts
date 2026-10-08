import { loadSpeechPrefs, saveSpeechPrefs, SPEECH_PREFS_KEY } from "../speechPrefs";

beforeEach(() => { localStorage.removeItem(SPEECH_PREFS_KEY); });

test("nothing stored: no voice yet, the normal pace", () => {
  expect(SPEECH_PREFS_KEY).toBe("clipy.readAloud.v1");
  expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
});

test("what is saved is read back, with the pace kept in range", () => {
  saveSpeechPrefs({ voiceId: "en.ava", pace: 0.8 });
  expect(loadSpeechPrefs()).toEqual({ voiceId: "en.ava", pace: 0.8 });
  saveSpeechPrefs({ voiceId: "en.ava", pace: 7 });
  expect(loadSpeechPrefs()).toEqual({ voiceId: "en.ava", pace: 1 });
  saveSpeechPrefs({ voiceId: null, pace: -3 });
  expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0 });
});

test("junk in storage counts as nothing stored", () => {
  for (const junk of ["", "{", "[]", "null", "7", '"en.ava"', '{"voiceId":5,"pace":"fast"}', '{"voiceId":"en.ava"}', '{"voiceId":"en.ava","pace":null}', '{"pace":0.8}']) {
    localStorage.setItem(SPEECH_PREFS_KEY, junk);
    expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
  }
});

test("each answer is its own object: changing one does not change the next", () => {
  const first = loadSpeechPrefs();
  first.pace = 1;
  first.voiceId = "x";
  expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
});

test("storage that fails: the defaults when reading, nothing thrown when saving", () => {
  const real = globalThis.localStorage;
  const broken = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); }, removeItem: () => {} };
  (globalThis as { localStorage: unknown }).localStorage = broken;
  try {
    expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
    expect(() => saveSpeechPrefs({ voiceId: "en.ava", pace: 0.8 })).not.toThrow();
  } finally {
    (globalThis as { localStorage: unknown }).localStorage = real;
  }
});
