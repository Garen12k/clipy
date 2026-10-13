import { memoryFs } from "../fs";

test("memoryFs: size, a byte reader and a byte writer see one byte per character; a missing file has no size and cannot be read", async () => {
  const fs = memoryFs();
  fs.files.set("file:///doc/a.bin", "ABCDEF");
  expect(await fs.size("file:///doc/a.bin")).toBe(6);
  expect(await fs.size("file:///doc/none")).toBeNull();
  const r = fs.openReader("file:///doc/a.bin");
  expect(r.size).toBe(6);
  expect([...r.read(2, 3)]).toEqual([67, 68, 69]);
  expect([...r.read(4, 10)]).toEqual([69, 70]);
  expect(() => fs.openReader("file:///doc/none")).toThrow(/ENOENT/);
  const w = fs.openWriter("file:///doc/out/b.bin");
  expect(fs.files.get("file:///doc/out/b.bin")).toBe("");            // made, and empty, at once
  w.write(Uint8Array.from([0, 255, 65])); w.write(Uint8Array.from([66])); w.close();
  expect([...fs.openReader("file:///doc/out/b.bin").read(0, 4)]).toEqual([0, 255, 65, 66]);
});

test("memoryFs: moveDir renames a folder with everything in it", async () => {
  const fs = memoryFs();
  await fs.mkdir("file:///doc/incoming/x/media");
  fs.files.set("file:///doc/incoming/x/project.json", "{}"); fs.files.set("file:///doc/incoming/x/media/a.mov", "A");
  await fs.moveDir("file:///doc/incoming/x", "file:///doc/projects/x");
  expect([...fs.files.keys()].sort()).toEqual(["file:///doc/projects/x/media/a.mov", "file:///doc/projects/x/project.json"]);
  expect(await fs.exists("file:///doc/incoming/x")).toBe(false);
  expect(await fs.list("file:///doc/projects")).toEqual(["x"]);
});
