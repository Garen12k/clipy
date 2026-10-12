import { fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 0 }));
import { makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { hasSurface, leftovers, wear } from "@/src/ui/testing/appearance";
import type { ExportState } from "../useExport";
import { ExportScreenBody } from "../ExportScreenBody";

const hd = () => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
const uhd = () => makeProject({ clips: [makeClip({ id: "u", sourceDuration: 30, width: 2160, height: 3840 })] });

const show = (p: Project, status: ExportState["status"] = "idle", start = jest.fn()) =>
  render(<ExportScreenBody project={p} state={{ status, progress: 0 }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);

const NAME = { social: "Social, 1080p, 30 fps, High", message: "Message, 720p, 30 fps, Smaller file", best: "Best, 4K, 30 fps, High" } as const;
const tile = (id: keyof typeof NAME) => screen.getByRole("button", { name: NAME[id] });
const sel = (n: string) => screen.getByRole("button", { name: n });
const estimate = () => screen.getByTestId("export-estimate").props.accessibilityLabel as string;
const tiles = () => within(screen.getByTestId("export-presets")).getAllByRole("button");

beforeEach(() => jest.clearAllMocks());

test("the row stands above the options card, in the scrolling part, and not inside the card", async () => {
  await show(uhd());
  const tree = JSON.stringify(screen.toJSON());
  const at = (id: string) => tree.indexOf(`"testID":"${id}"`);
  expect(at("export-scroll")).toBeGreaterThan(-1);
  expect(at("export-presets")).toBeGreaterThan(at("export-scroll"));
  expect(at("export-options")).toBeGreaterThan(at("export-presets"));
  expect(within(screen.getByTestId("export-options")).queryByRole("button", { name: NAME.social })).toBeNull();
  expect(screen.getByTestId("export-presets")).toHaveStyle({ flexDirection: "row", gap: theme.space.sm });
});

test("with a 4K source: three equal tiles, each a button with its name, its settings and its hint; Social is picked (today's default)", async () => {
  await show(uhd());
  expect(tiles().map((t) => t.props.accessibilityLabel)).toEqual([NAME.social, NAME.message, NAME.best]);
  expect(tiles().map((t) => t.props.accessibilityHint)).toEqual([
    "For TikTok, Reels, Shorts and X", "A small file for WhatsApp, email and chat", "The highest quality this project can export",
  ]);
  for (const t of tiles()) expect(t).toHaveStyle({ flex: 1 });
  expect(tile("social")).toBeSelected();
  expect(tile("message")).not.toBeSelected();
  expect(tile("best")).not.toBeSelected();
  // The second line is the values themselves.
  for (const line of ["1080p · 30 · High", "720p · 30 · Smaller file", "4K · 30 · High"]) expect(screen.getByText(line)).toHaveStyle({ fontSize: theme.type.micro, color: theme.screen.muted });
  for (const name of ["Social", "Message", "Best"]) expect(screen.getByText(name)).toBeTruthy();
});

test("without a 4K source the row is TWO tiles — Best would be Social again", async () => {
  await show(hd());
  expect(tiles().map((t) => t.props.accessibilityLabel)).toEqual([NAME.social, NAME.message]);
  expect(screen.queryByText("Best")).toBeNull();
  expect(tile("social")).toBeSelected();
});

test("Message sets all three controls in one change, the estimate follows, and that is what Export starts with", async () => {
  const p = uhd();
  useEditorStore.getState().setProject(p);
  let writes = 0;
  const stop = useEditorStore.subscribe((now, was) => { if (now.project?.exportSettings !== was.project?.exportSettings) writes++; });
  const start = jest.fn();
  await show(p, "idle", start);
  const before = estimate();
  await fireEvent.press(tile("message"));
  for (const n of ["720p", "30 fps", "Smaller file"]) expect(sel(n)).toBeSelected();
  for (const n of ["1080p", "4K", "High"]) expect(sel(n)).not.toBeSelected();
  expect(tile("message")).toBeSelected();
  expect(tile("social")).not.toBeSelected();
  expect(estimate()).not.toBe(before);
  expect(estimate()).toBe("Estimated size, 11 MB");                                   // 30 s at 5 Mbps × 0.6
  expect(writes).toBe(1);                                                             // ONE change for the three controls
  stop();
  expect(useEditorStore.getState().project?.exportSettings).toEqual({ fps: 30, quality: "small" });
  expect(useEditorStore.getState().past).toHaveLength(0);                             // remembered, not an undo step
  await fireEvent.press(sel("Export"));
  expect(start).toHaveBeenCalledWith(720, { fps: 30, quality: "small" });
});

test("Best sets 4K · 30 · High from any other choice; Social sets it back", async () => {
  const p = makeProject({ clips: [makeClip({ id: "u", sourceDuration: 30, width: 2160, height: 3840 })], exportSettings: { fps: 24, quality: "small" } });
  useEditorStore.getState().setProject(p);
  const start = jest.fn();
  await show(p, "idle", start);
  for (const id of ["social", "message", "best"] as const) expect(tile(id)).not.toBeSelected();   // 1080p · 24 · Smaller file is no preset
  await fireEvent.press(tile("best"));
  for (const n of ["4K", "30 fps", "High"]) expect(sel(n)).toBeSelected();
  expect(tile("best")).toBeSelected();
  expect(estimate()).toBe("Estimated size, 131 MB");                                  // 30 s at 35 Mbps
  await fireEvent.press(sel("Export"));
  expect(start).toHaveBeenLastCalledWith(2160, { fps: 30, quality: "high" });
  await fireEvent.press(tile("social"));
  for (const n of ["1080p", "30 fps", "High"]) expect(sel(n)).toBeSelected();
  expect(tile("social")).toBeSelected();
  expect(tile("best")).not.toBeSelected();
  expect(estimate()).toBe("Estimated size, 38 MB");
  expect(useEditorStore.getState().project?.exportSettings).toEqual({ fps: 30, quality: "high" });
});

test("picked is derived from the controls: a manual change un-picks, and changing back picks again", async () => {
  const p = uhd();
  useEditorStore.getState().setProject(p);
  await show(p);
  await fireEvent.press(sel("60 fps"));
  for (const id of ["social", "message", "best"] as const) expect(tile(id)).not.toBeSelected();
  await fireEvent.press(sel("30 fps"));
  expect(tile("social")).toBeSelected();
  // By hand to another preset's values: that tile is the picked one, though it was never tapped.
  await fireEvent.press(sel("4K"));
  expect(tile("best")).toBeSelected();
  expect(tile("social")).not.toBeSelected();
  await fireEvent.press(sel("720p"));
  await fireEvent.press(sel("Smaller file"));
  expect(tile("message")).toBeSelected();
  expect(tiles().filter((t) => t.props.accessibilityState?.selected)).toHaveLength(1);
});

test("nothing new is stored: the project keeps exactly its two export settings, and the resolution starts at 1080p on every opening", async () => {
  const p = uhd();
  useEditorStore.getState().setProject(p);
  const view = await show(p);
  await fireEvent.press(tile("best"));
  expect(Object.keys(useEditorStore.getState().project!.exportSettings).sort()).toEqual(["fps", "quality"]);
  expect(JSON.stringify(useEditorStore.getState().project)).not.toMatch(/preset/i);
  await view.unmount();
  await show(useEditorStore.getState().project!);
  expect(sel("1080p")).toBeSelected();                                                // the resolution is the screen's own, as before
  expect(tile("social")).toBeSelected();
});

test("the row is there when the native build is missing too (the controls are)", async () => {
  await show(hd(), "unavailable");
  expect(tiles()).toHaveLength(2);
});

test.each(["exporting", "done", "error"] as const)("%s: no presets", async (status) => {
  await render(<ExportScreenBody project={hd()} state={{ status, progress: 0.5, fileUri: "file:///out.mp4", message: "No." }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.queryByTestId("export-presets")).toBeNull();
});

describe("in light", () => {
  afterEach(() => wear("dark"));
  test("the row is cream: a tile box, the picked one on the picked tint with the deep-gold ring, navy names, nothing left of the navy", async () => {
    wear("light");
    await show(uhd());
    expect(leftovers()).toEqual([]);
    expect(screen.getByTestId("export-preset-social")).toHaveStyle({ backgroundColor: "#E8DABC", borderWidth: 2, borderColor: "#7A5200" });
    expect(screen.getByTestId("export-preset-message")).toHaveStyle({ backgroundColor: "#EBE2CC" });
    expect(hasSurface("#E8DABC")).toBe(true);
    expect(screen.getByText("Social")).toHaveStyle({ color: "#0A1B33", fontWeight: theme.weight.semi });
    expect(screen.getByText("720p · 30 · Smaller file")).toHaveStyle({ color: "#4B576B" });
    await fireEvent.press(screen.getByRole("button", { name: NAME.best }));
    expect(leftovers()).toEqual([]);
    expect(screen.getByTestId("export-preset-best")).toHaveStyle({ backgroundColor: "#E8DABC" });
  });
});
