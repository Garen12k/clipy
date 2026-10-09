import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AdjustSheet } from "../components/AdjustSheet";
import { ChromaSheet } from "../components/ChromaSheet";
import { ColorRow } from "../components/ColorRow";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Adjust: twelve parameters in one row, ONE slider for the selected one, Reset beside it", async () => {
  const onClose = jest.fn();
  await render(<AdjustSheet clipId="a" visible onClose={onClose} />);
  expect(btn("Brightness")).toBeSelected();
  expect(btn("Reset")).toBeDisabled();
  await fireEvent(screen.getByTestId("adjust-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("adjust-slider"), "valueChange", 0.35);
  expect(screen.getByText("Brightness +35")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await fireEvent.press(btn("Grain"));
  expect(screen.getByText("Grain 0")).toBeTruthy();
  await fireEvent.press(btn("Reset"));
  expect(st().project!.clips[0].adjust.brightness).toBe(0);
  expect(st().past).toHaveLength(2);
  expect(btn("Apply to All")).toBeTruthy();
  await expectStrip("Adjust", onClose);
});

test("Adjust on a layer has no action", async () => {
  await render(<AdjustSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Apply to All" })).toBeNull();
});

test("Green screen: the switch, the colours in one row and the strength row; the note is in the header", async () => {
  const onClose = jest.fn();
  await render(<ChromaSheet clipId="L" visible onClose={onClose} />);
  const sw = () => screen.getByLabelText("Green screen");
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  expect(screen.queryByLabelText("Custom color")).toBeNull();          // no keyboard in a strip
  await fireEvent(sw(), "valueChange", true);
  await fireEvent.press(screen.getByLabelText("Color #C8102E"));
  expect(st().project!.layers[0].chroma).toEqual({ color: "#C8102E", strength: 0.5 });
  await fireEvent.press(screen.getByLabelText("Color #FFFFFF"));          // white has no saturation: not keyable
  expect(screen.getByText("This colour is too grey to remove. Pick a stronger colour.")).toBeTruthy();
  expect(screen.queryByText("Shows in the exported video")).toBeNull();
  expect(st().past).toHaveLength(3);
  await expectStrip("Green screen", onClose);
});

test("ColorRow: the custom field stays by default and goes in compact", async () => {
  const view = await render(<ColorRow value="#FFFFFF" onChange={() => {}} />);
  expect(screen.getByLabelText("Custom color")).toBeTruthy();
  await view.rerender(<ColorRow compact value="#FFFFFF" onChange={() => {}} />);
  expect(screen.queryByLabelText("Custom color")).toBeNull();
  expect(screen.getByLabelText("Color #00E5A0")).toBeTruthy();
});
