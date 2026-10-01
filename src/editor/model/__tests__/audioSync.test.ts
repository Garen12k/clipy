import { makeAudioTrack } from "../types";
import { isAudible, songTimeAt, trackEnd } from "../audioSync";

const t = makeAudioTrack({ id: "m", sourceDuration: 60, start: 2, trimStart: 10, trimEnd: 15 }); // plays 2 → 7

test("maps the playhead into the song", () => {
  expect(trackEnd(t)).toBe(7);
  expect(songTimeAt(t, 1.9)).toBeNull();
  expect(songTimeAt(t, 2)).toBe(10);
  expect(songTimeAt(t, 4.5)).toBe(12.5);
  expect(songTimeAt(t, 7)).toBeNull();
  expect(isAudible(t, 3)).toBe(true);
  expect(isAudible(t, 8)).toBe(false);
});
