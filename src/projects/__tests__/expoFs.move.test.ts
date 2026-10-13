// The phone's `File.move(…, { overwrite: true })` removes the destination BEFORE it moves and never asks whether the
// source is there (node_modules/expo-file-system/ios/FileSystemPath.swift, `move`). So the wrapper asks first: a move
// that has nothing to put in place must never reach the phone. The package is mocked — its native side cannot run here.
const mockDisk = new Set<string>();
const mockMove = jest.fn(async (_from: string, _to: string, _options: unknown) => {});
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return mockDisk.has(this.uri); }
    move(to: File, options: unknown) { return mockMove(this.uri, to.uri, options); }
  }
  class Directory {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return false; }
  }
  return { File, Directory, Paths: { document: { uri: "file:///doc" }, cache: { uri: "file:///cache" }, availableDiskSpace: 1 } };
});
import { expoFs } from "../expoFs";

beforeEach(() => { mockDisk.clear(); mockMove.mockClear(); });

test("a move whose source is not there is refused before the phone is asked — the destination is never touched", async () => {
  mockDisk.add("file:///doc/projects/p1/project.json");
  await expect(expoFs.move("file:///doc/projects/p1/project.json.tmp", "file:///doc/projects/p1/project.json")).rejects.toThrow(/nothing to move/);
  expect(mockMove).not.toHaveBeenCalled();
});

test("a move whose source is there goes to the phone as before, overwriting", async () => {
  mockDisk.add("file:///doc/projects/p1/project.json.tmp");
  await expoFs.move("file:///doc/projects/p1/project.json.tmp", "file:///doc/projects/p1/project.json");
  expect(mockMove.mock.calls).toEqual([["file:///doc/projects/p1/project.json.tmp", "file:///doc/projects/p1/project.json", { overwrite: true }]]);
});
