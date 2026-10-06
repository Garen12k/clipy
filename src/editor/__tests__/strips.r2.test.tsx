import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "new" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { EFFECT_IDS, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { STRIP } from "@/src/ui/ToolStrip";
import { EffectSheet } from "../components/EffectSheet";
import { TrimSheet } from "../components/TrimSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p", seconds: 3 })] }));
});

test("the Effects picker is a strip: inline, no scrim, its tiles in one sideways row, Done closes", async () => {
  const onClose = jest.fn();
  await render(<EffectSheet visible onClose={onClose} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getAllByRole("button")).toHaveLength(EFFECT_IDS.length + 1);     // the tiles and Done
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(st().project!.effects).toEqual([]);
});

test("Trim is a strip: the helper line in the header, the fields and Apply in one row of explicit height", async () => {
  const onClose = jest.fn();
  await render(<TrimSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByRole("header", { name: "Trim" })).toBeTruthy();
  expect(screen.getByText("Seconds into the original clip (0 – 4.0)")).toHaveProp("numberOfLines", 2);
  expect(screen.getByTestId("trim-row")).toHaveStyle({ height: STRIP.tiles, flexDirection: "row" });
  expect(screen.getByLabelText("Trim start").props.autoFocus).toBeFalsy();
  await fireEvent.changeText(screen.getByLabelText("Trim end"), "2.5");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  expect(st().project!.clips[0].trimEnd).toBe(2.5);
  expect(st().past).toHaveLength(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Trim for a photo: one Length field in the same row; Done closes without trimming", async () => {
  const onClose = jest.fn();
  await render(<TrimSheet clipId="p" visible onClose={onClose} />);
  expect(screen.getByText("How long the photo stays on screen (0.5 – 60 s)")).toHaveProp("numberOfLines", 2);
  expect(screen.getByTestId("trim-row")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getByLabelText("Length")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(st().past).toHaveLength(0);
});
