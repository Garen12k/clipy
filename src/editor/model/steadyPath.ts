// Stabilize: from what the phone measured to what each frame is moved by. Pure arithmetic, TypeScript only — the phone reports
// numbers (`measureShake`) and is sent the finished corrections (`renderSteady`); nothing here is mirrored in Swift, so a wrong
// guess about what Vision's numbers mean is put right in this file (and in `STEADY` in steady.ts), without a new build.

/** Per measured frame, in order: its source second and Vision's step for it — how far the frame must move to sit on the frame before it, as fractions of the picture. */
export interface Shake { times: readonly number[]; dx: readonly number[]; dy: readonly number[] }
/**
 * `radius`: seconds of path each side of a frame that its calm position is averaged over. `zoom`: the copy's fixed zoom — a
 * correction is multiplied by it (the phone zooms first and moves second) and is never larger than what it hides. `cutShift`: a step larger than this (on either axis) is a cut or a failed
 * measurement, not shake. `scaleX` / `scaleY`: what one unit of Vision's step is as a correction — 1 as reported, −1 the other
 * way, another number for another unit.
 */
export interface PathRule { radius: number; zoom: number; cutShift: number; scaleX: number; scaleY: number }
/** Per frame: its source second and the fraction of the picture's width / height it is moved by. */
export interface Shifts { times: number[]; dx: number[]; dy: number[] }

const real = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The calm version of a path: at each frame the mean of the path over the frames within `r` seconds of it, nearer ones counting
 * more (weight 1 − distance / r). `r` is `radius`, but never more than the frame's distance to the first or the last frame: the
 * window stays symmetric, so a path that moves steadily (a pan) is its own calm version everywhere, the two ends included.
 * `times` ascend; the shorter of the two lists decides the length.
 */
export function smoothPath(times: readonly number[], path: readonly number[], radius: number): number[] {
  const n = Math.min(times.length, path.length);
  const out: number[] = new Array<number>(n);
  if (n === 0) return [];
  const first = times[0], last = times[n - 1];
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.min(real(radius) ? radius : 0, times[i] - first, last - times[i]);
    if (!(r > 0)) { out[i] = path[i]; continue; }
    while (times[lo] < times[i] - r) lo++;                  // the window's start never moves back
    let sum = 0, weight = 0;
    for (let j = lo; j < n && times[j] <= times[i] + r; j++) {
      const w = Math.max(0, 1 - Math.abs(times[j] - times[i]) / r);
      sum += path[j] * w;
      weight += w;
    }
    out[i] = weight > 0 ? sum / weight : path[i];           // the frame itself always weighs 1
  }
  return out;
}

/**
 * The correction of every measured frame. The steps are added up into the path the picture took (a step that is a cut counts as no
 * movement, on both axes); the path is made calm (`smoothPath`); a frame is moved by zoom × (path − calm path), turned by
 * `scaleX` / `scaleY`, never further than the zoom hides ((zoom − 1) / 2 of the picture each way), to five decimals. A frame
 * whose time is not a number, or not later than the frame before it, is left out. Total: any input gives finite numbers.
 *
 * Why × zoom: the shake was measured on the un-zoomed picture, and the phone scales a frame about its centre by `zoom` BEFORE it
 * moves it (`SteadyRender.swift`). A frame d off its calm place is zoom·d off after the scaling, so the move that cancels it is
 * zoom·d; the clamp is already in those zoomed units.
 */
export function steadyShifts(shake: Shake, rule: PathRule): Shifts {
  const n = Math.min(shake.times.length, shake.dx.length, shake.dy.length);
  const cut = real(rule.cutShift) && rule.cutShift > 0 ? rule.cutShift : Infinity;
  const times: number[] = [], x: number[] = [], y: number[] = [];
  let atX = 0, atY = 0;
  for (let i = 0; i < n; i++) {
    const t = shake.times[i], stepX = shake.dx[i], stepY = shake.dy[i];
    if (!real(t) || (times.length > 0 && t <= times[times.length - 1])) continue;
    if (real(stepX) && real(stepY) && Math.abs(stepX) <= cut && Math.abs(stepY) <= cut) { atX += stepX; atY += stepY; }
    times.push(t); x.push(atX); y.push(atY);
  }
  const limit = real(rule.zoom) ? Math.max(0, (rule.zoom - 1) / 2) : 0;
  const zoomBy = real(rule.zoom) && rule.zoom >= 1 ? rule.zoom : 1;
  const scaleX = (real(rule.scaleX) ? rule.scaleX : 1) * zoomBy, scaleY = (real(rule.scaleY) ? rule.scaleY : 1) * zoomBy;
  const calmX = smoothPath(times, x, rule.radius), calmY = smoothPath(times, y, rule.radius);
  const held = (v: number): number => Math.round(Math.min(limit, Math.max(-limit, v)) * 1e5) / 1e5 || 0;   // `|| 0`: never −0
  return { times, dx: x.map((at, i) => held(scaleX * (at - calmX[i]))), dy: y.map((at, i) => held(scaleY * (at - calmY[i]))) };
}
