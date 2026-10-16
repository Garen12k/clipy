import { ActionSheetIOS, Alert } from "react-native";
import { AFTER_SHEET_MS } from "../ProjectActionsSheet";
import { STYLE_MENU, openStyleMenu } from "../styleMenu";
import type { UserStyle } from "../userStyles";

const S: UserStyle = { id: "s1", name: "Beach", createdAt: "", music: null, filter: null, filterIntensity: 1, transition: { type: "none", duration: 0 }, title: null, motions: [], motionStrength: 0.5 };
beforeEach(() => { jest.useFakeTimers(); jest.restoreAllMocks(); });
afterEach(() => jest.useRealTimers());

test("Apple's wording, Delete red, Cancel last; the style's name as the title", () => {
  const show = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  openStyleMenu(S, { rename: jest.fn(), remove: jest.fn() });
  expect(STYLE_MENU).toEqual(["Rename", "Delete", "Cancel"]);
  expect(show.mock.calls[0][0]).toEqual({ title: "Beach", options: ["Rename", "Delete", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 });
});
test("Rename: the prompt, prefilled, only after the sheet is gone; an empty answer renames nothing", () => {
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation((_o, cb) => cb(0));
  const prompt = jest.spyOn(Alert, "prompt").mockImplementation(() => {});
  const rename = jest.fn();
  openStyleMenu(S, { rename, remove: jest.fn() });
  expect(prompt).not.toHaveBeenCalled();
  jest.advanceTimersByTime(AFTER_SHEET_MS);
  expect(prompt.mock.calls[0][0]).toBe("Rename style");
  expect(prompt.mock.calls[0][4]).toBe("Beach");
  const answer = prompt.mock.calls[0][2] as (name: string) => void;
  answer(""); expect(rename).not.toHaveBeenCalled();
  answer("Sea"); expect(rename).toHaveBeenCalledWith("s1", "Sea");
});
test("Delete asks first; only Delete in that alert removes; Cancel does nothing", () => {
  const show = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation((_o, cb) => cb(1));
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const remove = jest.fn();
  openStyleMenu(S, { rename: jest.fn(), remove });
  jest.advanceTimersByTime(AFTER_SHEET_MS);
  expect(alert.mock.calls[0][0]).toBe("Delete style?");
  expect(alert.mock.calls[0][1]).toBe("Projects made with it stay as they are.");
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map((b) => [b.text, b.style])).toEqual([["Cancel", "cancel"], ["Delete", "destructive"]]);
  expect(remove).not.toHaveBeenCalled();
  buttons[1].onPress!(); expect(remove).toHaveBeenCalledWith("s1");
  show.mockImplementation((_o, cb) => cb(2));
  openStyleMenu(S, { rename: jest.fn(), remove });
  jest.advanceTimersByTime(AFTER_SHEET_MS);
  expect(alert).toHaveBeenCalledTimes(1);
});
