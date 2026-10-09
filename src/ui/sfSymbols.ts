import { requireOptionalNativeModule } from "expo-modules-core";
import type { SymbolViewProps } from "expo-symbols";
import type { ComponentType } from "react";

/** An SF Symbol's name, as `expo-symbols` types it (the list of `sf-symbols-typescript`): a name that is not a real symbol does not compile. */
export type SymbolName = Extract<SymbolViewProps["name"], string>;

/**
 * The app's Ionicons names that have an SF Symbol. Every symbol here is in `sf-symbols-typescript` 2.2.0 (the names `expo-symbols`
 * accepts) under SF Symbols 1.0 or 2.0 — iOS 13 / 14, long before this app's oldest iOS (16.4). A later stage grows this table;
 * a name that is not in it is drawn as the Ionicon, exactly as today.
 */
export const SF_SYMBOLS: Readonly<Record<string, SymbolName>> = {
  "chevron-back-outline": "chevron.backward",
  "close-outline": "xmark",
  "checkmark-outline": "checkmark",
  "checkmark": "checkmark",
  "add-outline": "plus",
  "add": "plus",
  "ellipsis-horizontal-outline": "ellipsis",
  "share-outline": "square.and.arrow.up",
  "arrow-undo-outline": "arrow.uturn.backward",
  "arrow-redo-outline": "arrow.uturn.forward",
  "play": "play.fill",
  "pause": "pause.fill",
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
