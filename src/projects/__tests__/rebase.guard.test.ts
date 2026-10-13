import { readFileSync } from "fs";
import { join } from "path";

// rebaseProject lists the fields that hold a file reference BY NAME. A new one in the model fails here until rebase.ts,
// packProject and restoreProject (src/projects/storage.ts) cover it.
test("the model's only file references are Clip.sourceUri and AudioTrack.sourceUri", () => {
  const src = readFileSync(join(__dirname, "..", "..", "editor", "model", "types.ts"), "utf8");
  const found = [...src.matchAll(/\b([A-Za-z]*(?:Uri|Url|Path|File))\??: *string/g)].map((m) => m[1]);
  expect(found).toEqual(["sourceUri", "sourceUri"]);
});
