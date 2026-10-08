import { isBlurAndCutsBuild, isCutoutAvailable, isNativeAvailable, isSoundAvailable, isSpeechAvailable, isSteadyAvailable } from "@/modules/clipy-video";

/**
 * What the INSTALLED app can do, newest ability first. Buttons and screens arrive from the dev server at once, but an ability that
 * lives in the native engine is only there after a new build is installed — so a tool can be on screen in an app that cannot run it.
 * This names the installed build by what it has; add a row at the top whenever a build adds a native ability.
 */
const LEVELS: { name: string; has: () => boolean }[] = [
  { name: "blur and cuts", has: isBlurAndCutsBuild },
  { name: "stabilize and smooth", has: isSteadyAvailable },
  { name: "beats and background", has: isCutoutAvailable },
  { name: "noise, ramps and speech", has: isSpeechAvailable },
  { name: "sound tools", has: isSoundAvailable },
  { name: "export only (older)", has: isNativeAvailable },
];

/** One line for the Accounts screen (and for anyone asking which app is on the phone). */
export function buildLabel(): string {
  const level = LEVELS.find((l) => l.has());
  return level ? `App build: ${level.name}` : "Expo Go (no video engine)";
}

/** What a tool says when the installed app is too old for it — with what to do about it. `what` is plural ("Voice and sound effects"). */
export const NEEDS_LATEST_BUILD = (what: string): string => `${what} need the latest Clipy build. Install it from the newest build link.`;

/** Said where Reduce noise or Read aloud is tapped in Expo Go or in a build from before them. */
export const LATEST_TOOLS = NEEDS_LATEST_BUILD("Reduce noise and Read aloud");

/** Said where Find beats (for music of the owner's own) or Remove background is tapped in Expo Go or in a build from before them. */
export const BEATS_BACKGROUND_TOOLS = NEEDS_LATEST_BUILD("Beats in your own music and Remove background");

/** Said where Stabilize or Smooth slow motion is tapped in Expo Go or in a build from before them. */
export const STEADY_TOOLS = NEEDS_LATEST_BUILD("Stabilize and Smooth slow motion");
