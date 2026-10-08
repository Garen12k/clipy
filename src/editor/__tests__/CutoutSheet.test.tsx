import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isCutoutAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/cutoutRenders", () => ({ retryCutout: jest.fn(), isNoPerson: (m: string) => m.includes("cutout person:") }));
import { isCutoutAvailable } from "@/modules/clipy-video";
import { retryCutout } from "@/src/editor/cutoutRenders";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { CUTOUT_TOO_LONG, CutoutSheet, cutoutStatus } from "../components/CutoutSheet";

const st = () => useEditorStore.getState();
const sw = () => screen.getByLabelText("Remove background");
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const NAME = "a-c1-0-8000.mov";
const open = async (id = "a") => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "long", sourceDuration: 200 })],
    layers: [makeLayer({ id: "L", sourceDuration: 6 })],
  }));
  await act(() => { st().select(id); });
  await render(<CutoutSheet clipId={id} visible onClose={() => {}} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  useCutoutFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("cutoutStatus: what the strip's status row says", () => {
  expect(cutoutStatus(false, null, undefined, 9491200)).toBe("People only. The copy takes about 9 MB.");
  expect(cutoutStatus(false, null, undefined, 1000)).toBe("People only. The copy takes about 1 MB.");
  expect(cutoutStatus(false, "tooLong", undefined, 0)).toBe(CUTOUT_TOO_LONG);
  expect(cutoutStatus(true, "tooLong", undefined, 0)).toBe(CUTOUT_TOO_LONG);
  expect(cutoutStatus(true, null, undefined, 0)).toBe("Waiting to start.");
  expect(cutoutStatus(true, null, { status: "busy", progress: 0.417 }, 0)).toBe("Preparing the cut-out: 42 %");
  expect(cutoutStatus(true, null, { status: "ready", uri: "u" }, 0)).toBe("Ready.");
  expect(cutoutStatus(true, null, { status: "failed", message: "cutout person: no person found" }, 0)).toBe("No person was found in this clip.");
  expect(cutoutStatus(true, null, { status: "failed", message: "cutout writer: boom" }, 0)).toBe("Could not remove the background. Switch it off and on to try again.");
  expect(CUTOUT_TOO_LONG).toBe("Remove background works on clips up to 60 seconds. Trim or split this clip first.");
});

test("cutoutStatus never says a broken number", () => {
  expect(cutoutStatus(false, null, undefined, NaN)).toBe("People only. The copy takes about 1 MB.");
  expect(cutoutStatus(true, null, { status: "busy", progress: NaN }, 0)).toBe("Preparing the cut-out: 0 %");
  expect(cutoutStatus(true, null, { status: "busy", progress: 7 }, 0)).toBe("Preparing the cut-out: 100 %");
});

test("the strip: a title, the switch off, and what it will take", async () => {
  await open();
  expect(screen.getByRole("header", { name: "Remove background" })).toBeTruthy();
  expect(sw().props.value).toBe(false);
  expect(screen.getByText("People only. The copy takes about 8 MB.")).toBeTruthy();
  expect(screen.getByText("The phone finds the person and hides everything else.")).toBeTruthy();
  expect(screen.getByText("Edges are not perfect")).toBeTruthy();
});

test("switching it on writes the switch in one undo step and asks for the copy again; off removes the key in one more", async () => {
  await open();
  await fireEvent(sw(), "valueChange", true);
  expect(item("a").cutout).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(retryCutout).toHaveBeenCalledWith(NAME);
  expect(sw().props.value).toBe(true);
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Preparing the cut-out: 50 %")).toBeTruthy();
  expect(screen.getByLabelText("Preparing the cut-out")).toBeTruthy();       // the spinner
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "ready", uri: "u" } } }); });
  expect(screen.getByText("Ready.")).toBeTruthy();
  expect(screen.queryByLabelText("Preparing the cut-out")).toBeNull();
  await fireEvent(sw(), "valueChange", false);
  expect("cutout" in item("a")).toBe(false);
  expect(st().past).toHaveLength(2);
});

test("a layer takes it too", async () => {
  await open("L");
  await fireEvent(sw(), "valueChange", true);
  expect(item("L").cutout).toBe(true);
});

test("on a build without it the switch says the sentence and nothing changes", async () => {
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  await open();
  const before = st().project;
  await fireEvent(sw(), "valueChange", true);
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect("cutout" in item("a")).toBe(false);
  expect(st().project).toBe(before);
  expect(st().past).toHaveLength(0);
  expect(retryCutout).not.toHaveBeenCalled();
});

test("a clip over 60 seconds is refused with its sentence", async () => {
  await open("long");
  expect(screen.getByText(CUTOUT_TOO_LONG)).toBeTruthy();
  const before = st().project;
  await fireEvent(sw(), "valueChange", true);
  expect(useToast.getState().message).toBe(CUTOUT_TOO_LONG);
  expect("cutout" in item("long")).toBe(false);
  expect(st().project).toBe(before);
  expect(st().past).toHaveLength(0);
});

test("a failed copy says why, and the switch can always be turned off (on an older build and past 60 seconds too)", async () => {
  await open();
  await fireEvent(sw(), "valueChange", true);
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "failed", message: "cutout person: no person found" } } }); });
  expect(screen.getByText("No person was found in this clip.")).toBeTruthy();
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "failed", message: "cutout writer: boom" } } }); });
  expect(screen.getByText("Could not remove the background. Switch it off and on to try again.")).toBeTruthy();
  expect(screen.queryByLabelText("Preparing the cut-out")).toBeNull();
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  await fireEvent(sw(), "valueChange", false);
  expect("cutout" in item("a")).toBe(false);
  expect(st().past).toHaveLength(2);
});

test("a tap that changes nothing is no undo step: on while on, off while off", async () => {
  await open();
  await fireEvent(sw(), "valueChange", false);
  expect(st().past).toHaveLength(0);
  await fireEvent(sw(), "valueChange", true);
  await fireEvent(sw(), "valueChange", true);
  expect(st().past).toHaveLength(1);
});

test("a hidden strip renders nothing and does not follow the copies", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, cutout: true })] }));
  await render(<CutoutSheet clipId="a" visible={false} onClose={() => {}} />);
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.queryByLabelText("Remove background")).toBeNull();
  expect(screen.queryByText("Preparing the cut-out: 50 %")).toBeNull();
});

test("nothing is rendered for a clip that is gone", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })] }));
  await render(<CutoutSheet clipId="nope" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Remove background")).toBeNull();
});
