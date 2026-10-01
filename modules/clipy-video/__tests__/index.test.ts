jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireNativeModule: jest.fn((name: string) =>
      name === "ClipyVideo" ? { hello: () => "mock hello" } : actual.requireNativeModule(name),
    ),
  };
});

import { hello } from "../index";

describe("clipy-video wrapper", () => {
  it("hello() returns the native module's greeting", () => {
    expect(hello()).toBe("mock hello");
  });
});
