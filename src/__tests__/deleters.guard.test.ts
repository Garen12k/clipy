import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// The undo history kept with a project (docs/superpowers/specs/2026-10-13-undo-history-design.md §0.1) relies on this: no code
// deletes a file in <project>/media that a project has referenced, so an old step never points at a file the app removed.
// These are ALL the files that delete anything. A new one fails here until it is read against that rule — a delete of a media
// file needs the history's references counted first — and is then added to the list.
const ROOT = join(__dirname, "..", "..");
const DELETES = /\b(?:expoFs|fs)\.remove\(|\.delete\(\)|deleteAsync/;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "ios") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("the files that delete anything are exactly these", () => {
  const found = ["src", "app", join("modules", "clipy-video")].flatMap((d) => sources(join(ROOT, d)))
    .filter((path) => DELETES.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path).replace(/\\/g, "/")).sort();
  expect(found).toEqual([
    "src/editor/cutoutRenders.ts",     // cache copies in <project>/cutout
    "src/editor/soundPeaks.ts",        // cache files in <project>/peaks
    "src/editor/soundRenders.ts",      // cache copies in <project>/sound
    "src/editor/steadyRenders.ts",     // cache copies in <project>/steady
    "src/editor/useReadAloud.ts",      // a speech file that was never placed in the project
    "src/projects/expoFs.ts",          // the adapter
    "src/projects/filePhone.ts",       // the picker's temporary copy
    "src/projects/storage.ts",         // covers, failed imports, temporaries, the history file, a deleted project's folder
    "src/projects/styleStore.ts",      // a style's own music copy in <documents>/styles/media, and one no style names; never a project's file
  ]);
});
