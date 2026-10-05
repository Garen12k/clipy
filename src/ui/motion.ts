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
