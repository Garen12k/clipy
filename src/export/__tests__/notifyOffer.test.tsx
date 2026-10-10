import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 0 }));
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: jest.fn(() => true), notifyState: jest.fn(), askToNotify: jest.fn(), notifyDone: jest.fn() }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { askToNotify, notifyAvailable, notifyDone, notifyState } from "@/src/lib/notify";
import { leftovers, wear } from "@/src/ui/testing/appearance";
import type { ExportState } from "../useExport";
import { ExportScreenBody } from "../ExportScreenBody";

const available = notifyAvailable as jest.Mock;
const state = notifyState as jest.Mock;
const ask = askToNotify as jest.Mock;
const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
type S = Partial<ExportState> & { status: ExportState["status"] };
const el = (s: S) => <ExportScreenBody project={project} state={{ progress: 0, ...s }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />;
/** The screen as it is opened (idle: the phone is read here), then the export started. */
const exporting = async () => { const view = await render(el({ status: "idle" })); await act(async () => {}); await view.rerender(el({ status: "exporting", progress: 0.37 })); await act(async () => {}); return view; };
const card = () => screen.queryByTestId("export-notify-offer");

beforeEach(() => { jest.clearAllMocks(); available.mockReturnValue(true); state.mockResolvedValue("notAsked"); ask.mockResolvedValue(true); });
afterEach(() => wear("dark"));

test("never asked, while exporting: the card — a bell, the title, the one sentence and ONE grey Continue; nothing has been asked", async () => {
  await exporting();
  expect(card()).toBeTruthy();
  expect(screen.getByText("Know when it's done")).toBeTruthy();
  expect(screen.getByText("Clipy can tell you when an export finishes.")).toBeTruthy();
  const go = screen.getByRole("button", { name: "Continue" });
  expect(go).toHaveStyle({ backgroundColor: "#1F4572" });            // the screen family's lifted step: grey, never the gold
  expect(screen.queryByTestId("primary-button")).toBeNull();          // no gold on the exporting screen
  expect(screen.queryByRole("button", { name: /not now/i })).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(ask).not.toHaveBeenCalled();
  expect(notifyDone).not.toHaveBeenCalled();
});

test("it sits under the ring in the middle area, not among the pinned actions", async () => {
  await exporting();
  const place = screen.getByTestId("export-notify-place");
  expect(place.parent).toBe(screen.getByRole("progressbar").parent!.parent);     // the ring's block and the card share the middle
  const pinned = screen.getByTestId("export-actions");
  let up: typeof place | null = place;
  while (up) { expect(up).not.toBe(pinned); up = up.parent; }
});

test("only while exporting: not on the options, not when it is done, not on a failure", async () => {
  const view = await render(el({ status: "idle" }));
  await act(async () => {});
  expect(card()).toBeNull();
  await view.rerender(el({ status: "exporting" })); await act(async () => {});
  expect(card()).toBeTruthy();
  await view.rerender(el({ status: "done", progress: 1, fileUri: "file:///out.mp4" })); await act(async () => {});
  expect(card()).toBeNull();
  await view.rerender(el({ status: "error", message: "No." })); await act(async () => {});
  expect(card()).toBeNull();
});

test.each(["granted", "denied", "unavailable"])("no card when the phone says %s", async (answer) => {
  state.mockResolvedValue(answer);
  await exporting();
  expect(card()).toBeNull();
  expect(screen.queryByTestId("export-notify-place")).toBeNull();
  expect(ask).not.toHaveBeenCalled();
});

test("no card, and the phone is not even read, in an installed app without notifications", async () => {
  available.mockReturnValue(false);
  await exporting();
  expect(card()).toBeNull();
  expect(state).not.toHaveBeenCalled();
});

test("Continue asks ONCE — Apple's own alert — and the card goes at once, whatever the answer; its room is kept so nothing moves", async () => {
  let answer: (v: boolean) => void = () => {};
  ask.mockImplementationOnce(() => new Promise<boolean>((r) => { answer = r; }));
  const view = await exporting();
  await fireEvent(screen.getByTestId("export-notify-place"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 148 } } });
  const go = screen.getByRole("button", { name: "Continue" });
  await fireEvent.press(go);
  expect(ask).toHaveBeenCalledTimes(1);
  expect(card()).toBeNull();                                           // gone before the alert is answered
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  expect(screen.getByTestId("export-notify-place")).toHaveStyle({ height: 148 });
  await act(async () => { answer(false); });
  expect(card()).toBeNull();
  // A progress tick, and the same export seen again: still gone, still one question.
  state.mockResolvedValue("denied");
  await view.rerender(el({ status: "exporting", progress: 0.6 })); await act(async () => {});
  expect(card()).toBeNull();
  expect(ask).toHaveBeenCalledTimes(1);
  // The export ends and another starts: the phone has its answer now, so no card and no kept room.
  await view.rerender(el({ status: "done", progress: 1, fileUri: "file:///out.mp4" })); await act(async () => {});
  await view.rerender(el({ status: "idle" })); await act(async () => {});
  await view.rerender(el({ status: "exporting" })); await act(async () => {});
  expect(card()).toBeNull();
  expect(screen.queryByTestId("export-notify-place")).toBeNull();
});

test("ignored, it stays until the export ends and may be offered again on a later export", async () => {
  const view = await exporting();
  await view.rerender(el({ status: "exporting", progress: 0.9 })); await act(async () => {});
  expect(card()).toBeTruthy();
  await view.rerender(el({ status: "done", progress: 1, fileUri: "file:///out.mp4" })); await act(async () => {});
  expect(card()).toBeNull();
  await view.rerender(el({ status: "idle" })); await act(async () => {});
  await view.rerender(el({ status: "exporting" })); await act(async () => {});
  expect(card()).toBeTruthy();
  expect(ask).not.toHaveBeenCalled();
});

test("in light the card is cream like the rest of the sheet: no navy surface, no white ink", async () => {
  wear("light");
  await exporting();
  expect(card()).toBeTruthy();
  expect(leftovers()).toEqual([]);
  expect(card()).toHaveStyle({ backgroundColor: "#FFFBF1" });
  expect(screen.getByText("Know when it's done")).toHaveStyle({ color: "#0A1B33" });
  expect(screen.getByRole("button", { name: "Continue" })).toHaveStyle({ backgroundColor: "#DDD0B4" });
});
