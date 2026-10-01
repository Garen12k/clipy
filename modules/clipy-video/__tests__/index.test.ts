jest.mock("expo-modules-core", () => ({
  requireNativeModule: jest.fn((name: string) => {
    if (name !== "ClipyVideo") throw new Error(`unexpected module ${name}`);
    return { hello: () => "mock hello" };
  }),
}));

import { hello } from "../index";

describe("clipy-video wrapper", () => {
  it("hello() returns the native module's greeting", () => {
    expect(hello()).toBe("mock hello");
  });
});
