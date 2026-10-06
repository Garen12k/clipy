import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "new" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, minimumValue, maximumValue, step, value, onSlidingStart, onValueChange }: { testID?: string; minimumValue?: number; maximumValue?: number; step?: number; value?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} accessibilityValue={{ min: minimumValue, max: maximumValue, now: value }} accessibilityHint={String(step)} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.35)} />; });
import * as Haptics from "expo-haptics";
import { EFFECTS } from "@/src/editor/effects";
import { EFFECT_IDS, makeClip, makeEffect, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { EffectSheet } from "../components/EffectSheet";
import { EffectStrengthSheet } from "../components/EffectStrengthSheet";

const state = () => useEditorStore.getState();
beforeEach(() => {
  state().reset(); useToast.getState().clear(); (Haptics.impactAsync as jest.Mock).mockClear();
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
});

describe("EffectSheet", () => {
  test("is titled Effects and shows a tile for every effect", async () => {
    await render(<EffectSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Effects" })).toBeTruthy();
    expect(EFFECT_IDS).toHaveLength(20);
    for (const id of EFFECT_IDS) expect(screen.getByRole("button", { name: EFFECTS[id].label })).toBeTruthy();
  });

  test("a tile adds the effect at the playhead, selects it and closes, as one undo step", async () => {
    const onClose = jest.fn();
    state().select("a"); state().seek(3);
    await render(<EffectSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
    expect(state().project!.effects).toEqual([{ id: "new", type: "glow", start: 3, end: 5, intensity: 0.7, rect: null }]);
    expect(state().selectedEffectId).toBe("new");
    expect(state().selectedClipId).toBeNull();
    expect(state().past).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    expect(useToast.getState().message).toBeNull();
  });

  test("the new effect is clamped at the project's end", async () => {
    state().seek(9.5);
    await render(<EffectSheet visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shake" }));
    expect(state().project!.effects[0]).toMatchObject({ type: "shake", start: 9.5, end: 10 });
  });

  // The sheet is a native Modal, which would cover the toast: it closes first.
  test("an empty project closes the sheet and toasts", async () => {
    const onClose = jest.fn();
    state().setProject(makeProject());
    await render(<EffectSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
    expect(useToast.getState().message).toBe("Add a clip first.");
    expect(state().project!.effects).toEqual([]);
    expect(state().past).toHaveLength(0);
    expect(state().selectedEffectId).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  test("the sheet is closed before the refusal toast shows", async () => {
    state().setProject(makeProject());
    const order: string[] = [];
    const unsub = useToast.subscribe((s) => { if (s.message) order.push("toast"); });
    await render(<EffectSheet visible onClose={() => order.push("close")} />);
    await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
    unsub();
    expect(order).toEqual(["close", "toast"]);
  });

  test("a second tile pressed before the sheet has closed adds nothing; reopening the sheet allows the next", async () => {
    const onClose = jest.fn();
    const view = await render(<EffectSheet visible onClose={onClose} />);
    // The parent has not closed the sheet yet (still visible) when the second press lands.
    await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
    await fireEvent.press(screen.getByRole("button", { name: "Shake" }));
    expect(state().project!.effects.map((e) => e.type)).toEqual(["glow"]);
    expect(state().past).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.rerender(<EffectSheet visible={false} onClose={onClose} />);
    await view.rerender(<EffectSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shake" }));
    expect(state().project!.effects.map((e) => e.type)).toEqual(["glow", "shake"]);
  });

  test("a project too short for an effect closes the sheet and toasts that there is no room", async () => {
    const onClose = jest.fn();
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 0.1 })] }));
    await render(<EffectSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
    expect(useToast.getState().message).toBe("No room for an effect here.");
    expect(state().project!.effects).toEqual([]);
    expect(state().past).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EffectStrengthSheet", () => {
  beforeEach(() => { state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], effects: [makeEffect({ id: "e1", start: 1, end: 3 }), makeEffect({ id: "e2", start: 4, end: 6 })] })); });

  test("is titled Strength with a 0–1 slider showing the current value", async () => {
    await render(<EffectStrengthSheet effectId="e1" visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Strength" })).toBeTruthy();
    const slider = screen.getByTestId("effect-strength");
    expect(slider.props.accessibilityValue).toEqual({ min: 0, max: 1, now: 0.7 });
    expect(slider.props.accessibilityHint).toBe("0.01");
    expect(screen.getByText("Strength 70")).toBeTruthy();
  });

  test("a drag changes only that effect's intensity, as one undo step", async () => {
    await render(<EffectStrengthSheet effectId="e1" visible onClose={() => {}} />);
    const slider = screen.getByTestId("effect-strength");
    await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchMove");
    expect(state().project!.effects.map((e) => e.intensity)).toEqual([0.35, 0.7]);
    expect(state().project!.effects[0]).toMatchObject({ start: 1, end: 3 });
    expect(state().past).toHaveLength(1);
    expect(screen.getByText("Strength 35")).toBeTruthy();
  });

  test("renders nothing without an effect", async () => {
    await render(<EffectStrengthSheet effectId={null} visible onClose={() => {}} />);
    expect(screen.queryByTestId("effect-strength")).toBeNull();
  });
});

describe("EffectSheet region tiles", () => {
  test("Blur box adds a region effect with the default rectangle", async () => {
    await render(<EffectSheet visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Blur box" }));
    expect(state().project!.effects).toEqual([{ id: "new", type: "blurBox", start: 0, end: 2, intensity: 0.7, rect: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 } }]);
    expect(state().selectedEffectId).toBe("new");
  });
});
