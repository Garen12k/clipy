import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, type LayerClip, type Project } from "@/src/editor/model/types";
import { contextFor, TOOL_IDS, type Section, type ToolbarSelection } from "../toolbarContext";
import { SF_SYMBOLS } from "@/src/ui/sfSymbols";
import { barLayout, FLAT_LIMIT, groupOf, GROUPS, groupTools, pinTools, TOOL_META } from "../toolGroups";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");
const none: ToolbarSelection = { clipId: null, overlayId: null, effectId: null, audioId: null, section: null };
const cell = (id: string, n: number): LayerClip => ({ ...makePhotoClip({ id }), start: 0, collage: { group: "g", layout: "sideBySide", cell: n, border: 0, corner: 0, aspect: 0.5625 } });
/** Every kind of thing the bar can be asked about: the fixtures of the `toolbarContext` suites, in one project. */
const project = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" }), makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "cut", sourceDuration: 5, cutout: true }),
    makeClip({ id: "s", sourceDuration: 8, stabilize: "low" }), makeClip({ id: "sm", sourceDuration: 8, speed: 0.5, smooth: true }), { ...makePhotoClip({ id: "pm" }), motion: { id: "zoomIn" as const, strength: 0.5 } },
    { ...makePhotoClip({ id: "pk" }), keyframes: [makeKeyframe({ t: 0 })] }, makeClip({ id: "z", sourceDuration: 4 })],
  layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 }), { ...makePhotoClip({ id: "P" }), start: 0 }, { ...makeLayer({ id: "R", sourceDuration: 2, start: 5 }), reversed: true },
    { ...makeLayer({ id: "Lcut", sourceDuration: 5 }), cutout: true as const }, makeLayer({ id: "LS", sourceDuration: 6, stabilize: "high", start: 7 }), cell("c0", 0), cell("c1", 1)],
  overlays: [makeOverlay({ id: "t" }), makeOverlay({ id: "c", kind: "caption" }), makeSticker({ id: "st" })],
  effects: [makeEffect({ id: "e" })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 }), makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" }), makeAudioTrack({ id: "x", sourceDuration: 1, kind: "sfx" })],
});
const one = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
const onePhoto = makeProject({ clips: [makePhotoClip({ id: "p" })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });
const empty = makeProject({ audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });

/** Every context: each item of each project selected, each section, and nothing. */
function contexts() {
  const out: { name: string; sel: ToolbarSelection; p: Project }[] = [];
  for (const [label, p] of [["full", project], ["one", one], ["onePhoto", onePhoto], ["empty", empty], ["blank", makeProject()]] as const) {
    for (const section of [null, "audio", "text"] as Section[]) out.push({ name: `${label} / section ${section}`, sel: { ...none, section }, p });
    for (const c of [...p.clips, ...p.layers]) out.push({ name: `${label} / clip ${c.id}`, sel: { ...none, clipId: c.id }, p });
    for (const o of p.overlays) out.push({ name: `${label} / overlay ${o.id}`, sel: { ...none, overlayId: o.id }, p });
    for (const t of p.audioTracks) out.push({ name: `${label} / sound ${t.id}`, sel: { ...none, audioId: t.id }, p });
    for (const e of p.effects) out.push({ name: `${label} / effect ${e.id}`, sel: { ...none, effectId: e.id }, p });
  }
  return out;
}
const labels = (ids: readonly string[]) => ids.map((id) => TOOL_META[id as keyof typeof TOOL_META].label);
const layoutOf = (sel: Partial<ToolbarSelection>, p = project) => { const c = contextFor({ ...none, ...sel }, p); return barLayout(c.bar, c.tools); };
const grouped = (sel: Partial<ToolbarSelection>, p = project) => Object.fromEntries(layoutOf(sel, p).groups!.map((g) => [g.label, labels(g.tools)]));

test("the fixtures reach every tool: nothing `contextFor` can return is left out of the proof", () => {
  const seen = new Set(contexts().flatMap((c) => contextFor(c.sel, c.p).tools));
  expect([...TOOL_IDS].filter((id) => !seen.has(id))).toEqual([]);
});

test("PROOF: in every context each tool lands in exactly one place — the groups (or the flat row) are the list `contextFor` gave, less its pinned Delete, in its order", () => {
  expect(contexts().length).toBeGreaterThan(40);
  for (const { name, sel, p } of contexts()) {
    const { bar, tools } = contextFor(sel, p);
    const { pinned, rest, groups } = barLayout(bar, tools);
    const deletes = tools.filter((t) => TOOL_META[t].label === "Delete");
    // Delete: at most one on a bar, always pinned, never in the row.
    expect(`${name}: ${deletes}`).toBe(`${name}: ${pinned === null ? [] : [pinned]}`);
    expect(`${name}: ${rest}`).toBe(`${name}: ${tools.filter((t) => t !== pinned)}`);
    expect(new Set(tools).size).toBe(tools.length);
    if (!groups) continue;
    const all = groups.flatMap((g) => g.tools);
    // A permutation: the same tools, none twice, none missing.
    expect(`${name}: ${[...all].sort()}`).toBe(`${name}: ${[...rest].sort()}`);
    expect(new Set(all).size).toBe(all.length);
    for (const g of groups) {
      expect(g.tools.length).toBeGreaterThan(0);                                      // an empty group is not offered
      expect(g.tools).toEqual(rest.filter((t) => g.tools.includes(t)));               // `contextFor`'s order inside a group
      for (const t of g.tools) expect(groupOf(t)).toBe(g.id);
    }
    expect(groups.map((g) => g.id)).toEqual(GROUPS.map((g) => g.id).filter((id) => groups.some((g) => g.id === id)));   // the chooser's order
  }
});

test("which bars are in groups: only a clip's and a layer's; everything else is one flat row", () => {
  for (const { name, sel, p } of contexts()) {
    const { bar, tools } = contextFor(sel, p);
    const { rest, groups } = barLayout(bar, tools);
    expect(`${name}: ${groups !== null}`).toBe(`${name}: ${bar !== "main" && bar !== "audio" && rest.length > FLAT_LIMIT}`);
    if (bar === "clip" || bar === "layer") expect(`${name}: ${groups !== null}`).toBe(`${name}: true`);
    else expect(`${name}: ${groups}`).toBe(`${name}: null`);
  }
  expect(FLAT_LIMIT).toBe(7);
  // The main bar (13 tools) and a sound's bar (9 beside its Delete) are flat by rule, whatever their count — in `contextFor`'s own order.
  expect(layoutOf({})).toMatchObject({ pinned: null, groups: null });
  expect(layoutOf({}).rest).toHaveLength(13);
  expect(layoutOf({ audioId: "m" })).toMatchObject({ pinned: "audioDelete", groups: null });
  expect(labels(layoutOf({ audioId: "m" }).rest)).toEqual(["Split", "Volume", "Fade", "Voice", "Sound", "Duplicate", "Add audio", "Ducking", "Beats"]);
  expect(layoutOf({ overlayId: "t" })).toMatchObject({ pinned: "overlayDelete", rest: ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "text"], groups: null });
  expect(layoutOf({ effectId: "e" })).toMatchObject({ pinned: "effectDelete", rest: ["effectStrength", "effectDuplicate"], groups: null });
  expect(layoutOf({ section: "audio" })).toMatchObject({ pinned: null, rest: ["addAudio", "ducking", "beats"], groups: null });
});

test("a video clip: the five groups; the most used tools are in the first one, Select third as it is today", () => {
  expect(grouped({ clipId: "a" })).toEqual({
    Basics: ["Split", "Trim", "Select", "Speed", "Volume", "Filter", "Cut out", "Stabilize"],
    Edit: ["Keyframe", "Transition", "Replace", "Reverse", "Freeze", "Duplicate"],
    Audio: ["Extract audio", "Voice", "Sound"],
    Look: ["Animate", "Adjust", "Templates"],
    Frame: ["Background", "Crop", "Transform", "Opacity", "Mask", "Green screen"],
  });
  expect(layoutOf({ clipId: "a" }).pinned).toBe("delete");
});

test("a photo and a reversed clip have no Audio group; a clip with a copy has no Reverse; a layer and a collage cell get exactly the app's tools", () => {
  expect(grouped({ clipId: "p" })).toEqual({
    Basics: ["Split", "Trim", "Select", "Filter", "Cut out"], Edit: ["Keyframe", "Transition", "Replace", "Duplicate"],
    Look: ["Animate", "Motion", "Adjust", "Templates"], Frame: ["Background", "Crop", "Transform", "Opacity", "Mask", "Green screen"],
  });
  expect(Object.keys(grouped({ clipId: "r" }))).toEqual(["Basics", "Edit", "Look", "Frame"]);
  expect(grouped({ clipId: "r" }).Basics).toEqual(["Split", "Trim", "Select", "Speed", "Filter"]);
  for (const id of ["cut", "s", "sm"]) expect(grouped({ clipId: id }).Edit).not.toContain("Reverse");
  // The boards draw Split, Select, Transition and Freeze on a layer; the app has none of them there.
  expect(grouped({ clipId: "L" })).toEqual({
    Basics: ["Trim", "Speed", "Volume", "Filter", "Cut out", "Stabilize"], Edit: ["Keyframe", "Forward", "Back", "Replace", "Reverse", "Duplicate"],
    Audio: ["Extract audio", "Voice", "Sound"], Look: ["Animate", "Adjust"], Frame: ["Crop", "Transform", "Opacity", "Mask", "Blend", "Green screen"],
  });
  expect(grouped({ clipId: "c0" }).Basics).toEqual(["Collage", "Trim", "Filter", "Cut out"]);
  expect(grouped({ clipId: "c0" }).Edit).toEqual(["Keyframe", "Forward", "Back", "Replace", "Duplicate"]);
  expect(grouped({ clipId: "c0" }).Look).toEqual(["Animate", "Adjust"]);                 // no Motion on a cell
  expect(grouped({ clipId: "P" }).Look).toEqual(["Animate", "Motion", "Adjust"]);
});

test("a collage cell: Collage is the FIRST tool of the row a new selection shows — no group button needed to reach it", () => {
  for (const id of ["c0", "c1"]) {
    const { groups } = layoutOf({ clipId: id });
    expect(groups![0].id).toBe(GROUPS[0].id);                                             // the group every new selection starts in
    expect(groups![0].tools[0]).toBe("collage");
    expect(groups!.flatMap((g) => g.tools).filter((t) => t === "collage")).toHaveLength(1);
  }
  expect(groupOf("collage")).toBe("basics");
  // A layer that is not a cell has no Collage at all, as before.
  expect(layoutOf({ clipId: "L" }).rest).not.toContain("collage");
});

test("an id nobody named falls into the FIRST group, in its place — a new tool can never be hidden", () => {
  expect(groupOf("somethingNew")).toBe("basics");
  expect(groupTools(["crop", "somethingNew", "split", "another"])).toEqual([
    { id: "basics", label: "Basics", icon: "apps-outline", tools: ["somethingNew", "split", "another"] },
    { id: "frame", label: "Frame", icon: "scan-outline", tools: ["crop"] },
  ]);
  const many = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "delete"];
  expect(barLayout("clip", many)).toEqual({ pinned: "delete", rest: many.slice(0, 8), groups: [{ id: "basics", label: "Basics", icon: "apps-outline", tools: many.slice(0, 8) }] });
  expect(barLayout("clip", many.slice(1)).groups).toBeNull();                              // seven beside Delete: flat
  expect(pinTools(["a", "b"])).toEqual({ pinned: null, rest: ["a", "b"] });
});

test("the group symbols: outline glyphs that exist, each its own, and none the glyph of a tool that can stand beside it", () => {
  expect(GROUPS.map((g) => [g.label, g.icon])).toEqual([["Basics", "apps-outline"], ["Edit", "construct-outline"], ["Audio", "musical-notes-outline"], ["Look", "brush-outline"], ["Frame", "scan-outline"]]);
  for (const g of GROUPS) { expect(g.icon).toMatch(/-outline$/); expect(GLYPHS[g.icon]).toBeDefined(); }
  expect(new Set(GROUPS.map((g) => g.icon)).size).toBe(GROUPS.length);
  const beside = new Set(contexts().flatMap((c) => { const x = contextFor(c.sel, c.p); return barLayout(x.bar, x.tools).groups ? x.tools.map((t) => TOOL_META[t].icon) : []; }));
  for (const g of GROUPS) expect(beside.has(g.icon)).toBe(false);
});

test("SF Symbols: in every context no two different tools show the same symbol, and no group shows a tool's", () => {
  const symbolOf = (icon: string) => (SF_SYMBOLS as Record<string, string | undefined>)[icon];
  let checked = 0;
  for (const { name, sel, p } of contexts()) {
    const { bar, tools } = contextFor(sel, p);
    // What the bar can draw: each tool's symbol by its label (Keyframe has two — off a pin and on one), and the groups' when it has groups.
    const shown: [label: string, icon: string][] = tools.map((t) => [TOOL_META[t].label, TOOL_META[t].icon]);
    if (tools.includes("keyframe")) shown.push([TOOL_META.keyframe.label, "diamond"]);
    if (barLayout(bar, tools).groups) for (const g of GROUPS) shown.push([`group ${g.label}`, g.icon]);
    const owner = new Map<string, string>();
    for (const [label, icon] of shown) {
      const symbol = symbolOf(icon);
      expect(`${name} / ${label}: ${symbol}`).not.toMatch(/undefined$/);          // every tool and group has a symbol
      const first = owner.get(symbol!);
      if (first !== undefined && first !== label) throw new Error(`${name}: "${first}" and "${label}" both show ${symbol}`);
      owner.set(symbol!, label);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(400);
  // The collisions the design review found, as symbols: Audio / Volume, Look / Filter, Frame / Crop — and the pairs that look alike.
  const s = (id: keyof typeof TOOL_META) => symbolOf(TOOL_META[id].icon);
  const g = (id: string) => symbolOf(GROUPS.find((x) => x.id === id)!.icon);
  expect(new Set([s("audioMenu"), s("volume"), s("ducking")]).size).toBe(3);
  expect(g("audio")).not.toBe(s("volume"));
  expect(g("look")).not.toBe(s("filter"));
  expect(g("frame")).not.toBe(s("crop"));
  expect(new Set([s("crop"), s("transform"), s("stabilize"), g("frame")]).size).toBe(4);
  expect(new Set([s("overlay"), s("blend"), s("duplicate"), s("collage"), g("basics")]).size).toBe(5);
  expect(new Set([s("beats"), s("soundQuality"), s("extractAudio"), s("voice")]).size).toBe(4);
  // The multi-select bar is written out in MultiSelectBar.tsx, not in `contextFor`: its count, Done and six tools.
  const multi = ["checkmark-circle-outline", "checkmark-outline", "speedometer-outline", "volume-high-outline", "color-filter-outline", "copy-outline", "albums-outline", "trash-outline"].map(symbolOf);
  expect(multi).not.toContain(undefined);
  expect(new Set(multi).size).toBe(multi.length);
});
