import { Dimensions } from "react-native";

/**
 * The phone's text size (Settings → Display & Brightness → Text Size, and Accessibility → Larger Text) as React Native's font scale:
 * 1 at the default, 1.353 at the largest standard size, 3.571 at the largest accessibility size. THE only file that asks
 * (textScale.guard.test.ts). Under Jest the setup file stands in for it: the preset's own phone says 2.
 */
export function readFontScale(): number {
  const scale = Dimensions.get("window").fontScale;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
/** Tells `listener` whenever the window's numbers change (iOS sends them again when the text size does). Returns the remover. */
export function onFontScale(listener: () => void): () => void {
  const subscription = Dimensions.addEventListener("change", listener);
  return () => subscription.remove();
}
