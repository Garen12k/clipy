/**
 * Shared with the Swift mirror (the tables in modules/clipy-video/ios/Tests/TransitionMathTests.swift, compared line for line by
 * transitionMath.parity.test.ts). Plain literals. p = progress across the window. Offsets are fractions of the frame, y DOWN.
 * A progress outside 0…1 is clamped by every function (the last lines of each table).
 */
export interface TransitionScalarVector { fn: "dip" | "diagonalEdge" | "clockAngle" | "pixelSize"; p: number; expect: number }
export const TRANSITION_SCALAR_VECTORS: TransitionScalarVector[] = [
  { fn: "dip", p: 0, expect: 0 },                         // 1 − |−1|
  { fn: "dip", p: 0.25, expect: 0.5 },                    // 1 − |−0.5|
  { fn: "dip", p: 0.5, expect: 1 },
  { fn: "dip", p: 0.75, expect: 0.5 },
  { fn: "dip", p: 1, expect: 0 },
  { fn: "diagonalEdge", p: 0.25, expect: 0.5 },           // 2p
  { fn: "diagonalEdge", p: 1, expect: 2 },
  { fn: "clockAngle", p: 0.25, expect: 1.5707963267948966 },   // a quarter turn: 3 o'clock
  { fn: "clockAngle", p: 0.5, expect: 3.141592653589793 },
  { fn: "clockAngle", p: 1, expect: 6.283185307179586 },
  { fn: "pixelSize", p: 0.25, expect: 0.025 },            // 0.05 · 0.5
  { fn: "pixelSize", p: 0.5, expect: 0.05 },
  { fn: "pixelSize", p: 1, expect: 0 },
  { fn: "diagonalEdge", p: 0, expect: 0 },                // the two ends: nothing, then everything, is the incoming frame's
  { fn: "clockAngle", p: 0, expect: 0 },
  { fn: "pixelSize", p: 0, expect: 0 },
  { fn: "dip", p: -1, expect: 0 },                        // clamped to 0
  { fn: "dip", p: 2, expect: 0 },                         // clamped to 1
  { fn: "diagonalEdge", p: 3, expect: 2 },
  { fn: "clockAngle", p: -0.5, expect: 0 },
  { fn: "clockAngle", p: 2, expect: 6.283185307179586 },
  { fn: "pixelSize", p: 1.5, expect: 0 },
];

export interface TransitionSlideVector { type: string; p: number; ax: number; ay: number; bx: number; by: number; incomingOnTop: boolean }
export const TRANSITION_SLIDE_VECTORS: TransitionSlideVector[] = [
  { type: "cover", p: 0.25, ax: 0, ay: 0, bx: 0.75, by: 0, incomingOnTop: true },          // the incoming frame is still three quarters to the right
  { type: "cover", p: 1, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true },
  { type: "reveal", p: 0.25, ax: -0.25, ay: 0, bx: 0, by: 0, incomingOnTop: false },       // the outgoing frame has left a quarter to the left
  { type: "reveal", p: 1, ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false },
  { type: "coverUp", p: 0.25, ax: 0, ay: 0, bx: 0, by: 0.75, incomingOnTop: true },        // the incoming frame is still three quarters BELOW
  { type: "revealDown", p: 0.25, ax: 0, ay: 0.25, bx: 0, by: 0, incomingOnTop: false },    // the outgoing frame has moved a quarter DOWN
  { type: "revealDown", p: 1, ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false },
  { type: "cover", p: 0, ax: 0, ay: 0, bx: 1, by: 0, incomingOnTop: true },                // the start: the incoming frame is a whole frame to the RIGHT
  { type: "reveal", p: 0, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false },
  { type: "coverUp", p: 0, ax: 0, ay: 0, bx: 0, by: 1, incomingOnTop: true },              // a whole frame BELOW
  { type: "coverUp", p: 1, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true },
  { type: "revealDown", p: 0, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false },
  { type: "cover", p: -1, ax: 0, ay: 0, bx: 1, by: 0, incomingOnTop: true },               // clamped to 0
  { type: "reveal", p: 2, ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false },             // clamped to 1
  { type: "revealDown", p: 7, ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false },
];

export interface TransitionIrisVector { type: string; p: number; radius: number }
export const TRANSITION_IRIS_VECTORS: TransitionIrisVector[] = [
  { type: "circleOpen", p: 0.25, radius: 0.25 },
  { type: "circleOpen", p: 1, radius: 1 },
  { type: "circleClose", p: 0.25, radius: 0.75 },
  { type: "circleClose", p: 1, radius: 0 },
  { type: "circleOpen", p: 0, radius: 0 },
  { type: "circleClose", p: 0, radius: 1 },
  { type: "circleOpen", p: 2, radius: 1 },                // clamped to 1
  { type: "circleClose", p: -3, radius: 1 },              // clamped to 0
];
