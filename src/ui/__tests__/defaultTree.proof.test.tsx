import { existsSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react-native";
import { KitGallery } from "../testing/kitGallery";
import { ToneContext } from "../tone";

// PROOF. The kit at the DEFAULT text size, in both families, as it was drawn before the app limited text size at all (12 October 2026).
// The snapshot beside this file was written from the untouched kit and is never updated: never run Jest with -u for it.
// Only what cannot change a pixel at the default size is left out of the comparison: the four props below, and handlers.
type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
const NOT_PIXELS = new Set(["maxFontSizeMultiplier", "allowFontScaling", "accessibilityShowsLargeContentViewer", "accessibilityLargeContentTitle"]);

// Printed compactly — one line per view: its depth, its type, its props as JSON (keys sorted) — so the snapshot stays small.
function print(node: Json | string | null, depth: number, out: string[]): void {
  if (node === null) return;
  const pad = "  ".repeat(depth);
  if (typeof node === "string") { out.push(pad + JSON.stringify(node)); return; }
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(node.props).sort()) {
    const value = node.props[key];
    if (NOT_PIXELS.has(key) || typeof value === "function" || value === undefined) continue;
    props[key] = value;
  }
  out.push(`${pad}${node.type} ${JSON.stringify(props)}`);
  for (const child of node.children ?? []) print(child, depth + 1, out);
}
function drawn(): string {
  const tree = screen.toJSON() as unknown as Json | Json[] | null;
  const out: string[] = [];
  for (const top of Array.isArray(tree) ? tree : [tree]) print(top, 0, out);
  return out.join("\n");
}

test("PROOF: the snapshot is there (a deleted snapshot would be written again from whatever the kit is now)", () => {
  expect(existsSync(join(__dirname, "__snapshots__", "defaultTree.proof.test.tsx.snap"))).toBe(true);
});

test("PROOF: on a screen the kit draws what it drew before text size was limited", async () => {
  await render(<KitGallery />);
  expect(drawn()).toMatchSnapshot();
});

test("PROOF: in the editor the kit draws what it drew before text size was limited", async () => {
  await render(<ToneContext.Provider value="editor"><KitGallery /></ToneContext.Provider>);
  expect(drawn()).toMatchSnapshot();
});
