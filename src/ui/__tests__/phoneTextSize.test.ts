import { Dimensions } from "react-native";

const real = jest.requireActual<typeof import("../phoneTextSize")>("../phoneTextSize");
const say = (fontScale: number) => Dimensions.set({ window: { ...Dimensions.get("window"), fontScale }, screen: Dimensions.get("screen") });

test("the Jest preset's phone is NOT at the default text size: that is why the setup file stands in for this module", () => {
  expect(real.readFontScale()).toBe(2);
});

test("it reads the window's font scale, hears a change, and stops hearing when removed", () => {
  const heard = jest.fn();
  const off = real.onFontScale(heard);
  say(1.353);
  expect(real.readFontScale()).toBe(1.353);
  expect(heard).toHaveBeenCalledTimes(1);
  off();
  say(2);
  expect(heard).toHaveBeenCalledTimes(1);
});

test("a phone that does not say is at the default", () => {
  say(0);
  expect(real.readFontScale()).toBe(1);
  say(2);
});
