jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { resolveOverlayMotion } from "../motion";
import { setOverlayAnimation } from "../ops";
import { ANIM_IN_IDS, ANIM_LIMITS, ANIM_REVEAL_IDS, clampOverlayAnimation, isRevealId, makeClip, makeOverlay, makeProject, makeSticker, type Project } from "../types";

const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })],
  overlays: [makeOverlay({ id: "t" }), makeSticker({ id: "s" }), makeOverlay({ id: "c", kind: "caption" })] });
const ov = (p: Project, id: string) => p.overlays.find((o) => o.id === id)!;
const tw = { id: "typewriter" as const, duration: 0.5 };

test("the reveal ids are their own list; the ten In ids are untouched", () => {
  expect(ANIM_REVEAL_IDS).toEqual(["typewriter", "wordByWord"]);
  expect(ANIM_IN_IDS).toHaveLength(10);
  expect(isRevealId("typewriter")).toBe(true);
  expect(isRevealId("fade")).toBe(false);
  expect(isRevealId(undefined)).toBe(false);
});

test("setOverlayAnimation: a text's In may be a reveal (duration clamped); one op, one project", () => {
  const p = setOverlayAnimation(base, "t", { in: { id: "wordByWord", duration: 9 } });
  expect(ov(p, "t").animation).toEqual({ in: { id: "wordByWord", duration: ANIM_LIMITS.maxDuration }, out: null, loop: null });
  expect(ov(setOverlayAnimation(p, "t", { in: { id: "pop", duration: 0.4 } }), "t").animation.in).toEqual({ id: "pop", duration: 0.4 });   // exclusive: it replaces
});

test("refused: a reveal on a sticker, a caption or an Out; a reveal with a duration that is not a number", () => {
  expect(setOverlayAnimation(base, "s", { in: tw })).toBe(base);
  expect(setOverlayAnimation(base, "c", { in: tw })).toBe(base);
  expect(setOverlayAnimation(base, "t", { out: tw as never })).toBe(base);
  expect(setOverlayAnimation(base, "t", { in: { id: "typewriter", duration: Number.NaN } })).toBe(base);
});

test("the sanity pass keeps a text's reveal and drops it anywhere else", () => {
  expect(clampOverlayAnimation({ in: tw, out: null, loop: null }, true).in).toEqual(tw);
  expect(clampOverlayAnimation({ in: tw, out: null, loop: null }).in).toBeNull();
  expect(clampOverlayAnimation({ in: null, out: tw, loop: null }, true).out).toBeNull();
  const raw = JSON.parse(JSON.stringify({ ...base, overlays: [
    { ...ov(base, "t"), animation: { in: tw, out: null, loop: "wiggle" } },
    { ...ov(base, "s"), animation: { in: tw, out: null, loop: null } },
    { ...ov(base, "c"), animation: { in: tw, out: null, loop: null } },
  ] }));
  const m = migrateProject(raw);
  expect(ov(m, "t").animation).toEqual({ in: tw, out: null, loop: "wiggle" });
  expect(ov(m, "s").animation.in).toBeNull();
  expect(ov(m, "c").animation.in).toBeNull();
});

test("a project without a reveal goes through the sanity pass byte for byte as before", () => {
  const plain = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], overlays: [
    makeOverlay({ id: "t", animation: { in: { id: "fade", duration: 0.4 }, out: { id: "pop", duration: 0.3 }, loop: "float" } }),
    makeSticker({ id: "s", animation: { in: { id: "spin", duration: 0.6 }, out: null, loop: null } }),
  ] });
  const once = migrateProject(JSON.parse(JSON.stringify(plain)));
  expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(once))))).toBe(JSON.stringify(once));
  expect(ov(once, "t").animation).toEqual({ in: { id: "fade", duration: 0.4 }, out: { id: "pop", duration: 0.3 }, loop: "float" });
  expect(ov(once, "s").animation).toEqual({ in: { id: "spin", duration: 0.6 }, out: null, loop: null });
});

test("a reveal moves nothing: the whole-text motion is the identity during it", () => {
  const o = makeOverlay({ id: "t", x: 0.3, y: 0.6, start: 1, end: 4, animation: { in: tw, out: null, loop: null } });
  expect(resolveOverlayMotion(o, 1.1)).toEqual({ x: 0.3, y: 0.6, scale: 1, rotation: 0, opacity: 1 });
});
