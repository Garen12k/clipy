import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** Files whose hex values are user content (burned into video or picked by the user), not UI chrome. */
const ALLOW = new Set([
  "src/theme/theme.ts", "src/editor/effects.ts", "src/editor/templates.ts", "src/editor/model/types.ts", "src/editor/model/effectMath.ts", "src/editor/model/adjust.ts", "src/editor/model/overlayLayout.ts",
  "src/editor/components/ColorRow.tsx", "src/editor/components/FilterLayer.tsx", "src/editor/components/OverlayText.tsx",
  "src/editor/components/TextPanel.tsx", "src/editor/components/CaptionStyleSheet.tsx", "src/editor/components/TransitionLayer.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("no hex colour literals outside the theme and the user-content allowlist", () => {
  const offenders: string[] = [];
  for (const dir of ["src", "app"]) for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (ALLOW.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => { if (/["'`]#[0-9A-Fa-f]{3,8}["'`]/.test(line)) offenders.push(`${rel}:${i + 1}`); });
  }
  expect(offenders).toEqual([]);
});
