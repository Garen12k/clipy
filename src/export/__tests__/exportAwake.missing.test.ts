jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock("expo-keep-awake", () => { throw new Error("expo-keep-awake was loaded in an app without its native module"); });
import { readFileSync } from "fs";
import { join } from "path";
import { stayAwake } from "../exportAwake";

test("an app without the keep-awake module: the package is never loaded and nothing is thrown", () => {
  expect(() => { stayAwake(true); stayAwake(false); }).not.toThrow();
});

test("exportAwake.ts is the only file that names the package, and it never imports it at the top", () => {
  const src = readFileSync(join(__dirname, "..", "exportAwake.ts"), "utf8");
  expect(src).not.toMatch(/^import .*from "expo-keep-awake"/m);
  expect(src).toContain('requireOptionalNativeModule("ExpoKeepAwake")');
  const hook = readFileSync(join(__dirname, "..", "useExport.ts"), "utf8");
  expect(hook).not.toContain("expo-keep-awake");
  expect(hook).toContain('useStayAwake(state.status === "exporting")');
});
