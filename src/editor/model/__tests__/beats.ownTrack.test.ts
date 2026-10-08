import { beatTrack } from "../beats";
import { makeAudioTrack, makeClip, makeProject } from "../types";

const clips = [makeClip({ id: "a", sourceDuration: 10 })];
const voice = makeAudioTrack({ id: "voice", sourceDuration: 20, kind: "voice" });
const sfx = makeAudioTrack({ id: "clipSound", sourceDuration: 12, kind: "sfx", start: 2 });
const music = makeAudioTrack({ id: "song", sourceDuration: 90, start: 1 });

test("with music in the project nothing changed: the selected music, else the first music, whatever else is selected", () => {
  const p = makeProject({ clips, audioTracks: [voice, sfx, music] });
  expect(beatTrack(p, null)?.id).toBe("song");
  expect(beatTrack(p, "voice")?.id).toBe("song");
  expect(beatTrack(p, "clipSound")?.id).toBe("song");
  expect(beatTrack(p, "song")?.id).toBe("song");
  expect(beatTrack(p, "gone")?.id).toBe("song");
});

test("with several music tracks nothing changed either: the selected one, else the one that starts first (list order on a tie), and the very track object", () => {
  const late = makeAudioTrack({ id: "late", sourceDuration: 5, start: 4 }), early = makeAudioTrack({ id: "early", sourceDuration: 5, start: 1 });
  const tie = makeAudioTrack({ id: "tie", sourceDuration: 5, start: 1 });
  const p = makeProject({ clips, audioTracks: [voice, late, early, tie, sfx] });
  expect(beatTrack(p, null)).toBe(early);
  expect(beatTrack(p, "late")).toBe(late);
  expect(beatTrack(p, "tie")).toBe(tie);
  expect(beatTrack(p, "voice")).toBe(early);
  expect(beatTrack(p, "clipSound")).toBe(early);
  expect(beatTrack(p, "gone")).toBe(early);
});

test("without any music and without a selected bar there is still nothing", () => {
  const p = makeProject({ clips, audioTracks: [voice, sfx] });
  expect(beatTrack(p, null)).toBeNull();
  expect(beatTrack(p, "gone")).toBeNull();
  expect(beatTrack(p, "")).toBeNull();
  expect(beatTrack(makeProject({ clips }), null)).toBeNull();
  expect(beatTrack(makeProject({ clips }), "voice")).toBeNull();
});

test("without any music the SELECTED bar is listened to, whatever its kind", () => {
  const p = makeProject({ clips, audioTracks: [voice, sfx] });
  expect(beatTrack(p, "voice")).toBe(voice);
  expect(beatTrack(p, "clipSound")).toBe(sfx);
});
