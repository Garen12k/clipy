import { Easing, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";

/**
 * The only place an animation is built. Each function returns what to ASSIGN to a shared value (`sv.value = pressTo(true, reduced)`):
 * the animation, or — with Reduce Motion — the end value itself, so nothing tweens. Only opacity and transform are ever driven by these.
 */
export const EASE = Easing.bezier(...theme.motion.curve);
export const timing = (ms: number) => ({ duration: ms, easing: EASE });

/** A pressable's scale while held (`down`) and when let go. */
export function pressTo(down: boolean, reduced: boolean): number {
  const to = down ? theme.motion.pressScale : 1;
  return reduced ? to : withTiming(to, timing(theme.motion.fast));
}
/** The selected "lift", 0..1 (the pressable multiplies its scale by 1 + 0.03 × this). */
export function liftTo(on: boolean, reduced: boolean): number {
  const to = on ? 1 : 0;
  return reduced ? to : withSpring(to, theme.motion.spring);
}
/** Content coming in, 0 → 1 (opacity; the shift is (1 − value) × theme.motion.enterShift). */
export function enterTo(reduced: boolean, duration: number = theme.motion.base, delay = 0): number {
  if (reduced) return 1;
  const anim = withTiming(1, timing(duration));
  return delay > 0 ? withDelay(delay, anim) : anim;
}
/** Content going out, → 0. */
export function fadeOutTo(reduced: boolean): number {
  return reduced ? 0 : withTiming(0, timing(theme.motion.fast));
}
/** A sheet's panel coming to rest (translateY → 0): when it opens, and when a drag that did not close it lets go. No bounce (theme.motion.sheet is critically damped). */
export function sheetTo(reduced: boolean): number {
  return reduced ? 0 : withSpring(0, theme.motion.sheet);
}

// ── The first-launch wizard's own builders (src/auth/WelcomeWizard.tsx and its pictures) — WIZARD ONLY. The wizard is not beside the
// video, so its steps may be longer than 250 ms and follow one another; each is still opacity / transform only, is played ONCE when its
// page first becomes the current one, never loops, and a page's whole sequence is over in under 4 s. With Reduce Motion each returns
// the end value: the page shows its finished picture at once. ──
const W = theme.motion.wizard;
/** Wizard only. The mark's play triangle drawn in, 0 → 1 (opacity; the scale grows with it). */
export function wizardDrawTo(reduced: boolean): number {
  return reduced ? 1 : withTiming(1, timing(W.draw));
}
/** Wizard only. The mark's spark popping in after the triangle, 0 → 1 on a spring that overshoots a little (scale; opacity follows). */
export function wizardPopTo(reduced: boolean): number {
  return reduced ? 1 : withDelay(W.popDelay, withSpring(1, W.pop));
}
/** Wizard only. Tile `index` of page 2 lighting up and playing its small picture, 0 → 1, each one after the one before. */
export function wizardStepTo(reduced: boolean, index: number): number {
  if (reduced) return 1;
  const anim = withTiming(1, timing(W.step));
  return index > 0 ? withDelay(index * W.stagger, anim) : anim;
}
/** Wizard only. Row `index` of page 3 coming in, 0 → 1 (opacity and the 8-pt shift), each one after the one before. */
export function wizardRowTo(reduced: boolean, index: number): number {
  if (reduced) return 1;
  const anim = withTiming(1, timing(W.row));
  return index > 0 ? withDelay(index * W.rowStagger, anim) : anim;
}
