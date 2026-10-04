import { act, render } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// One fake expo-audio player per component that calls useAudioPlayer (kept in a ref, as the real hook keeps one per
// mount). Every native call lands, in order, in the player's `calls`; the file it loaded is `uri`.
jest.mock("expo-audio", () => {
  const React = require("react");
  const players: unknown[] = [];
  const make = () => {
    let volume = 1;
    const p = {
      calls: [] as unknown[][],
      uri: null as string | null,
      options: undefined as unknown,
      playing: false,
      currentTime: 0,
      get volume() { return volume; },
      set volume(v: number) { volume = v; p.calls.push(["volume", v]); },
      play: jest.fn(() => { p.playing = true; p.calls.push(["play"]); }),
      pause: jest.fn(() => { p.playing = false; p.calls.push(["pause"]); }),
      replace: jest.fn((source: { uri: string }) => { p.uri = source.uri; p.calls.push(["replace", source.uri]); }),
      seekTo: jest.fn(async (t: number, before?: number, after?: number) => { p.calls.push(["seekTo", t, before, after]); }),
    };
    return p;
  };
  return {
    __players: players,
    useAudioPlayer: (_source: unknown, options: unknown) => {
      const ref = React.useRef(null);
      if (!ref.current) { ref.current = make(); ref.current.options = options; players.push(ref.current); }
      return ref.current;
    },
    setAudioModeAsync: jest.fn(async () => {}),
  };
});
import { setAudioModeAsync } from "expo-audio";
import { deleteAudioTrack, setClipTransform, setDucking, updateAudioTrackById } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeProject, type AudioTrack, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AudioPreview } from "../components/AudioPreview";

type FakePlayer = { calls: unknown[][]; uri: string | null; options: unknown; playing: boolean; currentTime: number; volume: number; play: jest.Mock; pause: jest.Mock; replace: jest.Mock; seekTo: jest.Mock };
const players = (jest.requireMock("expo-audio") as { __players: FakePlayer[] }).__players;
const st = () => useEditorStore.getState();
const uriOf = (id: string) => `file:///media/${id}.m4a`;
/** The player that loaded track `id`'s file. */
const playerOf = (id: string): FakePlayer => {
  const p = players.find((x) => x.uri === uriOf(id));
  if (!p) throw new Error(`no player loaded ${id}`);
  return p;
};
const volumeWrites = (p: FakePlayer) => p.calls.filter((c) => c[0] === "volume").map((c) => c[1]);
const clear = () => players.forEach((p) => { p.calls.length = 0; });
/** A 20 s project (one clip) carrying `tracks`. */
const load = (tracks: AudioTrack[], over: Partial<Project> = {}, missing: string[] = []) =>
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], audioTracks: tracks, ...over }), missing);
const seek = (t: number) => act(() => { st().seek(t); });
const setPlaying = (b: boolean) => act(() => { st().setPlaying(b); });

beforeEach(() => {
  jest.clearAllMocks();
  players.length = 0;
  st().reset();
});

describe("one un-faded music track, no ducking: exactly the calls the single-player preview made", () => {
  test("mount, paused scrub, play, drift, pause, volume change, unrelated edit, unmount", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10, volume: 0.8 })]);
    const view = await render(<AudioPreview />);
    expect(players).toHaveLength(1);
    const p = players[0];
    expect(p.options).toEqual({ keepAudioSessionActive: true });
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith({ interruptionMode: "mixWithOthers", playsInSilentMode: true });
    expect(p.calls).toEqual([["replace", uriOf("m")], ["volume", 0.8], ["seekTo", 0, 0, 0]]);

    clear();
    await seek(1); // paused scrub: one seek, nothing else
    expect(p.calls).toEqual([["seekTo", 1, 0, 0]]);

    clear();
    await setPlaying(true); // the player sits at 0: beyond the tolerance, so it is seeked, then played
    expect(p.calls).toEqual([["seekTo", 1, 0, 0], ["play"]]);

    clear();
    p.currentTime = 1.1;
    await seek(1.2); // within the tolerance, already playing: nothing
    expect(p.calls).toEqual([]);
    await seek(5); // drifted
    expect(p.calls).toEqual([["seekTo", 5, 0, 0]]);

    clear();
    await setPlaying(false);
    expect(p.calls).toEqual([["pause"], ["seekTo", 5, 0, 0]]);

    clear();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { volume: 0.5 })); });
    expect(p.calls).toEqual([["volume", 0.5], ["seekTo", 5, 0, 0]]);

    clear();
    await act(() => { st().apply((x) => setClipTransform(x, "a", { x: 0.2 })); }); // nothing to do with audio
    expect(p.calls).toEqual([]);

    await view.unmount();
    expect(p.calls).toEqual([["pause"]]);
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  test("a track that starts later: loaded at its own volume, paused outside, played once the playhead is inside", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 4, start: 2, volume: 2 })]); // above 1: capped in the preview
    await render(<AudioPreview />);
    const p = players[0];
    expect(p.calls).toEqual([["replace", uriOf("m")], ["volume", 1]]);
    clear();
    await setPlaying(true);
    await seek(1);
    expect(p.calls).toEqual([]); // outside, not playing: nothing to pause
    await seek(3);
    expect(p.calls).toEqual([["seekTo", 1, 0, 0], ["play"]]);
    clear();
    await seek(7); // past its end
    expect(p.calls).toEqual([["pause"]]);
    expect(p.playing).toBe(false);
    await setPlaying(false);
  });

  test("a missing file is never loaded, seeked or played", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })], {}, [uriOf("m")]);
    await render(<AudioPreview />);
    await seek(1);
    await setPlaying(true);
    await seek(2);
    await setPlaying(false);
    expect(players).toHaveLength(1);
    expect(players[0].replace).not.toHaveBeenCalled();
    expect(players[0].seekTo).not.toHaveBeenCalled();
    expect(players[0].play).not.toHaveBeenCalled();
    expect(volumeWrites(players[0])).toEqual([]);
  });

  test("no tracks: no players, and the audio mode is still set once", async () => {
    load([]);
    await render(<AudioPreview />);
    expect(players).toHaveLength(0);
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  });
});

describe("several tracks", () => {
  const music = makeAudioTrack({ id: "m", sourceDuration: 10 });
  const voice = makeAudioTrack({ id: "v", sourceDuration: 2, start: 4, kind: "voice" });

  test("two tracks → two players, each with its own file and its own source time", async () => {
    load([music, makeAudioTrack({ id: "s", sourceDuration: 3, start: 2, trimStart: 1, kind: "sfx" })]);
    st().seek(2.5);
    await render(<AudioPreview />);
    expect(players).toHaveLength(2);
    expect(playerOf("m")).not.toBe(playerOf("s"));
    expect(playerOf("m").calls).toEqual([["replace", uriOf("m")], ["volume", 1], ["seekTo", 2.5, 0, 0]]);
    expect(playerOf("s").calls).toEqual([["replace", uriOf("s")], ["volume", 1], ["seekTo", 1.5, 0, 0]]);
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  test("playing: a track the playhead is outside stays paused while the other plays; it starts on entering and pauses on leaving", async () => {
    load([music, voice]);
    await render(<AudioPreview />);
    await setPlaying(true);
    expect(playerOf("m").playing).toBe(true);
    expect(playerOf("v").playing).toBe(false);
    expect(playerOf("v").play).not.toHaveBeenCalled();
    await seek(4.5);
    expect(playerOf("v").playing).toBe(true);
    expect(playerOf("v").seekTo).toHaveBeenLastCalledWith(0.5, 0, 0);
    await seek(6.5);
    expect(playerOf("v").playing).toBe(false);
    expect(playerOf("m").playing).toBe(true);
    await setPlaying(false);
  });

  test("ducking: music drops to DUCKING.level under a voice track and ramps around it; the voice is not ducked", async () => {
    load([music, voice], { ducking: true });
    await render(<AudioPreview />);
    expect(playerOf("m").volume).toBe(1);
    await seek(5);
    expect(playerOf("m").volume).toBeCloseTo(0.3, 10);
    expect(playerOf("v").volume).toBe(1);
    await seek(3.85); // half-way down the 0.3 s ramp before the voice
    expect(playerOf("m").volume).toBeCloseTo(0.65, 10);
    await seek(8);
    expect(playerOf("m").volume).toBe(1);
    await seek(5);
    await act(() => { st().apply((x) => setDucking(x, false)); });
    expect(playerOf("m").volume).toBe(1);
  });

  test("removing a track unmounts its player without throwing, even though that player is already released", async () => {
    load([music, voice]);
    await render(<AudioPreview />);
    const v = playerOf("v");
    const m = playerOf("m");
    v.pause.mockImplementation(() => { throw new Error("Cannot use shared object that was already released"); });
    clear();
    await act(() => { st().apply((x) => deleteAudioTrack(x, "v")); });
    expect(v.pause).toHaveBeenCalledTimes(1);
    expect(m.calls).toEqual([]); // the surviving track's player is left alone
    await seek(1);
    expect(v.calls).toEqual([]);
    expect(m.calls).toEqual([["seekTo", 1, 0, 0]]);
    expect(st().project?.audioTracks.map((t) => t.id)).toEqual(["m"]);
  });

  test("unmounting the whole preview with released players does not throw", async () => {
    load([music, voice]);
    const view = await render(<AudioPreview />);
    players.forEach((p) => p.pause.mockImplementation(() => { throw new Error("released"); }));
    await view.unmount();
    players.forEach((p) => expect(p.pause).toHaveBeenCalledTimes(1));
  });
});

describe("fades", () => {
  const faded = makeAudioTrack({ id: "f", sourceDuration: 10, fadeIn: 2, fadeOut: 2 });

  test("volume follows the fade envelope × the track volume", async () => {
    load([{ ...faded, volume: 0.8 }]);
    await render(<AudioPreview />);
    const p = playerOf("f");
    expect(p.volume).toBe(0); // the very start of the fade-in
    await seek(1);
    expect(p.volume).toBeCloseTo(0.4, 10); // fade-in midpoint
    await seek(5);
    expect(p.volume).toBeCloseTo(0.8, 10);
    await seek(9);
    expect(p.volume).toBeCloseTo(0.4, 10); // fade-out midpoint
  });

  test("the fade volume is written before play() when playback enters the track", async () => {
    load([makeAudioTrack({ id: "f", sourceDuration: 4, start: 2, fadeIn: 2 })]);
    await render(<AudioPreview />);
    const p = playerOf("f");
    await setPlaying(true);
    clear();
    await seek(2.5);
    expect(p.calls).toEqual([["volume", 0.25], ["seekTo", 0.5, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("playing out of a fade-out: the player is paused before its volume goes back up", async () => {
    load([makeAudioTrack({ id: "f", sourceDuration: 4, fadeOut: 2 })]);
    await render(<AudioPreview />);
    const p = playerOf("f");
    await setPlaying(true);
    p.currentTime = 3.9;
    await seek(3.9);
    expect(p.volume).toBeCloseTo(0.05, 10);
    clear();
    await seek(4.05); // past the track's end
    expect(p.calls).toEqual([["pause"]]);
    clear();
    await seek(4.1); // paused now: back to the track's own volume, ready for the next entry
    expect(p.calls).toEqual([["volume", 1]]);
    await setPlaying(false);
  });

  test("volume writes are throttled: only a change above 0.01, or arriving at exactly 0 or 1, is written", async () => {
    load([faded]);
    st().seek(1);
    await render(<AudioPreview />);
    const p = playerOf("f");
    expect(volumeWrites(p)).toEqual([0.5]);
    clear();
    await seek(1.01); // 0.505
    await seek(1.016); // 0.508
    await seek(0.99); // 0.495
    expect(volumeWrites(p)).toEqual([]);
    await seek(1.03); // 0.515
    expect(volumeWrites(p)).toEqual([0.515]);
    clear();
    await seek(1.99); // 0.995
    await seek(1.996); // 0.998: within 0.01 of the last write
    expect(volumeWrites(p)).toEqual([0.995]);
    await seek(2); // exactly the cap: written although it is within 0.01
    await seek(3); // still 1: not written again
    expect(volumeWrites(p)).toEqual([0.995, 1]);
    clear();
    await seek(0.01); // 0.005
    await seek(0); // exactly 0: written although it is within 0.01
    await seek(0);
    expect(volumeWrites(p)).toEqual([0.005, 0]);
  });

  test("a fade never causes a seek while playing inside the tolerance, nor pause / play churn", async () => {
    load([faded]);
    await render(<AudioPreview />);
    const p = playerOf("f");
    await setPlaying(true);
    clear();
    for (const t of [0.1, 0.2, 0.3, 0.4]) { p.currentTime = t; await seek(t); }
    expect(p.calls).toEqual([["volume", 0.05], ["volume", 0.1], ["volume", 0.15], ["volume", 0.2]]);
    await setPlaying(false);
  });
});

describe("recording", () => {
  test("the store flag is transient: off by default, cleared by loading a project and by reset", () => {
    expect(st().recording).toBe(false);
    st().setRecording(true);
    expect(st().recording).toBe(true);
    load([]);
    expect(st().recording).toBe(false);
    st().setRecording(true);
    st().reset();
    expect(st().recording).toBe(false);
  });

  test("the flag is not an edit: no undo step, the project is not dirtied", () => {
    load([]);
    st().setRecording(true);
    expect(st().canUndo()).toBe(false);
    expect(st().dirty).toBe(false);
  });

  test("while recording every track's volume is 0 (they keep following the playhead); it comes back afterwards", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10, volume: 0.8 }), makeAudioTrack({ id: "s", sourceDuration: 10, kind: "sfx", fadeIn: 2 })]);
    st().seek(1);
    await render(<AudioPreview />);
    expect(playerOf("m").volume).toBe(0.8);
    expect(playerOf("s").volume).toBe(0.5);
    clear();
    await act(() => { st().setRecording(true); });
    expect(playerOf("m").calls).toEqual([["volume", 0]]); // only the volume: no seek, no pause
    expect(playerOf("s").calls).toEqual([["volume", 0]]);
    clear();
    await setPlaying(true);
    for (const t of [1.5, 2, 2.5]) { players.forEach((x) => { x.currentTime = t; }); await seek(t); }
    expect(volumeWrites(playerOf("m"))).toEqual([]);
    expect(volumeWrites(playerOf("s"))).toEqual([]);
    expect(playerOf("m").playing).toBe(true);
    await act(() => { st().setRecording(false); });
    expect(playerOf("m").volume).toBe(0.8);
    expect(playerOf("s").volume).toBe(1);
    await setPlaying(false);
  });
});
