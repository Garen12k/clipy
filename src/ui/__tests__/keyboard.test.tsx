import { act, render } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { useKeyboard, useKeyboardTracking } from "../keyboard";

function Tracker() { useKeyboardTracking(); return null; }

test("follows keyboardWillShow / keyboardWillHide while mounted, and forgets the keyboard on unmount", async () => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const remove = jest.fn();
  const add = jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, fn: (e: unknown) => void) => { listeners[name] = fn; return { remove }; }) as never);
  const metrics = jest.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  const view = await render(<Tracker />);
  expect(useKeyboard.getState().height).toBe(0);
  expect(Object.keys(listeners).sort()).toEqual(["keyboardDidHide", "keyboardWillHide", "keyboardWillShow"]);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 516, width: 390, height: 336 } }); });
  expect(useKeyboard.getState().height).toBe(336);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 470, width: 390, height: 382 } }); });   // the emoji keyboard is taller
  expect(useKeyboard.getState().height).toBe(382);
  await act(() => { listeners.keyboardWillHide({ endCoordinates: { screenX: 0, screenY: 852, width: 390, height: 0 } }); });
  expect(useKeyboard.getState().height).toBe(0);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 516, width: 390, height: 336 } }); });
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(3);
  expect(useKeyboard.getState().height).toBe(0);
  add.mockRestore(); metrics.mockRestore();
});

test("keyboardDidHide ends at 0 too: a mount during the hide animation that read a stale height does not keep it", async () => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const add = jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, fn: (e: unknown) => void) => { listeners[name] = fn; return { remove: () => {} }; }) as never);
  const metrics = jest.spyOn(Keyboard, "metrics").mockReturnValue({ screenX: 0, screenY: 516, width: 390, height: 336 });   // keyboardWillHide was posted before the mount
  const view = await render(<Tracker />);
  expect(useKeyboard.getState().height).toBe(336);
  await act(() => { listeners.keyboardDidHide({ endCoordinates: { screenX: 0, screenY: 852, width: 390, height: 0 } }); });
  expect(useKeyboard.getState().height).toBe(0);
  await view.unmount();
  add.mockRestore(); metrics.mockRestore();
});

test("starts from a keyboard that is already up", async () => {
  const add = jest.spyOn(Keyboard, "addListener").mockImplementation((() => ({ remove: () => {} })) as never);
  const metrics = jest.spyOn(Keyboard, "metrics").mockReturnValue({ screenX: 0, screenY: 516, width: 390, height: 336 });
  const view = await render(<Tracker />);
  expect(useKeyboard.getState().height).toBe(336);
  await view.unmount();
  add.mockRestore(); metrics.mockRestore();
});
