import { makeAudioTrack } from "../types";
import { songTimeAt, trackEnd } from "../audioSync";

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
