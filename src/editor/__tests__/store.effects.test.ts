jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { addEffect, deleteEffect, moveEffect, setClipAdjust, setClipSpeed, trimClip } from "@/src/editor/model/ops";
import { makeClip, makeEffect, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })], effects: [makeEffect({ id: "e1", start: 0, end: 2 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("effect, clip and overlay selection are mutually exclusive", () => {
  const s = useEditorStore.getState();
  s.select("a");
  s.selectEffect("e1");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: null, selectedOverlayId: null, selectedEffectId: "e1" });
  s.select("a");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: "a", selectedEffectId: null });
  s.selectEffect("e1");
  s.selectOverlay("o1");
  expect(useEditorStore.getState()).toMatchObject({ selectedOverlayId: "o1", selectedEffectId: null });
  s.selectEffect("e1");
  s.selectEffect(null);
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("deleting the selected effect clears the selection", () => {
  const s = useEditorStore.getState();
  s.selectEffect("e1");
  s.apply((x) => deleteEffect(x, "e1"));
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("undoing the add of the selected effect clears the selection", () => {
  const s = useEditorStore.getState();
  s.apply((x) => addEffect(x, "glitch", 1, "e2"));
  s.selectEffect("e2");
  s.undo();
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("one slider drag is one undo step", () => {
  const s = useEditorStore.getState();
  s.beginTransaction();
  for (const v of [0.1, 0.2, 0.3]) s.applyTransient((x) => setClipAdjust(x, "a", { brightness: v }));
  expect(useEditorStore.getState().project!.clips[0].adjust.brightness).toBe(0.3);
  s.undo();
  expect(useEditorStore.getState().project!.clips[0].adjust.brightness).toBe(0);
  expect(useEditorStore.getState().canUndo()).toBe(false);
});

test("selectEffect clears a real overlay selection; selectOverlay clears a real clip selection", () => {
  const s = useEditorStore.getState();
  s.selectOverlay("o1");
  expect(useEditorStore.getState().selectedOverlayId).toBe("o1");
  s.selectEffect("e1");
  expect(useEditorStore.getState()).toMatchObject({ selectedOverlayId: null, selectedEffectId: "e1" });
  s.select("a");
  expect(useEditorStore.getState().selectedClipId).toBe("a");
  s.selectOverlay("o1");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: null, selectedOverlayId: "o1" });
});

test("setProject clears the effect selection", () => {
  useEditorStore.getState().selectEffect("e1");
  useEditorStore.getState().setProject(p);
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("a clip edit keeps effects that still start inside the project, untouched", () => {
  const s = useEditorStore.getState();
  s.apply((x) => addEffect(x, "glitch", 3, "e2"));
  s.selectEffect("e2");
  const before = useEditorStore.getState().project!.effects;
  s.apply((x) => trimClip(x, "a", 0, 4));
  const st = useEditorStore.getState();
  expect(st.project!.effects).toBe(before);   // same array: nothing re-created
  expect(st.project!.effects.map((e) => [e.id, e.start, e.end])).toEqual([["e1", 0, 2], ["e2", 3, 5]]);   // e2 runs past the new 4 s end
  expect(st.selectedEffectId).toBe("e2");
});

test("a clip edit that leaves an effect past the project's end drops it and its selection; undo restores it", () => {
  const s = useEditorStore.getState();
  s.apply((x) => addEffect(x, "glitch", 3, "e2"));
  s.selectEffect("e2");
  s.apply((x) => trimClip(x, "a", 0, 1));
  let st = useEditorStore.getState();
  expect(st.project!.effects.map((e) => [e.id, e.start, e.end])).toEqual([["e1", 0, 2]]);
  expect(st.selectedEffectId).toBeNull();
  s.undo();
  st = useEditorStore.getState();
  expect(st.project!.effects.map((e) => [e.id, e.start, e.end])).toEqual([["e1", 0, 2], ["e2", 3, 5]]);
});

describe("a clip drag does not lose end-of-project effects", () => {
  // a = 0–4 s, b = 4–10 s; the effect sits on the last two seconds.
  const fx = makeEffect({ id: "late", type: "glow", start: 8, end: 10, intensity: 0.4 });
  const ten = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 })], effects: [fx] });
  const effects = () => useEditorStore.getState().project!.effects;
  beforeEach(() => { useEditorStore.getState().setProject(ten); });

  test("a trim that passes over the effect and comes back restores it, as one undo step", () => {
    const s = useEditorStore.getState();
    s.beginTransaction();
    s.applyTransient((x) => trimClip(x, "b", 0, 3));   // 7 s: the effect starts past the end
    expect(effects()).toEqual([]);
    s.applyTransient((x) => trimClip(x, "b", 0, 6));   // back to 10 s
    expect(effects()).toEqual([{ id: "late", type: "glow", start: 8, end: 10, intensity: 0.4 }]);
    expect(effects()[0]).toBe(fx);
    expect(useEditorStore.getState().past).toHaveLength(1);
    s.undo();
    expect(useEditorStore.getState().project).toBe(ten);
    expect(useEditorStore.getState().canUndo()).toBe(false);
  });

  test("a drag that ends short still drops the effect; undo brings it back", () => {
    const s = useEditorStore.getState();
    s.beginTransaction();
    s.applyTransient((x) => trimClip(x, "b", 0, 5));
    s.applyTransient((x) => trimClip(x, "b", 0, 3));
    expect(effects()).toEqual([]);
    s.undo();
    expect(effects()).toEqual([fx]);
  });

  test("a speed drag restores it too", () => {
    const s = useEditorStore.getState();
    s.beginTransaction();
    s.applyTransient((x) => setClipSpeed(x, "b", 3));   // 4 + 2 = 6 s
    expect(effects()).toEqual([]);
    s.applyTransient((x) => setClipSpeed(x, "b", 1));
    expect(effects()).toEqual([fx]);
  });

  test("a clip drag that never strands the effect keeps the same effects array", () => {
    const s = useEditorStore.getState();
    s.beginTransaction();
    s.applyTransient((x) => trimClip(x, "b", 0, 5.5));
    expect(effects()).toBe(ten.effects);
  });

  test("a pill drag (moveEffect transient) still moves the effect", () => {
    const s = useEditorStore.getState();
    s.beginTransaction();
    s.applyTransient((x) => moveEffect(x, "late", 5));
    s.applyTransient((x) => moveEffect(x, "late", 3));
    expect(effects()).toEqual([{ ...fx, start: 3, end: 5 }]);
    expect(useEditorStore.getState().past).toHaveLength(1);
    s.undo();
    expect(effects()).toEqual([fx]);
  });
});
