import { TRANSITION, TRANSITION_COLORS, clockAngle, diagonalEdge, dip, irisRadius, pixelSize, slantCurtain, slideOffsets, transitionCurtain, unitProgress } from "../transitionMath";
import { TRANSITION_TYPES } from "../types";
import { TRANSITION_IRIS_VECTORS, TRANSITION_SCALAR_VECTORS, TRANSITION_SLIDE_VECTORS } from "./transitionMath.vectors";

const FN = { dip, diagonalEdge, clockAngle, pixelSize };
const OLD = TRANSITION_TYPES.slice(1, 11);
const BLACK = TRANSITION_COLORS.curtain;
const NEW = TRANSITION_TYPES.slice(11);
const WILD = [NaN, Infinity, -Infinity, -1, 2, 1e308, -1e308];

test.each(TRANSITION_SCALAR_VECTORS)("$fn($p)", (v) => expect(FN[v.fn](v.p)).toBeCloseTo(v.expect, 12));
test.each(TRANSITION_SLIDE_VECTORS)("slideOffsets $type at $p", (v) => {
  const { type, p, ...want } = v;
  expect(slideOffsets(type, p)).toEqual(want);
});
test.each(TRANSITION_IRIS_VECTORS)("irisRadius $type at $p", (v) => expect(irisRadius(v.type, v.p)).toBeCloseTo(v.radius, 12));

test("constants; a type without that geometry gives null", () => {
  expect(TRANSITION).toEqual({ pixelMax: 0.05 });
  expect(TRANSITION_COLORS).toEqual({ flash: "#FFFFFF", curtain: "#000000" });
  for (const type of ["fade", "wipe", "circleOpen", "nope"]) expect(slideOffsets(type, 0.5)).toBeNull();
  for (const type of ["fade", "cover", "nope"]) expect(irisRadius(type, 0.5)).toBeNull();
  // No −0 at the start of a reveal (a −0 is not equal to 0 for the tests, and prints oddly).
  expect(Object.is(slideOffsets("reveal", 0)!.ax, 0)).toBe(true);
});

test("every moving transition starts with only the outgoing frame in view and ends with only the incoming one", () => {
  for (const type of ["cover", "reveal", "coverUp", "revealDown"]) {
    const start = slideOffsets(type, 0)!, end = slideOffsets(type, 1)!;
    // In view = offset 0 on both axes; out of view = a whole frame away on one axis.
    expect([start.ax, start.ay]).toEqual([0, 0]);
    expect([end.bx, end.by]).toEqual([0, 0]);
    expect(Math.abs(start.bx) + Math.abs(start.by) === 1 || !start.incomingOnTop).toBe(true);    // a cover's incoming frame starts fully outside
    expect(Math.abs(end.ax) + Math.abs(end.ay) === 1 || end.incomingOnTop).toBe(true);           // a reveal's outgoing frame ends fully outside
  }
});

test("the ten new types: at progress 0 only the outgoing frame shows, at 1 only the incoming one", () => {
  expect(NEW).toEqual(["cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]);
  // Cover left / cover up: the incoming frame (on top) starts a whole frame to the right / below and ends in place.
  expect(slideOffsets("cover", 0)).toEqual({ ax: 0, ay: 0, bx: 1, by: 0, incomingOnTop: true });
  expect(slideOffsets("cover", 1)).toEqual({ ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true });
  expect(slideOffsets("coverUp", 0)).toEqual({ ax: 0, ay: 0, bx: 0, by: 1, incomingOnTop: true });
  expect(slideOffsets("coverUp", 1)).toEqual({ ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true });
  // Reveal left / reveal down: the outgoing frame (on top) starts in place and ends a whole frame to the left / below.
  expect(slideOffsets("reveal", 0)).toEqual({ ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false });
  expect(slideOffsets("reveal", 1)).toEqual({ ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false });
  expect(slideOffsets("revealDown", 0)).toEqual({ ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false });
  expect(slideOffsets("revealDown", 1)).toEqual({ ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false });
  // Circle open: the incoming frame is INSIDE — no circle, then one that reaches the corners. Circle close: the outgoing frame is inside.
  expect([irisRadius("circleOpen", 0), irisRadius("circleOpen", 1)]).toEqual([0, 1]);
  expect([irisRadius("circleClose", 0), irisRadius("circleClose", 1)]).toEqual([1, 0]);
  // Diagonal wipe: the incoming frame is where u + v < edge; u + v runs 0 (top-left) … 2 (bottom-right).
  expect([diagonalEdge(0), diagonalEdge(1)]).toEqual([0, 2]);
  // Clock wipe: the incoming frame is inside the sweep — nothing, then the full turn.
  expect([clockAngle(0), clockAngle(1)]).toEqual([0, 2 * Math.PI]);
  // Pixelate and white flash: no blocks and no white at either end (the frame under them is the outgoing one before the cut, p < 0.5).
  expect([pixelSize(0), pixelSize(1)]).toEqual([0, 0]);
  expect([dip(0), dip(1)]).toEqual([0, 0]);
});

test("the directions: left is −x, down is +y, and every value moves one way only", () => {
  const steps = [0, 0.1, 0.35, 0.5, 0.8, 1];
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1], b = steps[i];
    expect(slideOffsets("cover", b)!.bx).toBeLessThan(slideOffsets("cover", a)!.bx);                  // moving LEFT, from the right
    expect(slideOffsets("reveal", b)!.ax).toBeLessThan(slideOffsets("reveal", a)!.ax);                // moving LEFT, off the frame
    expect(slideOffsets("coverUp", b)!.by).toBeLessThan(slideOffsets("coverUp", a)!.by);              // moving UP, from below
    expect(slideOffsets("revealDown", b)!.ay).toBeGreaterThan(slideOffsets("revealDown", a)!.ay);     // moving DOWN, off the frame
    expect(irisRadius("circleOpen", b)!).toBeGreaterThan(irisRadius("circleOpen", a)!);
    expect(irisRadius("circleClose", b)!).toBeLessThan(irisRadius("circleClose", a)!);
    expect(diagonalEdge(b)).toBeGreaterThan(diagonalEdge(a));
    expect(clockAngle(b)).toBeGreaterThan(clockAngle(a));
  }
  expect(slideOffsets("cover", 0.3)!.bx).toBeGreaterThan(0);
  expect(slideOffsets("reveal", 0.3)!.ax).toBeLessThan(0);
  expect(slideOffsets("coverUp", 0.3)!.by).toBeGreaterThan(0);
  expect(slideOffsets("revealDown", 0.3)!.ay).toBeGreaterThan(0);
  expect(pixelSize(0.5)).toBe(TRANSITION.pixelMax);                                                   // the largest block is at the cut
});

test("total: a progress that is outside 0…1 or not a number gives finite values inside the range", () => {
  expect(WILD.map(unitProgress)).toEqual([0, 1, 0, 0, 1, 1, 0]);
  expect(Object.is(unitProgress(-0), 0)).toBe(true);
  for (const p of WILD) {
    for (const fn of [dip, pixelSize]) expect(Object.is(fn(p), 0)).toBe(true);
    expect(diagonalEdge(p) === 0 || diagonalEdge(p) === 2).toBe(true);
    expect(clockAngle(p) === 0 || clockAngle(p) === 2 * Math.PI).toBe(true);
    for (const type of ["cover", "reveal", "coverUp", "revealDown"]) {
      const o = slideOffsets(type, p)!;
      for (const n of [o.ax, o.ay, o.bx, o.by]) { expect(Number.isFinite(n)).toBe(true); expect(Math.abs(n)).toBeLessThanOrEqual(1); expect(Object.is(n, -0)).toBe(false); }
      expect([slideOffsets(type, 0), slideOffsets(type, 1)]).toContainEqual(o);
    }
    for (const type of ["circleOpen", "circleClose"]) expect([0, 1]).toContain(irisRadius(type, p));
  }
  expect(slideOffsets("cover", NaN)).toEqual(slideOffsets("cover", 0));       // not a number = the start: the outgoing frame
});

describe("transitionCurtain (preview only)", () => {
  test("the ten new types: nothing of the picture is covered at either end", () => {
    // A panel a whole frame away, a disc of no size, a ring whose hole reaches the corners, a slant with nothing on its side, a dip of 0.
    expect(NEW.map((type) => transitionCurtain(type, 0))).toEqual([
      { kind: "panel", color: BLACK, dx: 1, dy: 0 }, { kind: "panel", color: BLACK, dx: 1, dy: 0 },
      { kind: "panel", color: BLACK, dx: 0, dy: 1 }, { kind: "panel", color: BLACK, dx: 0, dy: -1 },
      { kind: "disc", color: BLACK, scale: 0 }, { kind: "ring", color: BLACK, scale: 1 },
      { kind: "slant", color: BLACK, side: "before", edge: 0 },
      { kind: "dip", color: BLACK, opacity: 0 }, { kind: "dip", color: BLACK, opacity: 0 }, { kind: "dip", color: "#FFFFFF", opacity: 0 },
    ]);
    expect(NEW.map((type) => transitionCurtain(type, 1))).toEqual([
      { kind: "panel", color: BLACK, dx: -1, dy: 0 }, { kind: "panel", color: BLACK, dx: -1, dy: 0 },
      { kind: "panel", color: BLACK, dx: 0, dy: -1 }, { kind: "panel", color: BLACK, dx: 0, dy: 1 },
      { kind: "ring", color: BLACK, scale: 1 }, { kind: "disc", color: BLACK, scale: 0 },
      { kind: "slant", color: BLACK, side: "after", edge: 2 },
      { kind: "dip", color: BLACK, opacity: 0 }, { kind: "dip", color: BLACK, opacity: 0 }, { kind: "dip", color: "#FFFFFF", opacity: 0 },
    ]);
  });
  test("the ten old types keep the black dip of before, to the number", () => {
    for (const type of OLD) for (const p of [0, 0.1, 0.25, 0.5, 0.738, 1]) {
      expect(transitionCurtain(type, p)).toEqual({ kind: "dip", color: "#000000", opacity: 1 - Math.abs(2 * p - 1) });
    }
    expect(transitionCurtain("none", 0.5)).toBeNull();
    expect(transitionCurtain("fade", NaN)).toBeNull();
  });
  test("clock wipe and pixelate are tag only: the same black dip; the white flash is a white dip", () => {
    expect(transitionCurtain("wipeClock", 0.25)).toEqual({ kind: "dip", color: BLACK, opacity: 0.5 });
    expect(transitionCurtain("pixelate", 0.5)).toEqual({ kind: "dip", color: BLACK, opacity: 1 });
    expect(transitionCurtain("flashWhite", 0.25)).toEqual({ kind: "dip", color: "#FFFFFF", opacity: 0.5 });
    expect(transitionCurtain("flashWhite", 0.5)).toEqual({ kind: "dip", color: "#FFFFFF", opacity: 1 });
  });
  test("cover / reveal: a black panel on the side of the clip that is not playing; the edge is at 1 − p of the width", () => {
    // Before the cut the incoming frame's place (x ≥ 0.75) is black: the panel starts at 0.75. After it the outgoing frame's (x < 0.25): the panel ends at 0.25.
    for (const type of ["cover", "reveal"] as const) {
      expect(transitionCurtain(type, 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0.75, dy: 0 });
      expect(transitionCurtain(type, 0.75)).toEqual({ kind: "panel", color: BLACK, dx: -0.75, dy: 0 });
      expect(transitionCurtain(type, 0.5)).toEqual({ kind: "panel", color: BLACK, dx: -0.5, dy: 0 });      // the cut belongs to the incoming clip
      expect(transitionCurtain(type, 0)).toEqual({ kind: "panel", color: BLACK, dx: 1, dy: 0 });            // nothing covered
      expect(transitionCurtain(type, 1)).toEqual({ kind: "panel", color: BLACK, dx: -1, dy: 0 });
    }
  });
  test("cover up: the edge rises from the bottom; reveal down: it falls from the top", () => {
    expect(transitionCurtain("coverUp", 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: 0.75 });     // y ≥ 0.75 is the incoming frame's
    expect(transitionCurtain("coverUp", 0.75)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: -0.75 });    // y < 0.25 is still the outgoing frame's
    expect(transitionCurtain("revealDown", 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: -0.75 }); // y < 0.25 already shows the incoming frame
    expect(transitionCurtain("revealDown", 0.75)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: 0.75 });  // y ≥ 0.75 is still the outgoing frame's
  });
  test("circles: a disc where the other clip is inside, a ring where it is outside; the radius is the export's", () => {
    expect(transitionCurtain("circleOpen", 0.25)).toEqual({ kind: "disc", color: BLACK, scale: 0.25 });
    expect(transitionCurtain("circleOpen", 0.75)).toEqual({ kind: "ring", color: BLACK, scale: 0.75 });
    expect(transitionCurtain("circleClose", 0.25)).toEqual({ kind: "ring", color: BLACK, scale: 0.75 });
    expect(transitionCurtain("circleClose", 0.75)).toEqual({ kind: "disc", color: BLACK, scale: 0.25 });
    for (const type of ["circleOpen", "circleClose"] as const) for (const p of [0.01, 0.3, 0.5, 0.9]) {
      const c = transitionCurtain(type, p)!;
      expect(c.kind === "disc" || c.kind === "ring").toBe(true);
      if (c.kind === "disc" || c.kind === "ring") expect(c.scale).toBeCloseTo(irisRadius(type, p)!, 12);
    }
  });
  test("diagonal wipe: the side before the edge is black before the cut, the side after it from the cut on", () => {
    expect(transitionCurtain("wipeDiagonal", 0.25)).toEqual({ kind: "slant", color: BLACK, side: "before", edge: 0.5 });
    expect(transitionCurtain("wipeDiagonal", 0.75)).toEqual({ kind: "slant", color: BLACK, side: "after", edge: 1.5 });
  });
  test("every type but None has a curtain at every progress; progress outside 0…1 is clamped", () => {
    for (const type of TRANSITION_TYPES.slice(1)) for (const p of [0, 0.2, 0.5, 0.8, 1]) expect(transitionCurtain(type, p)).not.toBeNull();
    expect(transitionCurtain("cover", -1)).toEqual(transitionCurtain("cover", 0));
    expect(transitionCurtain("cover", 2)).toEqual(transitionCurtain("cover", 1));
  });
});

describe("slantCurtain: the black square for one side of the diagonal edge, in pixels", () => {
  test("a 100 × 100 frame: diagonal 141.42, the edge at 45°", () => {
    // L = √20000 = 141.4214; normal (0.7071, 0.7071); D = 100·100 / L = 70.7107; size 2L = 282.8427.
    // edge 0.5, before: distance (0.5 − 1)·D = −35.3553; centre offset −35.3553 − 141.4214 = −176.7767 → dx = dy = −125.
    const a = slantCurtain(0.5, "before", 100, 100);
    expect(a.size).toBeCloseTo(282.842712474619, 9); expect(a.dx).toBeCloseTo(-125, 9); expect(a.dy).toBeCloseTo(-125, 9); expect(a.angle).toBeCloseTo(Math.PI / 4, 12);
    // edge 1.5, after: 35.3553 + 141.4214 = 176.7767 → dx = dy = 125.
    const b = slantCurtain(1.5, "after", 100, 100);
    expect(b.dx).toBeCloseTo(125, 9); expect(b.dy).toBeCloseTo(125, 9);
  });
  test("a 300 × 400 frame: diagonal 500, normal (0.8, 0.6), D = 240", () => {
    // edge 1 (the edge runs corner to corner through the centre), before: offset 0 − 500 → (−400, −300); angle atan2(0.6, 0.8).
    const a = slantCurtain(1, "before", 300, 400);
    expect(a).toEqual({ size: 1000, dx: expect.closeTo(-400, 9), dy: expect.closeTo(-300, 9), angle: expect.closeTo(0.6435011087932844, 12) });
    // edge 1.2, after: (1.2 − 1)·240 + 500 = 548 → (438.4, 328.8).
    const b = slantCurtain(1.2, "after", 300, 400);
    expect(b.dx).toBeCloseTo(438.4, 9); expect(b.dy).toBeCloseTo(328.8, 9);
  });
  test("at the two ends nothing, or everything, is on the 'before' side", () => {
    // edge 0: the 'before' square ends at the top-left corner — its nearest point to the frame centre is D away, towards the top-left.
    const start = slantCurtain(0, "before", 100, 100);
    expect(Math.hypot(start.dx, start.dy)).toBeCloseTo(70.71067811865476 + 141.4213562373095, 9);
    // edge 2: the 'after' square starts at the bottom-right corner.
    const end = slantCurtain(2, "after", 100, 100);
    expect(end.dx).toBeCloseTo(150, 9);
    expect(slantCurtain(1, "before", 0, 0)).toEqual({ size: 0, dx: 0, dy: 0, angle: 0 });           // not measured yet
    // A frame with no area, a size or an edge that is not a number: nothing to draw, never a NaN in a transform.
    for (const [edge, w, h] of [[1, 0, 100], [1, 100, 0], [1, -5, 100], [1, NaN, 100], [1, 100, Infinity], [NaN, 100, 100], [Infinity, 100, 100]]) {
      expect(slantCurtain(edge, "after", w, h)).toEqual({ size: 0, dx: 0, dy: 0, angle: 0 });
    }
  });
});
