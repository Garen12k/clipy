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
      // expo-audio on iOS (AudioPlayer.swift, replaceCurrentSource): a player that was PLAYING when its source was replaced is
      // started again by the native side once the new item is ready — `ready()` is that moment. Nothing calls it but a test.
      resumeWhenReady: false,
      replace: jest.fn((source: { uri: string }) => { p.resumeWhenReady = p.playing; p.uri = source.uri; p.calls.push(["replace", source.uri]); }),
      ready: () => { if (!p.resumeWhenReady) return; p.resumeWhenReady = false; p.playing = true; p.calls.push(["native play"]); },
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
import { deleteAudioTrack, setClipTransform, setDucking, setTrackSound, splitAudioTrackAt, updateAudioTrackById } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeProject, type AudioTrack, type Project } from "@/src/editor/model/types";
import { useSoundFiles } from "@/src/editor/soundFiles";
import { useEditorStore } from "@/src/editor/store";
import { AudioPreview } from "../components/AudioPreview";

type FakePlayer = { calls: unknown[][]; uri: string | null; options: unknown; playing: boolean; currentTime: number; volume: number; ready: () => void; play: jest.Mock; pause: jest.Mock; replace: jest.Mock; seekTo: jest.Mock };
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
    await setPlaying(true); // about to start: always seeked, then played
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
    expect(p.calls).toEqual([["volume", 0.5]]); // paused and already at 5: not seeked again

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

describe("starting, and re-starting, a track", () => {
  // start 2 and binary-exact playheads, so the source times are exact
  const blip = makeAudioTrack({ id: "s", sourceDuration: 0.125, start: 2, kind: "sfx" });

  test("a short sound that has played to its end is seeked back when the playhead re-enters it, before play()", async () => {
    load([blip]);
    await render(<AudioPreview />);
    const p = playerOf("s");
    await setPlaying(true);
    await seek(2.0625);
    expect(p.calls.slice(-2)).toEqual([["seekTo", 0.0625, 0, 0], ["play"]]);
    p.currentTime = 0.125; // it played to its end and stays there
    await seek(2.25);
    expect(p.playing).toBe(false);
    clear();
    await seek(1); // the user scrubs back while playing
    expect(p.calls).toEqual([]);
    await seek(2.03125); // 0.09 s from where the player sits: far inside the drift tolerance, and still it must seek
    expect(p.calls).toEqual([["seekTo", 0.03125, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("resuming inside a track seeks before play() even when the player already sits there", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await seek(3);
    p.currentTime = 3;
    clear();
    await setPlaying(true);
    expect(p.calls).toEqual([["seekTo", 3, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("play() is called once per entry, not on every tick the player reports it is not playing", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 4, start: 2 })]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(2.5);
    expect(p.play).toHaveBeenCalledTimes(1);
    p.playing = false; // buffering, or the file ended early
    for (const t of [2.6, 2.7, 2.8]) { p.currentTime = t - 2; await seek(t); }
    expect(p.play).toHaveBeenCalledTimes(1);
    await seek(7); // leaves…
    expect(p.pause).toHaveBeenCalledTimes(1);
    await seek(3); // …and enters again: one more
    expect(p.play).toHaveBeenCalledTimes(2);
    await setPlaying(false);
    await setPlaying(true); // pausing ends the entry too
    expect(p.play).toHaveBeenCalledTimes(3);
    await setPlaying(false);
  });

  test("the player's own playing flag is not read on playhead ticks", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10, fadeIn: 2 })]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    let reads = 0;
    let playing = false;
    Object.defineProperty(p, "playing", { configurable: true, get: () => { reads++; return playing; }, set: (v: boolean) => { playing = v; } });
    await setPlaying(true);
    for (const t of [0.5, 1, 1.5, 3, 4]) { p.currentTime = t; await seek(t); }
    await setPlaying(false);
    await seek(12);
    expect(reads).toBe(0);
  });

  test("paused: edits to the track (volume, fades) and unrelated edits do not seek again; a new target does", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await seek(1);
    clear();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { volume: 0.5 })); });
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { fadeIn: 2 })); });
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { fadeOut: 1 })); });
    await act(() => { st().apply((x) => setClipTransform(x, "a", { x: 0.2 })); });
    expect(p.seekTo).toHaveBeenCalledTimes(2); // the mount and the scrub to 1, nothing since
    expect(volumeWrites(p)).toEqual([0.5, 0.25]);
    clear();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { trimStart: 2 })); }); // same playhead, another place in the file
    expect(p.calls.filter((c) => c[0] === "seekTo")).toEqual([["seekTo", 3, 0, 0]]);
    clear();
    await seek(1.5);
    expect(p.calls.filter((c) => c[0] === "seekTo")).toEqual([["seekTo", 3.5, 0, 0]]);
  });

  test("a file that is swapped is seeked again even at the same target", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })]);
    await render(<AudioPreview />);
    const p = players[0];
    await seek(1);
    clear();
    await act(() => { st().apply((x) => ({ ...x, audioTracks: [{ ...x.audioTracks[0], sourceUri: "file:///media/other.m4a" }] })); });
    expect(p.calls).toEqual([["replace", "file:///media/other.m4a"], ["volume", 1], ["seekTo", 1, 0, 0]]);
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

  test("a voice track whose file is missing is not heard, so it does not duck the music", async () => {
    load([music, voice], { ducking: true }, [uriOf("v")]);
    await render(<AudioPreview />);
    await seek(5);
    expect(playerOf("m").volume).toBe(1);
    await seek(3.85);
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

describe("a sound that begins during playback is started early, silent, so it is already moving at its start", () => {
  // plays 2 → 6 from 3 s into its file; binary-exact playheads
  const later = makeAudioTrack({ id: "m", sourceDuration: 10, start: 2, trimStart: 3, trimEnd: 7, volume: 0.8 });

  test("one silent start inside the lead, not before it; audible exactly at the start, with no seek and no second play()", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    clear();
    await seek(1.5);
    await seek(1.75); // 0.25 before: not yet
    expect(p.calls).toEqual([]);
    await seek(1.8125); // inside the lead: silenced first, then seeked to the track's first sample and started
    expect(p.calls).toEqual([["volume", 0], ["seekTo", 3, 0, 0], ["play"]]);
    clear();
    for (const at of [1.875, 1.9375, 1.984375]) await seek(at);
    expect(p.calls).toEqual([]); // rolling, silent: nothing more
    expect(p.volume).toBe(0);
    p.currentTime = 3.05; // it got going a little before the start
    await seek(2);
    expect(p.calls).toEqual([["volume", 0.8]]);
    clear();
    p.currentTime = 3.2;
    await seek(2.125);
    expect(p.calls).toEqual([]);
    expect(p.play).toHaveBeenCalledTimes(1);
    expect(p.pause).not.toHaveBeenCalled();
    await seek(6.5); // past its end: paused, as ever
    expect(p.calls).toEqual([["pause"]]);
    await setPlaying(false);
  });

  test("a fade-in starts from the start: the early start is silent, then the volume follows the fade", async () => {
    load([{ ...later, volume: 1, fadeIn: 2 }]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    clear();
    p.currentTime = 3;
    await seek(2);
    expect(p.calls).toEqual([]); // the fade's first value is 0 as well
    p.currentTime = 3.5;
    await seek(2.5);
    expect(p.calls).toEqual([["volume", 0.25]]);
    await setPlaying(false);
  });

  test("a pause before the start is reached: the player is paused still silent, and the next Play starts it over with a seek", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    clear();
    await setPlaying(false);
    expect(p.calls).toEqual([["pause"]]); // not un-silenced while it is still moving
    expect(p.playing).toBe(false);
    clear();
    await setPlaying(true);
    expect(p.calls).toEqual([["seekTo", 3, 0, 0], ["play"]]); // already at volume 0: not written again
    await setPlaying(false);
    clear();
    await seek(1); // paused, outside: it rests at the track's own volume again
    expect(p.calls).toEqual([["volume", 0.8]]);
  });

  test("a seek away while playing, before the start: paused; its volume comes back only once it stands still", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    clear();
    await seek(0.5);
    expect(p.calls).toEqual([["pause"]]);
    clear();
    await seek(0.5625);
    expect(p.calls).toEqual([["volume", 0.8]]);
    clear();
    await seek(1.875); // and towards the start again: a fresh seek, one play
    expect(p.calls).toEqual([["volume", 0], ["seekTo", 3, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("a seek from the lead into the middle of the track: stopped, seeked there and started — never left where it had rolled to", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    clear();
    await seek(4);
    expect(p.calls).toEqual([["pause"], ["seekTo", 5, 0, 0], ["play"]]);
    expect(p.volume).toBe(0); // still silent while it is stopped and moved…
    clear();
    p.currentTime = 5.0625;
    await seek(4.0625);
    expect(p.calls).toEqual([["volume", 0.8]]); // … audible on the next tick
    await setPlaying(false);
  });

  test("the track changes while its player rolls: moved away → paused; another place in the file → started over from there", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    clear();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { trimStart: 4 })); });
    expect(p.calls).toEqual([["pause"], ["seekTo", 4, 0, 0], ["play"]]);
    clear();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { volume: 0.5 })); }); // nothing to do with where it starts
    expect(p.calls).toEqual([]);
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { start: 5 })); });
    expect(p.calls).toEqual([["pause"]]);
    expect(p.playing).toBe(false);
    await setPlaying(false);
  });

  test("the track is deleted, or the preview unmounts, while its player rolls: one guarded pause on the released player", async () => {
    load([later, makeAudioTrack({ id: "n", sourceDuration: 10 })]);
    const view = await render(<AudioPreview />);
    const p = playerOf("m");
    await setPlaying(true);
    await seek(1.875);
    expect(p.playing).toBe(true);
    p.pause.mockImplementation(() => { throw new Error("Cannot use shared object that was already released"); });
    clear();
    await act(() => { st().apply((x) => deleteAudioTrack(x, "m")); });
    expect(p.pause).toHaveBeenCalledTimes(1);
    await seek(1.9375);
    await seek(2);
    expect(p.calls).toEqual([]); // nothing reaches the released player afterwards
    await setPlaying(false);
    await view.unmount();
  });

  test("its file is missing: never started early", async () => {
    load([later], {}, [uriOf("m")]);
    await render(<AudioPreview />);
    await setPlaying(true);
    await seek(1.875);
    await seek(2);
    expect(players[0].play).not.toHaveBeenCalled();
    expect(players[0].seekTo).not.toHaveBeenCalled();
    await setPlaying(false);
  });

  test("while a voice-over is recorded the early start happens all the same, and stays silent past the start", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await act(() => { st().setRecording(true); });
    await setPlaying(true);
    clear();
    await seek(1.875);
    expect(p.calls).toEqual([["seekTo", 3, 0, 0], ["play"]]);
    p.currentTime = 3;
    await seek(2);
    expect(p.volume).toBe(0);
    await setPlaying(false);
  });

  test("a track at the project's start has no lead: seeked and played at Play, exactly as before", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    clear();
    await setPlaying(true);
    expect(p.calls).toEqual([["seekTo", 0, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("Play pressed inside the lead of a track: started early at once (the playhead is not moving yet)", async () => {
    load([later]);
    await render(<AudioPreview />);
    const p = playerOf("m");
    await seek(1.875);
    clear();
    await setPlaying(true);
    expect(p.calls).toEqual([["volume", 0], ["seekTo", 3, 0, 0], ["play"]]);
    await setPlaying(false);
  });

  test("the two pieces of a split: the first plays to the cut untouched, the second is rolling before it and takes over without a start", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 })]);
    st().apply((x) => splitAudioTrackAt(x, "m", 5, "m2"));
    expect(st().project?.audioTracks.map((t) => [t.id, t.start, t.trimStart, t.trimEnd])).toEqual([["m", 0, 0, 5], ["m2", 5, 5, 10]]);
    await render(<AudioPreview />);
    expect(players).toHaveLength(2); // one player per piece, both on the same file
    const [a, b] = players;
    await setPlaying(true);
    expect(a.calls.slice(-2)).toEqual([["seekTo", 0, 0, 0], ["play"]]);
    clear();
    a.currentTime = 4.5;
    await seek(4.5);
    expect(b.calls).toEqual([]);
    a.currentTime = 4.8125;
    await seek(4.8125); // 0.1875 before the cut
    expect(b.calls).toEqual([["volume", 0], ["seekTo", 5, 0, 0], ["play"]]);
    a.currentTime = 4.9375;
    await seek(4.9375);
    expect(a.calls).toEqual([]); // the first piece: not paused, not seeked, not turned down
    expect(a.playing).toBe(true);
    expect(a.volume).toBe(1);
    expect(b.playing).toBe(true);
    expect(b.volume).toBe(0);
    clear();
    b.currentTime = 5;
    await seek(5); // the cut
    expect(a.calls).toEqual([["pause"]]);
    expect(b.calls).toEqual([["volume", 1]]);
    expect(b.play).toHaveBeenCalledTimes(1);
    expect(b.seekTo).toHaveBeenCalledTimes(1);
    await setPlaying(false);
  });
});

describe("a track with a sound setting", () => {
  const COPY = "file:///doc/projects/p1/sound/v-v1-deep-s50-p0-flat-l0.m4a";
  afterEach(async () => { await act(async () => { useSoundFiles.setState({ files: {}, hold: false }); }); });

  test("plays its original until the copy is ready, then the copy; back to the original when the setting goes", async () => {
    load([makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" })]);
    await render(<AudioPreview />);
    const p = playerOf("v");
    await act(async () => { st().apply((x) => setTrackSound(x, "v", { voice: "deep" })); });
    expect(p.uri).toBe(uriOf("v"));                                            // not ready: still the original
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([["replace", COPY]]);
    clear();
    await act(async () => { st().apply((x) => setTrackSound(x, "v", { voice: null })); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([["replace", uriOf("v")]]);
  });

  test("a track without a setting never loads anything but its own file, whatever copies exist", async () => {
    load([makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" })]);
    await render(<AudioPreview />);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    expect(playerOf("v").calls.filter((c) => c[0] === "replace")).toEqual([]);
  });

  test("PROOF: a track without a setting makes exactly the calls it always made, with copies around and a slider held", async () => {
    const NAME = "m-v1-deep-s50-p0-flat-l0.m4a";
    const noise = async () => {
      await act(async () => { useSoundFiles.setState({ files: { [NAME]: { status: "busy" } }, hold: true }); });
      await act(async () => { useSoundFiles.setState({ files: { [NAME]: { status: "ready", uri: COPY } }, hold: false }); });
      await act(async () => { useSoundFiles.setState({ files: { [NAME]: { status: "failed", message: "x" } } }); });
    };
    await act(async () => { useSoundFiles.setState({ files: { [NAME]: { status: "ready", uri: COPY } }, hold: false }); });
    load([makeAudioTrack({ id: "m", sourceDuration: 10, volume: 0.8 })]);
    await render(<AudioPreview />);
    const p = players[0];
    expect(p.calls).toEqual([["replace", uriOf("m")], ["volume", 0.8], ["seekTo", 0, 0, 0]]);
    clear(); await noise();
    expect(p.calls).toEqual([]);
    await seek(1);
    expect(p.calls).toEqual([["seekTo", 1, 0, 0]]);
    clear(); await noise();
    await setPlaying(true);
    expect(p.calls).toEqual([["seekTo", 1, 0, 0], ["play"]]);
    clear(); await noise();
    p.currentTime = 1.1;
    await seek(1.2);
    expect(p.calls).toEqual([]);
    await seek(5);
    expect(p.calls).toEqual([["seekTo", 5, 0, 0]]);
    clear(); await noise();
    await setPlaying(false);
    expect(p.calls).toEqual([["pause"], ["seekTo", 5, 0, 0]]);
    clear(); await noise();
    await act(() => { st().apply((x) => updateAudioTrackById(x, "m", { volume: 0.5 })); });
    expect(p.calls).toEqual([["volume", 0.5]]);
    expect(p.uri).toBe(uriOf("m"));
  });

  test("the copy becomes ready while playing: loaded, then seeked to the playhead's place in the file and played, in the same pass", async () => {
    load([{ ...makeAudioTrack({ id: "v", sourceDuration: 10, start: 2, trimStart: 1, kind: "voice" }), sound: { voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false } }]);
    await render(<AudioPreview />);
    const p = playerOf("v");
    await setPlaying(true);
    p.currentTime = 3;
    await seek(4);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    // Paused first: a playing player whose source is replaced is started again by the native side, whatever happens meanwhile.
    expect(p.calls).toEqual([["pause"], ["replace", COPY], ["volume", 1], ["seekTo", 3, 0, 0], ["play"]]);   // 1 + (4 - 2): never from 0
    clear();
    p.currentTime = 3.1;
    await seek(4.1);
    expect(p.calls).toEqual([]);                                                               // one swap, then the ordinary drift check
    await setPlaying(false);
  });

  test("the copy becomes ready while paused: loaded and parked at the playhead, not played", async () => {
    load([{ ...makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" }), sound: { voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false } }]);
    await render(<AudioPreview />);
    const p = playerOf("v");
    await seek(3);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    expect(p.calls).toEqual([["replace", COPY], ["volume", 1], ["seekTo", 3, 0, 0]]);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });   // the same answer again
    expect(p.calls).toEqual([]);
  });

  test("while a slider is held the original plays, so a drag across a setting that has a copy does not swap files back and forth", async () => {
    load([{ ...makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" }), sound: { ...{ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false }, strength: 0.4 } }]);
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } }, hold: true, holdTrack: "v" }); });
    await render(<AudioPreview />);
    const p = playerOf("v");
    clear();
    await act(async () => { st().beginTransaction(); });
    for (const strength of [0.45, 0.5, 0.55, 0.5]) await act(async () => { st().applyTransient((x) => setTrackSound(x, "v", { strength })); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([]);
    await act(async () => { useSoundFiles.setState({ hold: false, holdTrack: null }); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([["replace", COPY]]);
  });

  test("the file is swapped while playing and the editor is paused before the new file is ready: the player is not left playing", async () => {
    load([{ ...makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" }), sound: { voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false } }]);
    await render(<AudioPreview />);
    const p = playerOf("v");
    await setPlaying(true);
    p.currentTime = 2;
    await seek(2);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    const names = p.calls.map((c) => c[0]);
    expect(names.indexOf("pause")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("pause")).toBeLessThan(names.indexOf("replace"));   // paused BEFORE the replace: the native side will not resume it
    await setPlaying(false);
    p.ready();                                                               // the new item is ready only now
    expect(p.playing).toBe(false);
    expect(p.calls.filter((c) => c[0] === "native play")).toEqual([]);
    expect(p.calls[p.calls.length - 2]).toEqual(["pause"]);                  // the editor's pause, then the park
    expect(p.calls[p.calls.length - 1]).toEqual(["seekTo", 2, 0, 0]);
  });

  test("the first load of a file is not preceded by a pause, with or without a setting", async () => {
    load([makeAudioTrack({ id: "m", sourceDuration: 10 }), { ...makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" }), sound: { voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false } }]);
    await render(<AudioPreview />);
    for (const id of ["m", "v"]) expect(playerOf(id).calls[0]).toEqual(["replace", uriOf(id)]);
  });

  test("a slider held on ONE track: only that track plays its original; every other track keeps its copy", async () => {
    const OTHER = "file:///doc/projects/p1/sound/w-v1-high-s50-p0-flat-l0.m4a";
    const ready = { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready" as const, uri: COPY }, "w-v1-high-s50-p0-flat-l0.m4a": { status: "ready" as const, uri: OTHER } };
    load([
      { ...makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" }), sound: { voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false } },
      { ...makeAudioTrack({ id: "w", sourceDuration: 10, kind: "voice" }), sound: { voice: "high", strength: 0.5, pitch: 0, eq: null, level: false } },
    ]);
    await act(async () => { useSoundFiles.setState({ files: ready }); });
    await render(<AudioPreview />);
    const [v, w] = players;
    expect([v.uri, w.uri]).toEqual([COPY, OTHER]);
    clear();
    await act(async () => { useSoundFiles.setState({ hold: true, holdTrack: "v" }); });
    expect(v.calls.filter((c) => c[0] === "replace")).toEqual([["replace", uriOf("v")]]);
    expect(w.calls).toEqual([]);                                             // not swapped, not paused, not seeked
    clear();
    await act(async () => { useSoundFiles.setState({ hold: false, holdTrack: null }); });
    expect(v.calls.filter((c) => c[0] === "replace")).toEqual([["replace", COPY]]);
    expect(w.calls).toEqual([]);
  });
});
