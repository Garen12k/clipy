import type { FrameStat } from "@/modules/clipy-video/frameStats";

/** A histogram of 64 bins, flat (100 each) from bin `round(from × 64)` up to (not including) `round(to × 64)`. */
export const flat = (from: number, to: number): number[] => {
  const h = new Array<number>(64).fill(0);
  for (let i = Math.round(from * 64); i < Math.round(to * 64); i++) h[i] = 100;
  return h;
};
/** One frame of the look: luma flat between `from` and `to`, means r g b, mean chroma `sat`. */
export const frame = (from: number, to: number, r: number, g: number, b: number, sat: number): FrameStat =>
  ({ time: 0, histogram: flat(from, to), r, g, b, saturation: sat, pixels: 1000 });

const fine = [0.0625, 0.875] as const;
/** The spec's §3 table: one frame per case → the five values. */
export const VECTORS: { name: string; f: FrameStat; want: { exposure: number; contrast: number; saturation: number; temperature: number; tint: number } }[] = [
  { name: "well exposed: nothing", f: frame(...fine, 0.47, 0.47, 0.47, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "dark", f: frame(0.03125, 0.4375, 0.24, 0.23, 0.22, 0.12), want: { exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "dim", f: frame(0.0625, 0.6875, 0.37, 0.37, 0.36, 0.14), want: { exposure: 0.23, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "bright", f: frame(0.375, 1, 0.75, 0.74, 0.73, 0.2), want: { exposure: -0.2, contrast: 0.2, saturation: 0, temperature: 0, tint: 0 } },
  { name: "flat", f: frame(0.28125, 0.65625, 0.47, 0.47, 0.46, 0.1), want: { exposure: 0, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "blue cast warms", f: frame(...fine, 0.38, 0.46, 0.58, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0.15, tint: 0 } },
  { name: "warm cast cools a little", f: frame(...fine, 0.52, 0.47, 0.42, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: -0.11, tint: 0 } },
  { name: "green cast goes magenta", f: frame(...fine, 0.42, 0.56, 0.42, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0.1 } },
  { name: "clipped both ends and garish", f: frame(0, 1, 0.5, 0.5, 0.5, 0.36), want: { exposure: 0, contrast: -0.08, saturation: -0.1, temperature: 0, tint: 0 } },
  { name: "black and white keeps its grey", f: frame(...fine, 0.47, 0.47, 0.47, 0.01), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "a black card is left alone", f: frame(0, 0.03125, 0.01, 0.01, 0.01, 0), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "a white card is left alone", f: frame(0.9375, 1, 0.97, 0.97, 0.97, 0), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
];
