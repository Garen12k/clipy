jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-track") }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => false), soundInfo: jest.fn(async () => ({ hasSound: true, seconds: 5 })) }));
import { act, renderHook } from "@testing-library/react-native";
import { isSoundAvailable, soundInfo } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { duplicateClip } from "@/src/editor/model/ops";
import { closeStrip, openStrip, useToolStrip } from "@/src/editor/toolStrip";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { EXTRACT_MESSAGES, useExtractAudio, type Extracted } from "../useExtractAudio";

const st = () => useEditorStore.getState();
const toast = () => useToast.getState().message;
const run = async (clipId: string) => {
  const hook = await renderHook(() => useExtractAudio());
  let out: Extracted | null = null;
  await act(async () => { out = await hook.result.current.extract(clipId); });
  return out as Extracted | null;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(newId).mockReset().mockImplementation(() => "new-track");
  closeStrip();
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  jest.mocked(soundInfo).mockResolvedValue({ hasSound: true, seconds: 5 });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 6 }), makeClip({ id: "fast", sourceDuration: 6, speed: 2 }), makePhotoClip({ id: "ph" })] }));
});

test("one tap: the bar is there, the clip is muted, and it is one undo step (works without the engine)", async () => {
  expect(await run("a")).toEqual({ trackId: "new-track", made: true });
  expect(st().project!.audioTracks.map((t) => [t.id, t.kind, t.sourceUri])).toEqual([["new-track", "sfx", "file:///media/a.mp4"]]);
  expect(st().project!.clips[0].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(soundInfo).not.toHaveBeenCalled();
  expect(toast()).toBeNull();
  expect(st().selectedAudioId).toBe("new-track");
  st().undo();
  expect(st().project!.audioTracks).toEqual([]);
  expect(st().project!.clips[0].muted).toBe(false);
});

test("a second time: the bar that is there is selected and returned, nothing is added, and the toast says it was already there", async () => {
  await run("a");
  st().select("a");
  expect(await run("a")).toEqual({ trackId: "new-track", made: false });
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().past).toHaveLength(1);
  expect(st().selectedAudioId).toBe("new-track");
  expect(toast()).toBe(EXTRACT_MESSAGES.already);
});

test("refusals say why and change nothing", async () => {
  expect(await run("fast")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.speed);
  expect(await run("ph")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.noSound);
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 6 })], audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) }));
  expect(await run("a")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.limit);
  expect(st().past).toHaveLength(0);
  expect(st().selectedAudioId).toBeNull();
});

test("with the engine the file is asked first: a video without sound is refused; a failed question does not stop the extract", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  jest.mocked(soundInfo).mockResolvedValueOnce({ hasSound: false, seconds: 6 });
  expect(await run("a")).toBeNull();
  expect(soundInfo).toHaveBeenCalledWith("file:///media/a.mp4");
  expect(toast()).toBe(EXTRACT_MESSAGES.silent);
  expect(st().project!.audioTracks).toEqual([]);
  jest.mocked(soundInfo).mockRejectedValueOnce(new Error("sound info: boom"));
  expect(await run("a")).toEqual({ trackId: "new-track", made: true });
});

test("the messages are plain sentences", () => {
  expect(EXTRACT_MESSAGES).toEqual({
    noSound: "This clip has no sound to extract.",
    speed: "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed.",
    limit: "You have reached the audio track limit.",
    silent: "This clip has no sound.",
    already: "The sound of this clip is already on the audio row.",
    moved: "The sound of this clip is now its own bar.",
  });
});

describe("the file question takes a moment", () => {
  /** Extract on the selected clip "a", with the file's answer held back until `answer` is called. */
  const ask = async () => {
    jest.mocked(isSoundAvailable).mockReturnValue(true);
    let answer: (v: { hasSound: boolean; seconds: number }) => void = () => {};
    jest.mocked(soundInfo).mockImplementationOnce((() => new Promise((r) => { answer = r; })) as unknown as typeof soundInfo);
    st().select("a");
    const hook = await renderHook(() => useExtractAudio());
    let out: Extracted | null | undefined;
    let done!: Promise<void>;
    await act(async () => { done = hook.result.current.extract("a").then((r) => { out = r; }); await Promise.resolve(); });
    const settle = async (v: { hasSound: boolean; seconds: number }) => { await act(async () => { answer(v); await done; }); return out; };
    return { settle };
  };

  test("the same clip is still selected and no tool was opened: the bar is made", async () => {
    const { settle } = await ask();
    expect(await settle({ hasSound: true, seconds: 6 })).toEqual({ trackId: "new-track", made: true });
    expect(st().selectedAudioId).toBe("new-track");
  });

  test("something else was selected meanwhile: nothing is made, nothing is selected, nothing is said", async () => {
    const { settle } = await ask();
    await act(async () => { st().select("fast"); });
    expect(await settle({ hasSound: true, seconds: 6 })).toBeNull();
    expect(st().project!.audioTracks).toEqual([]);
    expect(st().project!.clips[0].muted).toBe(false);
    expect(st().past).toHaveLength(0);
    expect(st().selectedClipId).toBe("fast");
    expect(st().selectedAudioId).toBeNull();
    expect(toast()).toBeNull();
  });

  test("the selection was cleared meanwhile: nothing either — not even the sentence for a file without sound", async () => {
    const { settle } = await ask();
    await act(async () => { st().select(null); });
    expect(await settle({ hasSound: false, seconds: 6 })).toBeNull();
    expect(st().project!.audioTracks).toEqual([]);
    expect(toast()).toBeNull();
  });

  test("another tool was opened meanwhile: nothing is made and the tool stays open on the clip", async () => {
    const { settle } = await ask();
    await act(async () => { openStrip("volume"); });
    expect(await settle({ hasSound: true, seconds: 6 })).toBeNull();
    expect(st().project!.audioTracks).toEqual([]);
    expect(st().past).toHaveLength(0);
    expect(st().selectedClipId).toBe("a");
    expect(useToolStrip.getState().open).toEqual({ id: "volume", key: "clip:a" });
    expect(toast()).toBeNull();
  });
});

test("a duplicate that still has its sound is extracted to a bar of its own: 'already' is said only when it is true", async () => {
  jest.mocked(newId).mockReturnValueOnce("copy");
  st().setProject(duplicateClip(st().project!, "a"));
  expect(st().project!.clips.map((c) => c.id)).toEqual(["a", "copy", "fast", "ph"]);
  jest.mocked(newId).mockReturnValueOnce("bar-1");
  expect(await run("a")).toEqual({ trackId: "bar-1", made: true });
  jest.mocked(newId).mockReturnValueOnce("bar-2");
  expect(await run("copy")).toEqual({ trackId: "bar-2", made: true });
  expect(toast()).toBeNull();
  expect(st().project!.audioTracks.map((t) => [t.id, t.start])).toEqual([["bar-1", 0], ["bar-2", 6]]);
  expect(st().project!.clips.slice(0, 2).map((c) => c.muted)).toEqual([true, true]);
  // Now it is true of both, and each is shown its own bar.
  expect(await run("copy")).toEqual({ trackId: "bar-2", made: false });
  expect(toast()).toBe(EXTRACT_MESSAGES.already);
  expect(await run("a")).toEqual({ trackId: "bar-1", made: false });
});
