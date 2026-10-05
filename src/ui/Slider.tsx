import RNSlider, { type SliderProps } from "@react-native-community/slider";
import { useRef } from "react";
import { theme } from "@/src/theme/theme";
import { haptic } from "./haptics";

/** The rest of the track is `sea`: 2.5:1 on a bar / strip / panel (`elevation.tile` was 1.15:1 there — all but invisible) and 2.8:1 next to the gold filled part. */
const TINT = { minimumTrackTintColor: theme.colors.accent, maximumTrackTintColor: theme.colors.sea, thumbTintColor: theme.colors.accent } as const;

/** True when going from `prev` to `next` reaches or passes one of `detents` (arriving exactly on one counts; leaving one does not). */
export function crossed(prev: number, next: number, detents: readonly number[]): boolean {
  return detents.some((d) => (prev < d && next >= d) || (prev > d && next <= d));
}

type Props = SliderProps & { /** Values where the control is "at rest" (0 for Brightness, 100 % for Volume, 1× for Speed): a light tick when a drag reaches or passes one. */ detents?: readonly number[] };

/**
 * The editor's slider: the native community slider with the theme's tints (the caller's props win). The tick is fired from the value
 * callback with the last value kept on a ref — no state, no store write, and the value is never snapped or changed. The ref only holds
 * a value during a drag (start → complete), so a value that changes from outside (undo, another control) never ticks; nor does a disabled slider.
 */
export function Slider({ detents, onSlidingStart, onValueChange, onSlidingComplete, ...rest }: Props) {
  const last = useRef<number | null>(null);
  return (
    <RNSlider {...TINT} {...rest}
      onSlidingStart={(v) => { last.current = typeof v === "number" ? v : null; onSlidingStart?.(v); }}
      onValueChange={(v) => {
        const prev = last.current;
        if (prev !== null) last.current = v;
        if (detents && prev !== null && !rest.disabled && crossed(prev, v, detents)) haptic("light");
        onValueChange?.(v);
      }}
      onSlidingComplete={(v) => { last.current = null; onSlidingComplete?.(v); }} />
  );
}
