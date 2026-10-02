import { openReader } from "../fileReader";

const mockHandle = { offset: 0 as number | null, readBytes: jest.fn((n: number) => new Uint8Array(n)), close: jest.fn() };
let mockSizeThrows = false;
jest.mock("expo-file-system", () => ({
  FileMode: { ReadOnly: "r" },
  File: class { get size() { if (mockSizeThrows) throw new Error("no size"); return 7; } open() { return mockHandle; } },
}));

beforeEach(() => { mockHandle.close.mockClear(); mockSizeThrows = false; });

test("reads ranges by moving the mockHandle offset", () => {
  const rd = openReader("file:///a.mp4");
  expect(rd.size).toBe(7);
  expect(rd.read(3, 2).length).toBe(2);
  expect(mockHandle.offset).toBe(3);
  rd.close();
  expect(mockHandle.close).toHaveBeenCalledTimes(1);
});

test("closes the mockHandle if reading the size throws", () => {
  mockSizeThrows = true;
  expect(() => openReader("file:///a.mp4")).toThrow("no size");
  expect(mockHandle.close).toHaveBeenCalledTimes(1);
});
