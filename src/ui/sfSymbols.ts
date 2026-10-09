import type { Ionicons } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { SymbolViewProps } from "expo-symbols";
import type { ComponentType } from "react";

/** An SF Symbol's name, as `expo-symbols` types it (the list of `sf-symbols-typescript`): a name that is not a real symbol does not compile. */
export type SymbolName = Extract<SymbolViewProps["name"], string>;
/** An Ionicons name — the app's one vocabulary for icons. */
type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Every icon name the app uses → the SF Symbol that means the same thing. Typed on both sides: a key that is not an Ionicons name,
 * or a value that is not in `sf-symbols-typescript` (the names `expo-symbols` accepts), does not compile — never cast.
 * Every symbol is in SF Symbols 4.0 or older (iOS 16.0; the app's oldest is 16.4): a symbol the phone does not have draws NOTHING,
 * so a newer one is never used (`sfSymbols.map.test.ts` reads the package's own version lists).
 * An "-outline" name is the plain symbol, a filled name the ".fill" one, so a swap that shows a state (Keyframe on a pin) still swaps.
 * One Ionicons name is one symbol wherever it is used: where the design names a symbol for ONE tool of several that share a name
 * (Ratio / Shake, Green screen / Calm, Beats / Bass boost, Forward / Pan up), the symbol is the one that is true for all of them.
 * Brand marks ("logo-…") are not here on purpose: they are not Apple's to draw and stay the Ionicon.
 */
export const SF_SYMBOLS: Readonly<Partial<Record<IoniconName, SymbolName>>> = {
  // Everywhere.
  "chevron-back-outline": "chevron.backward",
  "chevron-down-outline": "chevron.down",
  "chevron-up-outline": "chevron.up",
  "close-outline": "xmark",
  "checkmark-outline": "checkmark",
  "checkmark": "checkmark",
  "add-outline": "plus",
  "ellipsis-horizontal-outline": "ellipsis",
  "share-outline": "square.and.arrow.up",
  "arrow-undo-outline": "arrow.uturn.backward",
  "arrow-redo-outline": "arrow.uturn.forward",
  "play": "play.fill",
  "pause": "pause.fill",
  "stop": "stop.fill",
  "mic": "mic.fill",
  "play-outline": "play",
  "stop-outline": "stop",
  // Messages and states.
  "checkmark-circle-outline": "checkmark.circle",
  "alert-circle-outline": "exclamationmark.circle",
  "information-circle-outline": "info.circle",
  "warning": "exclamationmark.triangle.fill",
  "warning-outline": "exclamationmark.triangle",
  "checkbox-outline": "checkmark.square",
  "square-outline": "square",
  "ban-outline": "nosign",
  "close-circle-outline": "xmark.circle",
  // Home, sign-in, accounts, Quick edit.
  "paper-plane-outline": "paperplane",
  "person-circle-outline": "person.crop.circle",
  "log-out-outline": "rectangle.portrait.and.arrow.right",
  "mail-outline": "envelope",
  "boat-outline": "sailboat",
  "airplane-outline": "airplane",
  "balloon-outline": "balloon",
  "radio-outline": "radio",
  "videocam-outline": "video",
  // The main bar.
  "film-outline": "film",
  "musical-notes-outline": "music.note",
  "text-outline": "textformat",
  "happy-outline": "face.smiling",
  "layers-outline": "square.on.square",
  "grid-outline": "rectangle.split.2x2",
  "flash-outline": "bolt",
  "color-filter-outline": "camera.filters",
  "options-outline": "slider.horizontal.3",
  "phone-portrait-outline": "iphone",
  "color-palette-outline": "paintpalette",
  "image-outline": "photo",
  "color-wand-outline": "wand.and.stars",
  // A clip or a layer.
  "cut-outline": "scissors",
  "code-outline": "timeline.selection",
  "speedometer-outline": "speedometer",
  "volume-high-outline": "speaker.wave.2",
  "sparkles-outline": "sparkles",
  "move-outline": "arrow.up.and.down.and.arrow.left.and.right",
  "crop-outline": "crop",
  "resize-outline": "crop.rotate",
  "contrast-outline": "circle.lefthalf.filled",
  "ellipse-outline": "circle.dashed",
  "color-fill-outline": "square.2.layers.3d",
  "leaf-outline": "leaf",
  "body-outline": "person.and.background.dotted",
  "hand-left-outline": "camera.viewfinder",
  "diamond-outline": "diamond",
  "diamond": "diamond.fill",
  "swap-horizontal-outline": "arrow.left.arrow.right",
  "swap-vertical-outline": "arrow.up.arrow.down",
  "arrow-up-outline": "arrow.up",
  "arrow-down-outline": "arrow.down",
  "arrow-back-outline": "arrow.left",
  "arrow-forward-outline": "arrow.right",
  "arrow-back-circle-outline": "arrow.left.circle",
  "arrow-forward-circle-outline": "arrow.right.circle",
  "sync-outline": "arrow.triangle.2.circlepath",
  "refresh-outline": "rotate.right",
  "play-back-outline": "backward",
  "snow-outline": "snowflake",
  "copy-outline": "plus.square.on.square",
  "trash-outline": "trash",
  "checkmark-done-outline": "checkmark.circle",
  "albums-outline": "checklist",
  "expand-outline": "arrow.up.left.and.arrow.down.right",
  "contract-outline": "arrow.down.right.and.arrow.up.left",
  "scan-outline": "viewfinder",
  "reorder-two-outline": "line.3.horizontal",
  // The groups of a long bar.
  "apps-outline": "square.grid.2x2",
  "construct-outline": "wrench.and.screwdriver",
  "brush-outline": "paintbrush",
  // Text, captions, stickers.
  "create-outline": "square.and.pencil",
  "add-circle-outline": "plus.circle",
  "remove-circle-outline": "minus.circle",
  "chatbox-ellipses-outline": "captions.bubble",
  // Sound.
  "volume-medium-outline": "speaker.wave.2",
  "volume-low-outline": "speaker.wave.1",
  "pulse-outline": "waveform.path.ecg",
  "trending-up-outline": "chart.line.uptrend.xyaxis",
  "git-branch-outline": "waveform.badge.plus",
  "mic-outline": "mic",
  "stats-chart-outline": "waveform",
  "paw-outline": "pawprint",
  "hardware-chip-outline": "cpu",
  "repeat-outline": "repeat",
  "business-outline": "building.2",
  "call-outline": "phone",
  "chatbubble-outline": "bubble.left",
  "flame-outline": "flame",
  "sunny-outline": "sun.max",
  // Effects and looping animations.
  "git-compare-outline": "waveform.path",
  "water-outline": "drop",
  "bulb-outline": "lightbulb",
  "aperture-outline": "camera.aperture",
  "fitness-outline": "waveform.path.ecg.rectangle",
  "flashlight-outline": "light.beacon.max",
  "heart-outline": "heart",
  "cloud-outline": "cloud",
  "eye-outline": "eye",
};

type SymbolViewType = ComponentType<SymbolViewProps>;
let found: SymbolViewType | null | undefined;   // undefined = not asked yet

/**
 * The SF Symbol view, or null when the installed app has none (a build from before "icons and light"). This file is the ONLY place
 * that loads `expo-symbols`, and it loads it lazily and only when its native module is there: on iOS the package looks its native
 * view up the moment it is imported, which an app without it must never be made to do. Never throws; asked once.
 */
export function symbolView(): SymbolViewType | null {
  if (found !== undefined) return found;
  found = null;
  try {
    if (requireOptionalNativeModule("SymbolModule")) {
      const loaded = require("expo-symbols") as { SymbolView?: SymbolViewType };
      if (loaded.SymbolView) found = loaded.SymbolView;
    }
  } catch {
    found = null;
  }
  return found;
}

/** Whether SF Symbols can be drawn by the installed app. */
export function isSymbolsAvailable(): boolean {
  return symbolView() !== null;
}
