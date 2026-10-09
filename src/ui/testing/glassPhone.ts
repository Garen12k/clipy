import { act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { forgetReduceTransparencyForTests } from "../reduceTransparency";

type Handler = (on: boolean) => void;
/**
 * Tests only: the phone's Reduce Transparency setting, as `AccessibilityInfo` tells it. `start(on)` in a `beforeEach` (the answer is
 * forgotten, so every test starts "not known yet"); `settle()` lets the phone's first answer arrive; `change(on)` is the user flipping
 * the setting while the app is open. `listeners()` is how many listeners are attached NOW; `removed` counts the ones taken off.
 */
export function reduceTransparencyPhone() {
  const state = { on: false, handlers: [] as Handler[], removed: 0, asked: 0 };
  return {
    start(on = false) {
      state.on = on; state.handlers = []; state.removed = 0; state.asked = 0;
      forgetReduceTransparencyForTests();
      jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockImplementation(async () => { state.asked += 1; return state.on; });
      jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((name: string, handler: Handler) => {
        if (name !== "reduceTransparencyChanged") return { remove: () => {} };
        state.handlers.push(handler);
        return { remove: () => { state.removed += 1; state.handlers = state.handlers.filter((h) => h !== handler); } };
      }) as never);
    },
    settle: () => act(async () => {}),
    change: (on: boolean) => act(async () => { state.on = on; for (const h of [...state.handlers]) h(on); }),
    listeners: () => state.handlers.length,
    get removed() { return state.removed; },
    get asked() { return state.asked; },
  };
}
