import { makeAudioTrack } from "../types";
import { HANDOFF_LEAD } from "@/src/editor/previewHandoff";
import { AUDIO_LEAD, audioSyncStep, songTimeAt, trackEnd, trackPhaseAt, type PlayerRun } from "../audioSync";

const t = makeAudioTrack({ id: "m", sourceDuration: 60, start: 2, trimStart: 10, trimEnd: 15 }); // plays 2 → 7

test("isAudible is gone: songTimeAt is the only question asked", () => {
  expect((jest.requireActual("../audioSync") as Record<string, unknown>).isAudible).toBeUndefined();
});

test("maps the playhead into the song", () => {
  expect(trackEnd(t)).toBe(7);
  expect(songTimeAt(t, 1.9)).toBeNull();
  expect(songTimeAt(t, 2)).toBe(10);
  expect(songTimeAt(t, 4.5)).toBe(12.5);
  expect(songTimeAt(t, 7)).toBeNull();
});

describe("the silent early start of a track's player", () => {
  const IDLE: PlayerRun = { started: false, rolling: null };
  const STARTED: PlayerRun = { started: true, rolling: null };
  const ROLLING: PlayerRun = { started: false, rolling: { start: 2, trimStart: 10 } };
  const NOTHING = { pause: false, start: null, park: null, drift: null };

  test("the lead is the video hand-over's: one constant, not a second literal", () => {
    expect(AUDIO_LEAD).toBe(HANDOFF_LEAD);
    expect(AUDIO_LEAD).toBe(0.22);
  });

  test("the phase: inside the track; in the lead before its start, only while playing; outside otherwise", () => {
    expect(trackPhaseAt(t, 2, true)).toBe("inside");
    expect(trackPhaseAt(t, 6.99, false)).toBe("inside");
    expect(trackPhaseAt(t, 1.5, true)).toBe("outside");
    expect(trackPhaseAt(t, 1.77, true)).toBe("outside");     // 0.23 before
    expect(trackPhaseAt(t, 1.78125, true)).toBe("preroll");  // 0.21875 before
    expect(trackPhaseAt(t, 2 - AUDIO_LEAD, true)).toBe("preroll");
    expect(trackPhaseAt(t, 1.99, true)).toBe("preroll");
    expect(trackPhaseAt(t, 1.9, false)).toBe("outside");     // paused: never
    expect(trackPhaseAt(t, 7, true)).toBe("outside");        // past its end
  });

  test("a track at the project's start has no lead (the playhead is never before 0); one with no length is never started", () => {
    const first = makeAudioTrack({ id: "a", sourceDuration: 5 });
    expect(trackPhaseAt(first, 0, true)).toBe("inside");
    const empty = makeAudioTrack({ id: "e", sourceDuration: 5, start: 2, trimStart: 3, trimEnd: 3 });
    for (const at of [1.9, 2, 2.1]) expect(trackPhaseAt(empty, at, true)).toBe("outside");
  });

  test("playing towards the track: nothing before the lead, then one silent start from the track's first sample", () => {
    expect(audioSyncStep(t, 1.5, true, IDLE)).toEqual({ ...NOTHING, next: IDLE });
    expect(audioSyncStep(t, 1.8, true, IDLE)).toEqual({ ...NOTHING, start: 10, next: ROLLING });
    // Rolling: every later tick before the start leaves it alone — never two starts.
    expect(audioSyncStep(t, 1.85, true, ROLLING)).toEqual({ ...NOTHING, next: ROLLING });
    expect(audioSyncStep(t, 1.99, true, ROLLING)).toEqual({ ...NOTHING, next: ROLLING });
  });

  test("the start is reached rolling: no seek, no second play — it is simply the track's player from here on", () => {
    expect(audioSyncStep(t, 2, true, ROLLING)).toEqual({ ...NOTHING, drift: 10, next: STARTED });
    expect(audioSyncStep(t, 2.0625, true, ROLLING)).toEqual({ ...NOTHING, drift: 10.0625, next: STARTED });
    expect(audioSyncStep(t, 2.125, true, STARTED)).toEqual({ ...NOTHING, drift: 10.125, next: STARTED });
  });

  test("entering the track without a lead (a seek into it, Play inside it) is the cold start it always was", () => {
    expect(audioSyncStep(t, 4.5, true, IDLE)).toEqual({ ...NOTHING, start: 12.5, next: STARTED });
    expect(audioSyncStep(t, 2, true, IDLE)).toEqual({ ...NOTHING, start: 10, next: STARTED });
  });

  test("the start is not coming after all: the rolling player is paused, and the next start seeks again", () => {
    expect(audioSyncStep(t, 1.9, false, ROLLING)).toEqual({ ...NOTHING, pause: true, next: IDLE });          // paused
    expect(audioSyncStep(t, 0.5, true, ROLLING)).toEqual({ ...NOTHING, pause: true, next: IDLE });           // a seek away, before
    expect(audioSyncStep(t, 9, true, ROLLING)).toEqual({ ...NOTHING, pause: true, next: IDLE });             // … or past its end
    expect(audioSyncStep({ ...t, start: 5 }, 1.9, true, ROLLING)).toEqual({ ...NOTHING, pause: true, next: IDLE }); // the track moved away
    // A seek into the middle of the track is not the start it was rolling for: stopped and started from there.
    expect(audioSyncStep(t, 4.5, true, ROLLING)).toEqual({ ...NOTHING, pause: true, start: 12.5, next: STARTED });
    // The track changed under it (another start, another place in the file) but its start is still ahead: again, from the new place.
    expect(audioSyncStep({ ...t, trimStart: 11 }, 1.9, true, ROLLING)).toEqual({ ...NOTHING, pause: true, start: 11, next: { started: false, rolling: { start: 2, trimStart: 11 } } });
    expect(audioSyncStep({ ...t, start: 2.0625 }, 1.9, true, ROLLING)).toEqual({ ...NOTHING, pause: true, start: 10, next: { started: false, rolling: { start: 2.0625, trimStart: 10 } } });
    // … and when the changed track is now under the playhead.
    expect(audioSyncStep({ ...t, start: 1.5 }, 1.75, true, ROLLING)).toEqual({ ...NOTHING, pause: true, start: 10.25, next: STARTED });
    // A trim of its END leaves the start it is rolling for alone.
    expect(audioSyncStep({ ...t, trimEnd: 14 }, 1.9, true, ROLLING)).toEqual({ ...NOTHING, next: ROLLING });
  });

  test("leaving, pausing and parking are what they were", () => {
    expect(audioSyncStep(t, 7, true, STARTED)).toEqual({ ...NOTHING, pause: true, next: IDLE });
    expect(audioSyncStep(t, 4, false, STARTED)).toEqual({ ...NOTHING, pause: true, park: 12, next: IDLE });
    expect(audioSyncStep(t, 4, false, IDLE)).toEqual({ ...NOTHING, park: 12, next: IDLE });
    expect(audioSyncStep(t, 1, false, IDLE)).toEqual({ ...NOTHING, next: IDLE });
    // Playing, the playhead jumps back from inside the track to just before it: stopped, then started silent for the start again.
    expect(audioSyncStep(t, 1.9, true, STARTED)).toEqual({ ...NOTHING, pause: true, start: 10, next: ROLLING });
  });
});
