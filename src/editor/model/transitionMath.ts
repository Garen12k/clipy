import type { TransitionType } from "./types";

/**
 * The geometry of the ten transitions of 2026-10-06. Mirrored by modules/clipy-video/ios/TransitionMath.swift: keep the constants
 * and the formulas identical (transitionMath.parity.test.ts). The eleven older transitions have no maths here: their blends are in
 * ClipyCompositor.swift, and the preview dips to black.
 *
 * `progress` = 0…1 across the window (`transitionProgress`; the compositor's `progress`): at 0 only the OUTGOING frame (a) shows,
 * at 1 only the INCOMING frame (b). Every function clamps it first (`unitProgress`), so every result is finite and in its range.
 *
 * Space: everything is a FRACTION OF THE FRAME in SCREEN coordinates — origin at the frame's top-left corner, x to the right,
 * y DOWN. So "left" is −x, "right" +x, "up" −y, "down" +y, and "clockwise" is as seen on the screen. Nothing here is in pixels
 * (except `slantCurtain`, preview only) and nothing is in Core Image's bottom-left space: the Swift renderer converts once, where
 * it draws (y_ci = height − y_screen, so a y offset changes sign).
 */
export const TRANSITION = { pixelMax: 0.05 } as const;
/** Content values, allow-listed in noHexLiterals.test.ts. `flash` is burned into the video; `curtain` stands for the clip the preview cannot show. */
export const TRANSITION_COLORS = { flash: "#FFFFFF", curtain: "#000000" } as const;

const TAU = 2 * Math.PI;

/** The progress every function works with: inside 0…1; not a number counts as 0 (the outgoing frame). */
export function unitProgress(progress: number): number {
  return Number.isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress));
}

/** 0 at both ends of the window, 1 at the cut. The white flash's weight (over the outgoing frame before the cut, p < 0.5; over the incoming one from it on). */
export function dip(progress: number): number {
  const p = unitProgress(progress);
  return 1 - Math.abs(2 * p - 1);
}

/** Where the outgoing frame (a) and the incoming frame (b) sit — how far each is moved from its place, in frames — and which one is drawn on top. */
export interface SlideOffsets { ax: number; ay: number; bx: number; by: number; incomingOnTop: boolean }
/** The four transitions in which one frame slides over or off the other, which stays still; null for any other type. */
export function slideOffsets(type: string, progress: number): SlideOffsets | null {
  const p = unitProgress(progress);
  switch (type) {
    case "cover": return { ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true };            // in from the right
    case "reveal": return { ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false };          // off to the left
    case "coverUp": return { ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true };          // up from below
    case "revealDown": return { ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false };          // down and off
    default: return null;
  }
}

/**
 * The circle's radius as a fraction of the frame's half-diagonal (1 = it passes through the four corners), centred on the frame:
 * inside it is the incoming frame (open) or the outgoing one (close). Null for any other type.
 */
export function irisRadius(type: string, progress: number): number | null {
  const p = unitProgress(progress);
  switch (type) {
    case "circleOpen": return p;
    case "circleClose": return 1 - p;
    default: return null;
  }
}

/** The diagonal wipe: the incoming frame shows where u + v < this (u, v = fractions from the top-left corner: 0 there, 2 at the bottom-right). */
export function diagonalEdge(progress: number): number {
  const p = unitProgress(progress);
  return 2 * p;
}

/**
 * The clock wipe: radians swept clockwise (on screen) from 12 o'clock about the frame's centre; the incoming frame shows inside
 * the sweep. A point at (u, v) is at the angle atan2(u − 0.5, 0.5 − v), taken in 0…2π: straight up 0, right π/2, down π, left 3π/2.
 */
export function clockAngle(progress: number): number {
  const p = unitProgress(progress);
  return TAU * p;
}

/** Pixelate: the block's side as a fraction of the frame's shorter side. 0 at both ends: no blocks (the drawing code skips the filter). */
export function pixelSize(progress: number): number {
  const p = unitProgress(progress);
  return TRANSITION.pixelMax * dip(p);
}

// ---- Preview only (no Swift twin) ----
// The preview shows ONE picture: the outgoing clip up to the cut (p < 0.5), the incoming clip from the cut on. So a transition is
// shown by what is laid over that picture. For the shaped ones the rule is "the other clip is black": before the cut the part the
// incoming frame would occupy is black, from the cut on the part the outgoing frame would still occupy — the boundary is the export's.

export type TransitionCurtain =
  | { kind: "dip"; color: string; opacity: number }                              // the whole frame, at an opacity
  | { kind: "panel"; color: string; dx: number; dy: number }                     // a full-frame panel moved by (dx, dy) frames
  | { kind: "disc"; color: string; scale: number }                               // a circle of the half-diagonal's radius × scale, centred
  | { kind: "ring"; color: string; scale: number }                               // everything OUTSIDE that circle
  | { kind: "slant"; color: string; side: "before" | "after"; edge: number };    // one side of the diagonal edge (`diagonalEdge`)

/** What the preview lays over the picture for `type` at progress `p` (clamped to 0…1); null for None and a progress that is not a number. */
export function transitionCurtain(type: TransitionType, p: number): TransitionCurtain | null {
  if (type === "none" || !Number.isFinite(p)) return null;
  const q = unitProgress(p);
  const color = TRANSITION_COLORS.curtain;
  const before = q < 0.5;                                  // the outgoing clip is the one playing
  switch (type) {
    // The incoming frame's place is x ≥ 1 − q (both for a cover and for a reveal: they differ in which picture moves).
    case "cover": case "reveal": return { kind: "panel", color, dx: before ? 1 - q : 0 - q, dy: 0 };
    // …is y ≥ 1 − q.
    case "coverUp": return { kind: "panel", color, dx: 0, dy: before ? 1 - q : 0 - q };
    // …is y < q.
    case "revealDown": return { kind: "panel", color, dx: 0, dy: before ? q - 1 : q };
    case "circleOpen": return { kind: before ? "disc" : "ring", color, scale: q };
    case "circleClose": return { kind: before ? "ring" : "disc", color, scale: 1 - q };
    case "wipeDiagonal": return { kind: "slant", color, side: before ? "before" : "after", edge: diagonalEdge(q) };
    case "flashWhite": return { kind: "dip", color: TRANSITION_COLORS.flash, opacity: dip(q) };
    // The ten older types, and the two the preview cannot draw (clock wipe, pixelate): the dip to black.
    default: return { kind: "dip", color, opacity: dip(q) };
  }
}

/**
 * The black square that covers one side of the diagonal edge in a frame of w × h PIXELS (top-left origin, y down): its side (twice
 * the diagonal, so it reaches every corner at any place), how far its centre is moved from the frame's centre, and its turn in
 * radians, clockwise on screen (its own x axis along the edge's normal, which points from the top-left to the bottom-right).
 * "before" = the side nearer the top-left corner. A frame without an area, or a value that is not a number: a square of no size.
 */
export function slantCurtain(edge: number, side: "before" | "after", w: number, h: number): { size: number; dx: number; dy: number; angle: number } {
  const diagonal = Math.hypot(w, h);
  if (!(w > 0 && h > 0) || !Number.isFinite(diagonal) || !Number.isFinite(edge)) return { size: 0, dx: 0, dy: 0, angle: 0 };
  const nx = h / diagonal, ny = w / diagonal;              // the edge's unit normal: the gradient of x / w + y / h
  const reach = (w * h) / diagonal;                        // pixels along the normal per unit of u + v
  const size = 2 * diagonal;
  const distance = (edge - 1) * reach;                     // the edge's distance from the frame's centre (u + v = 1 there)
  const offset = side === "before" ? distance - size / 2 : distance + size / 2;
  return { size, dx: nx * offset, dy: ny * offset, angle: Math.atan2(ny, nx) };
}
