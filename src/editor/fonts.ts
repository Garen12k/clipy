import { FONT_IDS, type FontId } from "./model/types";

export { FONT_IDS };
export interface FontInfo { label: string; family: string; postScriptName: string; file: string }

export const FONTS: Record<FontId, FontInfo> = {
  bangers:         { label: "Bangers",          family: "Bangers_400Regular",         postScriptName: "Bangers-Regular",         file: "Bangers-Regular.ttf" },
  anton:           { label: "Anton",            family: "Anton_400Regular",           postScriptName: "Anton-Regular",           file: "Anton-Regular.ttf" },
  oswald:          { label: "Oswald",           family: "Oswald_400Regular",          postScriptName: "Oswald-Regular",          file: "Oswald-Regular.ttf" },
  montserrat:      { label: "Montserrat",       family: "Montserrat_400Regular",      postScriptName: "Montserrat-Regular",      file: "Montserrat-Regular.ttf" },
  pacifico:        { label: "Pacifico",         family: "Pacifico_400Regular",        postScriptName: "Pacifico-Regular",        file: "Pacifico-Regular.ttf" },
  permanentMarker: { label: "Marker",           family: "PermanentMarker_400Regular", postScriptName: "PermanentMarker-Regular", file: "PermanentMarker-Regular.ttf" },
  lobster:         { label: "Lobster",          family: "Lobster_400Regular",         postScriptName: "Lobster-Regular",         file: "Lobster-Regular.ttf" },
  roboto:          { label: "Roboto",           family: "Roboto_400Regular",          postScriptName: "Roboto-Regular",          file: "Roboto-Regular.ttf" },
  bebasNeue: { label: "Bebas Neue", family: "BebasNeue_400Regular", postScriptName: "BebasNeue-Regular", file: "BebasNeue-Regular.ttf" },
  poppins: { label: "Poppins", family: "Poppins_600SemiBold", postScriptName: "Poppins-SemiBold", file: "Poppins-SemiBold.ttf" },
  playfair: { label: "Playfair", family: "PlayfairDisplay_400Regular", postScriptName: "PlayfairDisplay-Regular", file: "PlayfairDisplay-Regular.ttf" },
  fredoka: { label: "Fredoka", family: "Fredoka_400Regular", postScriptName: "Fredoka-Regular", file: "Fredoka-Regular.ttf" },
  caveat: { label: "Caveat", family: "Caveat_400Regular", postScriptName: "Caveat-Regular", file: "Caveat-Regular.ttf" },
  pressStart: { label: "Press Start", family: "PressStart2P_400Regular", postScriptName: "PressStart2P-Regular", file: "PressStart2P-Regular.ttf" },
  righteous: { label: "Righteous", family: "Righteous_400Regular", postScriptName: "Righteous-Regular", file: "Righteous-Regular.ttf" },
  dancingScript: { label: "Dancing Script", family: "DancingScript_400Regular", postScriptName: "DancingScript-Regular", file: "DancingScript-Regular.ttf" },
};

/** `useFonts(fontAssets)` loads every font under its `family` key (Expo Go has no embedded fonts). */
export const fontAssets: Record<string, number> = {
  Bangers_400Regular: require("../../assets/fonts/Bangers-Regular.ttf"),
  Anton_400Regular: require("../../assets/fonts/Anton-Regular.ttf"),
  Oswald_400Regular: require("../../assets/fonts/Oswald-Regular.ttf"),
  Montserrat_400Regular: require("../../assets/fonts/Montserrat-Regular.ttf"),
  Pacifico_400Regular: require("../../assets/fonts/Pacifico-Regular.ttf"),
  PermanentMarker_400Regular: require("../../assets/fonts/PermanentMarker-Regular.ttf"),
  Lobster_400Regular: require("../../assets/fonts/Lobster-Regular.ttf"),
  Roboto_400Regular: require("../../assets/fonts/Roboto-Regular.ttf"),
  BebasNeue_400Regular: require("../../assets/fonts/BebasNeue-Regular.ttf"),
  Poppins_600SemiBold: require("../../assets/fonts/Poppins-SemiBold.ttf"),
  PlayfairDisplay_400Regular: require("../../assets/fonts/PlayfairDisplay-Regular.ttf"),
  Fredoka_400Regular: require("../../assets/fonts/Fredoka-Regular.ttf"),
  Caveat_400Regular: require("../../assets/fonts/Caveat-Regular.ttf"),
  PressStart2P_400Regular: require("../../assets/fonts/PressStart2P-Regular.ttf"),
  Righteous_400Regular: require("../../assets/fonts/Righteous-Regular.ttf"),
  DancingScript_400Regular: require("../../assets/fonts/DancingScript-Regular.ttf"),
};
