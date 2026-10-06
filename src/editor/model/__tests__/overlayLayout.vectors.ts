import type { BoxCorner } from "../types";

/**
 * The background box of a text: shared with the Swift mirror (the `boxVectors` table in modules/clipy-video/ios/Tests/OverlayLayoutTests.swift,
 * which overlayLayout.test.ts compares line for line). Expected values are plain literals, computed by hand.
 */
export interface BoxVector { name: string; fontScale: number; scale: number; background: boolean; boxPadding: number; boxCorner: BoxCorner; frame: [number, number];
  expect: { fontSize: number; padding: number; boxRadius: number } }

export const BOX_VECTORS: BoxVector[] = [
  // fontSize 0.1 × 1.5 × 1920 = 288; padding 0.25 × 288 = 72; radius 72 × 0.5 = 36 — the numbers every box had before the box fields
  { name: "the old box", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 288, padding: 72, boxRadius: 36 } },
  // 0.1 × 1.5 × 533 = 79.95; 0.25 × 79.95 = 19.9875; × 0.5 = 9.99375
  { name: "the old box in a small preview", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: [300, 533], expect: { fontSize: 79.95, padding: 19.9875, boxRadius: 9.99375 } },
  // 0.07 × 1920 = 134.4; padding 0.5 × 134.4 = 67.2; square → 0
  { name: "wide and square", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.5, boxCorner: "square", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 67.2, boxRadius: 0 } },
  // padding 0.1 × 134.4 = 13.44; the corner does not follow it: 0.25 × 134.4 × 0.5 = 16.8
  { name: "tight, still rounded", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.1, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 13.44, boxRadius: 16.8 } },
  { name: "no padding keeps the round corner", fontScale: 0.07, scale: 1, background: true, boxPadding: 0, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 0, boxRadius: 16.8 } },
  // 0.6 × 134.4 = 80.64
  { name: "the widest", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.6, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 80.64, boxRadius: 16.8 } },
  { name: "no background, no box", fontScale: 0.07, scale: 1, background: false, boxPadding: 0.5, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 0, boxRadius: 0 } },
  // 0.05 × 2 × 1080 = 108; 0.3 × 108 = 32.4; 0.25 × 108 × 0.5 = 13.5
  { name: "a square frame", fontScale: 0.05, scale: 2, background: true, boxPadding: 0.3, boxCorner: "rounded", frame: [1080, 1080], expect: { fontSize: 108, padding: 32.4, boxRadius: 13.5 } },
];
