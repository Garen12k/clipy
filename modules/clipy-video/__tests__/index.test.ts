jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireOptionalNativeModule: jest.fn((name: string) =>
      name === "ClipyVideo"
        ? { hello: () => "mock hello" }
        : actual.requireOptionalNativeModule(name),
    ),
  };
});

import { requireOptionalNativeModule } from "expo-modules-core";
import { hello } from "../index";

describe("clipy-video wrapper", () => {
  it("hello() returns the native module's greeting", () => {
    expect(hello()).toBe("mock hello");
  });

  it("throws a helpful error when the native module is not linked (e.g. Expo Go)", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
    expect(() => hello()).toThrow(/not linked/);
  });
});
