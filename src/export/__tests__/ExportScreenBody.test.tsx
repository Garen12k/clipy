import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
let mockSize = 0;
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => mockSize }));
import { makeClip, makeProject, type ExportSettings } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
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
  expect(start).toHaveBeenCalledWith(720, { fps: 30, quality: "high" });
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

describe("frame rate and quality", () => {
  const sel = (n: string) => screen.getByRole("button", { name: n });
  test("idle shows the rows with the project's choices selected", async () => {
    await renderBody({ status: "idle" });
    expect(sel("30 fps")).toBeSelected();
    expect(sel("High")).toBeSelected();
    expect(screen.getByText("Estimated size: 38 MB")).toBeTruthy();
  });
  test("a project with saved choices shows them", async () => {
    await render(el({ status: "idle" }, makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })], exportSettings: { fps: 24, quality: "small" } })));
    expect(sel("24 fps")).toBeSelected();
    expect(sel("Smaller file")).toBeSelected();
    for (const n of ["30 fps", "60 fps", "High"]) expect(sel(n)).not.toBeSelected();
    expect(screen.getByText("Estimated size: 20 MB")).toBeTruthy();
  });
  test("settings that are not ones the app offers still show a selected chip (the defaults), and that is what Export starts with", async () => {
    const start = jest.fn();
    const junk = { fps: 25, quality: "ultra" } as unknown as ExportSettings;
    const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })], exportSettings: junk });
    await render(<ExportScreenBody project={p} state={{ status: "idle", ...base }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
    expect(sel("30 fps")).toBeSelected();
    expect(sel("High")).toBeSelected();
    await fireEvent.press(sel("Export"));
    expect(start).toHaveBeenCalledWith(1080, { fps: 30, quality: "high" });
  });
  test("picking updates the estimate, is remembered without an undo step, and is what Export starts with", async () => {
    const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
    useEditorStore.getState().setProject(p);
    const start = jest.fn();
    await render(<ExportScreenBody project={p} state={{ status: "idle", ...base }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText("Estimated size: 38 MB")).toBeTruthy();
    await fireEvent.press(sel("60 fps"));
    expect(screen.getByText("Estimated size: 56 MB")).toBeTruthy();
    await fireEvent.press(sel("Smaller file"));
    expect(screen.getByText("Estimated size: 34 MB")).toBeTruthy();
    expect(useEditorStore.getState().project?.exportSettings).toEqual({ fps: 60, quality: "small" });
    expect(useEditorStore.getState().past).toHaveLength(0);
    await fireEvent.press(sel("Export"));
    expect(start).toHaveBeenCalledWith(1080, { fps: 60, quality: "small" });
  });
  test("the rows are shown when native is unavailable, without an Export button", async () => {
    await renderBody({ status: "unavailable" });
    expect(sel("60 fps")).toBeTruthy();
    expect(sel("Smaller file")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
  test("the finish line is unchanged", async () => {
    mockSize = 0;
    await renderBody({ status: "done", progress: 1, fileUri: "file:///out.mp4" });
    expect(screen.getByText("1080p · 0:30")).toBeTruthy();
  });
});
