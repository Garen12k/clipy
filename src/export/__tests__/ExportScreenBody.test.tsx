import { fireEvent, render, screen, within as rnWithin } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
let mockSize = 0;
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => mockSize }));
import { makeClip, makeProject, type ExportSettings } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
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
  expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size10 MB"); // 8 s at 10 Mbps
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
    expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size38 MB");
  });
  test("a project with saved choices shows them", async () => {
    await render(el({ status: "idle" }, makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })], exportSettings: { fps: 24, quality: "small" } })));
    expect(sel("24 fps")).toBeSelected();
    expect(sel("Smaller file")).toBeSelected();
    for (const n of ["30 fps", "60 fps", "High"]) expect(sel(n)).not.toBeSelected();
    expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size20 MB");
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
    expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size38 MB");
    await fireEvent.press(sel("60 fps"));
    expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size56 MB");
    await fireEvent.press(sel("Smaller file"));
    expect(screen.getByTestId("export-estimate")).toHaveTextContent("Estimated size34 MB");
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

describe("round 2 look: one gold button per state, values that read", () => {
  const gold = () => screen.queryAllByTestId("primary-button");

  test("idle: Export is the one gold button; the estimate is a row — its name leading, its value muted at the trailing edge; the rows are labelled alike", async () => {
    await renderBody({ status: "idle" });
    expect(gold()).toHaveLength(1);
    expect(gold()[0]).toHaveAccessibleName("Export");
    expect(screen.getByTestId("export-estimate")).toHaveStyle({ flexDirection: "row", justifyContent: "space-between" });
    expect(screen.getByTestId("export-estimate")).toHaveProp("accessibilityLabel", "Estimated size, 38 MB");   // read as one thing
    expect(screen.getByText("Estimated size")).toHaveStyle({ color: theme.colors.text });                      // no colon
    expect(screen.getByText("38 MB")).toHaveStyle({ color: theme.screen.muted, fontVariant: ["tabular-nums"] });
    for (const l of ["Resolution", "Frame rate", "Quality"]) expect(screen.getByText(l)).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.muted });
    expect(screen.getByTestId("export-options")).toHaveStyle({ backgroundColor: theme.screen.bar, borderRadius: theme.radius.card });   // ONE card
    expect(screen.getByText("4K needs a 4K source clip.")).toHaveStyle({ fontSize: theme.type.small });
  });

  test("unavailable (Expo Go): the card says why, the rows are still there, and there is no gold button", async () => {
    await renderBody({ status: "unavailable" });
    expect(screen.getByText("Export needs the native build")).toHaveStyle({ fontSize: theme.type.heading });
    expect(screen.getByText("Everything else in Clipy works in Expo Go.")).toBeTruthy();
    expect(gold()).toHaveLength(0);
  });

  test("exporting: the ring at its token size, a line that says so, Cancel grey, no gold button", async () => {
    await renderBody({ status: "exporting", progress: 0.42 });
    expect(screen.getByRole("progressbar")).toHaveStyle({ width: theme.size.ring, height: theme.size.ring });
    expect(screen.getByText("Exporting…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(gold()).toHaveLength(0);
  });

  test("done: the ring keeps its size, one gold button, Share and Done text only, the summary stands out", async () => {
    mockSize = 0;
    await renderBody({ status: "done", progress: 1, fileUri: "file:///out.mp4" });
    expect(screen.getByRole("progressbar")).toHaveStyle({ width: theme.size.ring, height: theme.size.ring });
    expect(gold()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Share" })).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(screen.getByRole("button", { name: "Done" })).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(screen.getByText("Ready to sail")).toHaveStyle({ fontSize: theme.type.title });
    expect(screen.getByText("1080p · 0:30")).toHaveStyle({ fontWeight: theme.weight.semi, color: theme.colors.text });
  });

  test("failed: the message is readable (cream, in a card) and Try again is the one gold button", async () => {
    const reset = jest.fn();
    await render(<ExportScreenBody project={project} state={{ status: "error", progress: 0, message: "Not enough free space on this iPhone for the export." }} start={jest.fn()} cancel={jest.fn()} reset={reset} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText("Not enough free space on this iPhone for the export.")).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.body });
    expect(screen.getByTestId("export-error")).toHaveStyle({ backgroundColor: theme.screen.bar });
    // The red icon is decoration: the message beside it says it all.
    expect(screen.getByTestId("export-error-icon", { includeHiddenElements: true })).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.getByTestId("export-error-icon", { includeHiddenElements: true })).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(gold()).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("the new layout: a small bar, the choices in one card, the actions pinned at the bottom", () => {
  const gold = () => screen.queryAllByTestId("primary-button");
  const sel = (n: string) => screen.getByRole("button", { name: n });
  const within = (id: string, name: string) => rnWithin(screen.getByTestId(id)).queryByRole("button", { name });
  const body = (state: Partial<ExportState> & { status: ExportState["status"] }, over: Partial<React.ComponentProps<typeof ExportScreenBody>> = {}) => (
    <ExportScreenBody project={project} state={{ progress: 0, ...state }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} {...over} />
  );

  test("the bar: a small centred title (no big one) and Close, which leaves the sheet as Done does", async () => {
    const onDone = jest.fn();
    await render(body({ status: "idle" }, { onDone }));
    expect(screen.getByRole("header", { name: "Export" })).toHaveStyle({ fontSize: theme.type.headline, textAlign: "center" });
    expect(screen.getByTestId("export-grabber", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(sel("Close"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("no project picture or name row", async () => {
    await render(body({ status: "idle" }));
    expect(screen.queryByText(project.name)).toBeNull();
  });

  test("the three choices are segments in the one card, with the defaults picked", async () => {
    await render(body({ status: "idle" }));
    for (const n of ["720p", "1080p", "4K", "24 fps", "30 fps", "60 fps", "High", "Smaller file"]) expect(within("export-options", n)).toBeTruthy();
    for (const n of ["1080p", "30 fps", "High"]) expect(sel(n)).toBeSelected();
    for (const n of ["720p", "4K", "24 fps", "60 fps", "Smaller file"]) expect(sel(n)).not.toBeSelected();
    expect(within("export-options", "Export")).toBeNull();
  });

  test("resolution: a pick moves the selection and the estimate; 4K is open with a 4K source and has no hint then", async () => {
    const start = jest.fn();
    const p = makeProject({ clips: [makeClip({ id: "u", sourceDuration: 30, width: 2160, height: 3840 })] });
    await render(<ExportScreenBody project={p} state={{ status: "idle", progress: 0 }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
    expect(sel("4K")).not.toBeDisabled();
    expect(screen.queryByText("4K needs a 4K source clip.")).toBeNull();
    const before = screen.getByTestId("export-estimate").props.accessibilityLabel;
    await fireEvent.press(sel("4K"));
    expect(sel("4K")).toBeSelected();
    expect(sel("1080p")).not.toBeSelected();
    expect(screen.getByTestId("export-estimate").props.accessibilityLabel).not.toBe(before);
    await fireEvent.press(sel("Export"));
    expect(start).toHaveBeenCalledWith(2160, { fps: 30, quality: "high" });
  });

  test("without a 4K source the 4K segment is inert and its hint is under the row", async () => {
    const start = jest.fn();
    await render(body({ status: "idle" }, { start }));
    expect(sel("4K")).toBeDisabled();
    expect(screen.getByText("4K needs a 4K source clip.")).toBeTruthy();
    await fireEvent.press(sel("4K"));
    expect(sel("1080p")).toBeSelected();
    await fireEvent.press(sel("Export"));
    expect(start).toHaveBeenCalledWith(1080, { fps: 30, quality: "high" });
  });

  test("idle: the gold Export is pinned in the actions, under choices that take the room left; it has no icon", async () => {
    const start = jest.fn();
    await render(body({ status: "idle" }, { start }));
    expect(gold()).toHaveLength(1);
    expect(within("export-actions", "Export")).toBeTruthy();
    expect(screen.getByTestId("export-scroll")).toHaveStyle({ flex: 1 });
    expect(rnWithin(gold()[0]).queryAllByText(/./, { includeHiddenElements: true })).toHaveLength(1);   // its title and nothing else
    await fireEvent.press(sel("Export"));
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("update needed: the options card stays, then today's sentences; nothing pinned", async () => {
    await render(body({ status: "unavailable" }));
    expect(screen.getByTestId("export-options")).toBeTruthy();
    expect(screen.getByText("Export needs the native build")).toBeTruthy();
    expect(screen.getByText("Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.")).toBeTruthy();
    expect(screen.getByText("Everything else in Clipy works in Expo Go.")).toBeTruthy();
    expect(screen.queryByTestId("export-actions")).toBeNull();
  });

  test("exporting: Cancel is pinned and stops at once (no question); Close is dimmed and inert", async () => {
    const cancel = jest.fn(), onDone = jest.fn();
    await render(body({ status: "exporting", progress: 0.37 }, { cancel, onDone }));
    expect(screen.getByText("Exporting…")).toBeTruthy();
    expect(within("export-actions", "Cancel")).toBeTruthy();
    expect(sel("Close")).toBeDisabled();
    await fireEvent.press(sel("Close"));
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(sel("Cancel"));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Stop exporting?")).toBeNull();
  });

  test.each(["idle", "unavailable", "done", "error"] as const)("%s: Close is live", async (status) => {
    await render(body({ status, fileUri: "file:///out.mp4", message: "No." }));
    expect(sel("Close")).not.toBeDisabled();
  });

  test("done with posting: gold Post to…, then Save to Photos, then ONE row — Share (with its icon) leading, Done trailing", async () => {
    const onPost = jest.fn(), onSave = jest.fn(), onShare = jest.fn(), onDone = jest.fn();
    await render(body({ status: "done", progress: 1, fileUri: "file:///out.mp4" }, { onPost, onSave, onShare, onDone }));
    expect(gold()).toHaveLength(1);
    expect(gold()[0]).toHaveAccessibleName("Post to…");
    for (const n of ["Post to…", "Save to Photos", "Share", "Done"]) expect(within("export-actions", n)).toBeTruthy();
    expect(sel("Save to Photos")).toHaveStyle({ backgroundColor: theme.screen.lifted });
    const rowEl = screen.getByTestId("export-quiet-row");
    expect(rowEl).toHaveStyle({ flexDirection: "row", justifyContent: "space-between" });
    expect(rnWithin(rowEl).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Share", "Done"]);
    expect(rnWithin(sel("Share")).getByTestId("export-share-icon", { includeHiddenElements: true })).toBeTruthy();   // inside the button: one target
    await fireEvent.press(sel("Share"));
    await fireEvent.press(sel("Done"));
    await fireEvent.press(sel("Save to Photos"));
    await fireEvent.press(sel("Post to…"));
    for (const f of [onShare, onDone, onSave, onPost]) expect(f).toHaveBeenCalledTimes(1);
  });

  test("done without posting: the gold button is Save to Photos, once; Share and Done as before", async () => {
    const onSave = jest.fn(), onShare = jest.fn(), onDone = jest.fn();
    await render(body({ status: "done", progress: 1, fileUri: "file:///out.mp4" }, { onSave, onShare, onDone }));
    expect(gold()).toHaveLength(1);
    expect(gold()[0]).toHaveAccessibleName("Save to Photos");
    expect(screen.getAllByRole("button", { name: "Save to Photos" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Post to…" })).toBeNull();
    await fireEvent.press(sel("Save to Photos"));
    await fireEvent.press(sel("Share"));
    await fireEvent.press(sel("Done"));
    for (const f of [onSave, onShare, onDone]) expect(f).toHaveBeenCalledTimes(1);
  });

  test("error: the card with the message, and Try Again pinned", async () => {
    const reset = jest.fn();
    await render(body({ status: "error", message: "The export failed." }, { reset }));
    expect(rnWithin(screen.getByTestId("export-error")).getByText("The export failed.")).toBeTruthy();
    expect(within("export-actions", "Try Again")).toBeTruthy();
    expect(within("export-error", "Try Again")).toBeNull();
    await fireEvent.press(sel("Try Again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
