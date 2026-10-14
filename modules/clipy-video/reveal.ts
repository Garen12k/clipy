import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The "text reveal" build (2026-10-14): the export draws a text's reveal (Typewriter / Word by word — the request's `reveal` key). An
 * older build ignores that key, and the app sends no In with it, so the text simply appears whole. Nothing here throws.
 */
type RevealNative = { textReveal?: () => boolean };
function optional(): RevealNative | null {
  try { return requireOptionalNativeModule<RevealNative>("ClipyVideo"); } catch { return null; }
}
/** Whether the installed app is the "text reveal" build or a newer one. */
export function isTextRevealBuild(): boolean { return typeof optional()?.textReveal === "function"; }
/**
 * Whether picking a reveal must be refused: the native engine is installed but older than reveals. In Expo Go (no engine at all) the
 * reveal is preview-only and allowed — Expo Go cannot export.
 */
export function revealNeedsBuild(): boolean { return optional() !== null && !isTextRevealBuild(); }
