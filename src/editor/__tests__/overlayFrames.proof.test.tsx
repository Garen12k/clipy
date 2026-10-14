import { createHash } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, makeClip, makeOverlay, makeProject, makeSticker, type Keyframe, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";

// PROOF. What the overlay layer draws over the preview at every frame of playback (30 fps) and at every boundary time, written from
// the layer as it was BEFORE it was made to redraw only the overlays that change (14 October 2026). The snapshot beside this file is
// never updated: never run Jest with -u for it, and never edit this file to make a change pass. What is seen must not change by a frame.
//
// Each run mounts the layer ONCE and moves the store's playhead as playback does, so a part that failed to draw again on a tick would
// show here as a stale tree. Every tree is printed in full (one line per view: depth, type, props as sorted JSON; handlers left out) and
// pinned by its SHA-256; consecutive equal frames are folded into one line. The first tree of each run is pinned in full too.

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
const W = 300, H = 533;
const store = () => useEditorStore.getState();

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v !== "function" && v !== undefined) out[k] = sorted(v);
    }
    return out;
  }
  return value;
}
function print(node: Json | string | null, depth: number, out: string[]): void {
  if (node === null) return;
  const pad = "  ".repeat(depth);
  if (typeof node === "string") { out.push(pad + JSON.stringify(node)); return; }
  out.push(`${pad}${node.type} ${JSON.stringify(sorted(node.props))}`);
  for (const child of node.children ?? []) print(child, depth + 1, out);
}
function drawn(): string {
  const tree = screen.toJSON() as unknown as Json | Json[] | null;
  const out: string[] = [];
  for (const top of Array.isArray(tree) ? tree : tree ? [tree] : []) print(top, 0, out);
  return out.join("\n");
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

const pin = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({ t, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, ...v });
const LENGTH = 6;
/** Every kind of overlay the preview draws, overlapping, some starting and ending mid-play. */
const OVERLAYS: Overlay[] = [
  makeOverlay({ id: "still", text: "Still here", start: 0, end: 6, x: 0.5, y: 0.2, fontScale: 0.06 }),
  makeOverlay({ id: "moving", text: "In out loop", start: 0.5, end: 4, x: 0.4, y: 0.6, fontScale: 0.08,
    animation: { in: { id: "slideUp", duration: 0.5 }, out: { id: "fade", duration: 0.6 }, loop: "wiggle" } }),
  makeOverlay({ id: "edges", text: "Pop in, spin out", start: 1.2, end: 3.4, x: 0.6, y: 0.45,
    animation: { in: { id: "pop", duration: 0.4 }, out: { id: "spin", duration: 0.5 }, loop: null } }),
  makeOverlay({ id: "keyed", text: "Keyframed", start: 1, end: 5, x: 0.5, y: 0.5,
    keyframes: [pin(0.5, { x: 0.3, y: 0.3 }), pin(1.5, { x: 0.7, scale: 1.6, rotation: 30, opacity: 0.6 }), pin(2.5, { y: 0.7, rotation: -20 })] }),
  makeOverlay({ id: "typed", text: "Typed one letter at a time", start: 0, end: 3, x: 0.5, y: 0.35,
    style: { ...DEFAULT_TEXT_STYLE, glow: { ...DEFAULT_GLOW }, shadow: { ...DEFAULT_SHADOW } },
    animation: { in: { id: "typewriter", duration: 1.5 }, out: null, loop: null } }),
  makeOverlay({ id: "worded", text: "One two three four five", start: 2, end: 5, x: 0.5, y: 0.75, background: { color: "#000000", opacity: 0.5 },
    animation: { in: { id: "wordByWord", duration: 1 }, out: { id: "fade", duration: 0.3 }, loop: null } }),
  makeOverlay({ id: "caption", kind: "caption", text: "Hello there my friend", start: 1, end: 4, x: 0.5, y: 0.85, highlightColor: "#FFD60A",
    words: [{ text: "Hello", start: 0, end: 0.5 }, { text: "there", start: 0.5, end: 1.1 }, { text: "my", start: 1.4, end: 1.6 }, { text: "friend", start: 1.6, end: 2.6 }] }),
  makeOverlay({ id: "plaincap", kind: "caption", text: "No highlight", start: 0, end: 2, x: 0.5, y: 0.9 }),
  makeOverlay({ id: "seethrough", text: "Half seen", start: 0.8, end: 5.5, x: 0.3, y: 0.1, style: { ...DEFAULT_TEXT_STYLE, opacity: 0.5 } }),
  makeOverlay({ id: "late", text: "Mid play", start: 3.33, end: 4.17, x: 0.7, y: 0.3, animation: { in: { id: "zoomIn", duration: 0.3 }, out: null, loop: "blink" } }),
  makeSticker({ id: "looping", emoji: "🔥", start: 0, end: 6, x: 0.8, y: 0.8, animation: { in: null, out: null, loop: "pulse" } }),
  makeSticker({ id: "shape", emoji: null, shape: "heart", color: "#FF3B30", start: 2.2, end: 3.7, x: 0.2, y: 0.7,
    animation: { in: { id: "zoomIn", duration: 0.3 }, out: { id: "slideDown", duration: 0.3 }, loop: null } }),
  makeSticker({ id: "keysticker", emoji: "⭐", start: 0.25, end: 5, keyframes: [pin(0, { x: 0.1 }), pin(2, { x: 0.9, scale: 2, opacity: 0.4 })] }),
  makeSticker({ id: "stillsticker", emoji: "🎉", start: 0, end: 6, x: 0.15, y: 0.15 }),
];

/** Every frame at 30 fps, every start / end, every In / Out window's edge and every pin, and a hair before each of those. */
function times(): number[] {
  const t = new Set<number>();
  for (let k = 0; k <= LENGTH * 30; k++) t.add(k / 30);
  for (const o of OVERLAYS) {
    const edges = [o.start, o.end, ...o.keyframes.map((p) => o.start + p.t)];
    if (o.animation.in) edges.push(o.start + o.animation.in.duration);
    if (o.animation.out) edges.push(o.end - o.animation.out.duration);
    if (o.kind === "caption") for (const w of o.words) edges.push(o.start + w.start, o.start + w.end);
    for (const e of edges) { t.add(e); t.add(e - 0.001); }
  }
  return [...t].filter((v) => v >= 0 && v <= LENGTH).sort((a, b) => a - b);
}

async function play(selected: string | null): Promise<string> {
  store().reset();
  store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: LENGTH })], overlays: OVERLAYS }));
  if (selected) store().selectOverlay(selected);
  await render(<OverlayLayer frameW={W} frameH={H} onOpenPanel={() => {}} />);
  const first = drawn();
  const lines: string[] = [];
  let last = "", from = 0, count = 0;
  const flush = () => { if (count > 0) lines.push(`${from.toFixed(4)} ×${count} ${last}`); };
  // Forwards through playback, then a jump back to the start and one into the middle (a seek).
  for (const t of [...times(), 0, 2.5]) {
    await act(() => { useEditorStore.setState({ playhead: t }); });
    const h = hash(drawn());
    if (h === last) { count++; continue; }
    flush();
    last = h; from = t; count = 1;
  }
  flush();
  return `FIRST TREE\n${first}\n\nFRAMES\n${lines.join("\n")}`;
}

test("PROOF: the snapshot is there (a deleted snapshot would be written again from whatever the layer draws now)", () => {
  expect(existsSync(join(__dirname, "__snapshots__", "overlayFrames.proof.test.tsx.snap"))).toBe(true);
});

for (const selected of [null, "still", "moving", "keyed", "seethrough", "typed", "caption", "looping", "keysticker", "stillsticker"]) {
  test(`PROOF: the overlay layer draws what it drew at every frame — ${selected ?? "nothing"} selected`, async () => {
    expect(await play(selected)).toMatchSnapshot();
  });
}
