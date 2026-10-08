import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true), isCutoutAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/steadyRenders", () => ({ retrySteady: jest.fn() }));
jest.mock("@/src/editor/cutoutRenders", () => ({ retryCutout: jest.fn(), isNoPerson: (m: string) => m.includes("cutout person:") }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { CUTOUT_WITH_STEADY, CutoutSheet } from "../components/CutoutSheet";
import { STABILIZE_TOO_LONG, STABILIZE_WITH_CUTOUT, STEADY_FILE_MISSING, StabilizeSheet, stabilizeStatus } from "../components/StabilizeSheet";

const st = () => useEditorStore.getState();
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const NAME = "a-s1-2-0-0-8000.mov";
const open = async (id = "a") => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8, width: 1080, height: 1920 }), makeClip({ id: "long", sourceDuration: 200 }), makeClip({ id: "cut", sourceDuration: 8, cutout: true })],
    layers: [makeLayer({ id: "L", sourceDuration: 6 })],
  }));
  await act(() => { st().select(id); });
  await render(<StabilizeSheet clipId={id} visible onClose={() => {}} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  useSteadyFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("stabilizeStatus: what the strip's status row says", () => {
  const more = { cutout: false, refusal: null, file: undefined, bytes: 7592960 };
  expect(stabilizeStatus(false, more)).toBe("Takes out the shake. The copy takes about 8 MB.");
  expect(stabilizeStatus(false, { ...more, bytes: 10 })).toBe("Takes out the shake. The copy takes about 1 MB.");
  expect(stabilizeStatus(true, more)).toBe("Waiting to start.");
  expect(stabilizeStatus(true, { ...more, blocked: "build" })).toBe(STEADY_TOOLS);
  expect(stabilizeStatus(true, { ...more, blocked: "missing" })).toBe(STEADY_FILE_MISSING);
  expect(stabilizeStatus(true, { ...more, file: { status: "busy", progress: 0.417 } })).toBe("Steadying the clip: 42 %");
  expect(stabilizeStatus(true, { ...more, file: { status: "ready", uri: "u" } })).toBe("Ready.");
  expect(stabilizeStatus(true, { ...more, file: { status: "failed", message: "steady writer: boom" } })).toBe("Could not stabilize this clip. Tap the strength again to try again.");
  expect(stabilizeStatus(true, { ...more, refusal: "tooLong" })).toBe(STABILIZE_TOO_LONG);
  expect(stabilizeStatus(false, { ...more, cutout: true })).toBe(STABILIZE_WITH_CUTOUT);
  expect(STABILIZE_TOO_LONG).toBe("Stabilize works on clips up to 60 seconds. Trim or split this clip first.");
  expect(STABILIZE_WITH_CUTOUT).toBe("Stabilize does not work together with Remove background. Switch Remove background off for this clip first.");
});

test("four tiles; a pick is one undo step and only writes the strength; Off brings the clip back", async () => {
  await open();
  expect(screen.getByText("Stabilize")).toBeTruthy();
  expect(tile("Off")).toBeSelected();
  await press("Medium");
  expect(item("a").stabilize).toBe("medium");
  expect(st().past).toHaveLength(1);
  expect(tile("Medium")).toBeSelected();
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await press("High");
  expect(item("a").stabilize).toBe("high");
  await press("Off");
  expect("stabilize" in item("a")).toBe(false);
  expect(st().past).toHaveLength(3);
  await press("Off");
  expect(st().past).toHaveLength(3);                                   // already off: nothing
});

test("the status row follows the clip's copy", async () => {
  await open();
  await press("Medium");
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Steadying the clip: 50 %")).toBeTruthy();
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "ready", uri: "u" } } }); });
  expect(screen.getByText("Ready.")).toBeTruthy();
});

test("picking the strength a failed copy was for asks for it again and writes nothing", async () => {
  await open();
  await press("Medium");
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "failed", message: "steady writer: boom" } } }); });
  await press("Medium");
  expect(retrySteady).toHaveBeenLastCalledWith(NAME);
  expect(st().past).toHaveLength(1);
});

test("an older build, a clip over 60 seconds and a clip with Remove background each say why, and store nothing", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await open();
  await press("Low");
  expect(useToast.getState().message).toBe(STEADY_TOOLS);
  expect("stabilize" in item("a")).toBe(false);
  await screen.unmount();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  await open("long");
  await press("Low");
  expect(useToast.getState().message).toBe(STABILIZE_TOO_LONG);
  expect(screen.getByText(STABILIZE_TOO_LONG)).toBeTruthy();
  await screen.unmount();
  await open("cut");
  await press("Low");
  expect(useToast.getState().message).toBe(STABILIZE_WITH_CUTOUT);
  expect(st().past).toHaveLength(0);
});

test("a layer takes a strength too", async () => {
  await open("L");
  await press("Low");
  expect(item("L").stabilize).toBe("low");
});

test("Remove background says why it cannot be switched on for a clip with a strength", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, stabilize: "low" })] }));
  await act(() => { st().select("a"); });
  await render(<CutoutSheet clipId="a" visible onClose={() => {}} />);
  await act(() => { fireEvent(screen.getByLabelText("Remove background"), "valueChange", true); });
  expect(useToast.getState().message).toBe(CUTOUT_WITH_STEADY);
  expect(CUTOUT_WITH_STEADY).toBe("Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first.");
  expect("cutout" in item("a")).toBe(false);
});
