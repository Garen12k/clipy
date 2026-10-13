import { readFileSync } from "fs";
import { join } from "path";

// rebaseProject lists the fields that hold a file reference BY NAME. A new one in the model fails here until rebase.ts,
// packProject and restoreProject (src/projects/storage.ts) cover it.
test("the model's only file references are Clip.sourceUri and AudioTrack.sourceUri", () => {
  const src = readFileSync(join(__dirname, "..", "..", "editor", "model", "types.ts"), "utf8");
  const found = [...src.matchAll(/\b(\w*(?:uri|url|path|file|source|src)\w*)\??: *(?:readonly +)?string/gi)].map((m) => m[1]);
  // Any field whose name speaks of a file or an address, in any case, of type string / string[] / string | null. `url` is a
  // post's web address (PostRecord), not a file of the project.
  expect(found).toEqual(["url", "sourceUri", "sourceUri"]);
});
