import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
let mockSize = 0;
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => mockSize }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import type { ExportState } from "../useExport";
import { ExportScreenBody } from "../ExportScreenBody";

const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
const base = { progress: 0 };

const el = (state: Partial<ExportState> & { status: ExportState["status"] }, p = project) => (
  <ExportScreenBody project={p} state={{ progress: 0, ...state }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />
);
const renderBody = (state: Partial<ExportState> & { status: ExportState["status"] }) => render(el(state));
const rerenderBody = (view: Awaited<ReturnType<typeof render>>, state: Partial<ExportState> & { status: ExportState["status"] }) => view.rerender(el(state));

beforeEach(() => jest.clearAllMocks());

test("shows the fallback card when native is unavailable", async () => {
  await render(<ExportScreenBody project={project} state={{ status: "unavailable", ...base }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByText("Export needs the native build")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
});

test("idle: 4K disabled for HD sources, Export starts with the chosen resolution", async () => {
  const start = jest.fn();
  await render(<ExportScreenBody project={project} state={{ status: "idle", ...base }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByRole("button", { name: "4K" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "720p" }));
  await fireEvent.press(screen.getByRole("button", { name: "Export" }));
  expect(start).toHaveBeenCalledWith(720);
});

test("the Export button's name is exactly Export (compass is decorative)", async () => {
  await renderBody({ status: "idle" });
  expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  expect(screen.queryByLabelText("Clipy compass")).toBeNull();
});

test("missing clips are left out of the 4K check and the size estimate", async () => {
  const uhd = makeClip({ id: "u", sourceDuration: 60, width: 2160, height: 3840 });
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), uhd] });
  await render(<ExportScreenBody project={p} missingSourceUris={[uhd.sourceUri]} state={{ status: "idle", ...base }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByRole("button", { name: "4K" })).toBeDisabled();
  expect(screen.getByText("Estimated size: 10 MB")).toBeTruthy(); // 8 s at 10 Mbps
});

test("exporting shows the ring with the percentage and a Cancel button", async () => {
  await renderBody({ status: "exporting", progress: 0.42 });
  expect(screen.getByRole("progressbar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 42 });
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
});

test("done shows Ready to sail, the summary line and Save / Share / Done; no Post button without onPost", async () => {
  mockSize = 0;
  await renderBody({ status: "done", progress: 1, fileUri: "file:///out.mp4" });
  expect(screen.getByText("Ready to sail")).toBeTruthy();
  expect(screen.getByText("1080p · 0:30")).toBeTruthy(); // size unknown → left out
  for (const n of ["Save to Photos", "Share", "Done"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("Save to Photos");
  expect(screen.queryByRole("button", { name: /post/i })).toBeNull();
});

test("with onPost, Post to… is the gold action, Save becomes secondary, and the summary shows the file size", async () => {
  mockSize = 14000000;
  const onPost = jest.fn(), onSave = jest.fn();
  await render(<ExportScreenBody project={project} state={{ status: "done", progress: 1, fileUri: "file:///out.mp4" }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={onSave} onShare={jest.fn()} onDone={jest.fn()} onPost={onPost} />);
  expect(screen.getByText("1080p · 0:30 · 14 MB")).toBeTruthy();
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("Post to…");
  await fireEvent.press(screen.getByRole("button", { name: "Post to…" }));
  expect(onPost).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Save to Photos" }));
  expect(onSave).toHaveBeenCalledTimes(1);
});

test("success haptic fires once when the export finishes", async () => {
  const view = await renderBody({ status: "exporting", progress: 0.9 });
  await rerenderBody(view, { status: "done", progress: 1, fileUri: "file:///out.mp4" });
  await rerenderBody(view, { status: "done", progress: 1, fileUri: "file:///out.mp4" });
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});
