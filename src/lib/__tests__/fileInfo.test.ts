let mockSize: () => number = () => 7;
jest.mock("expo-file-system", () => ({ File: class { get size() { return mockSize(); } } }));
import { fileSize } from "../fileInfo";

test("returns the file's size in bytes", () => {
  mockSize = () => 14000000;
  expect(fileSize("file:///out.mp4")).toBe(14000000);
});

test("returns 0 when the size can't be read", () => {
  mockSize = () => { throw new Error("gone"); };
  expect(fileSize("file:///gone.mp4")).toBe(0);
  mockSize = () => NaN;
  expect(fileSize("file:///odd.mp4")).toBe(0);
  expect(fileSize("")).toBe(0);
});
