/** UI-only fonts. Overlay fonts (burned into exports) live in src/editor/fonts.ts and are mirrored in Swift — do not mix. */
export const uiFontAssets = {
  Oswald_700Bold: require("@/assets/fonts/ui/Oswald_700Bold.ttf"),
  Montserrat_400Regular: require("@/assets/fonts/ui/Montserrat_400Regular.ttf"),
  Montserrat_600SemiBold: require("@/assets/fonts/ui/Montserrat_600SemiBold.ttf"),
  Montserrat_800ExtraBold: require("@/assets/fonts/ui/Montserrat_800ExtraBold.ttf"),
} as const;
