import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";

/**
 * Open Instagram, the Export screen's way to Instagram (posting to it needs a Facebook account; its rows are hidden). The ONLY file
 * that names Instagram's URL scheme. Best effort: `instagram://library?LocalIdentifier=` is Instagram's long-standing way to open on a
 * Photos asset and is not documented by Meta — refused, Instagram itself is opened; refused too, the caller says one sentence.
 *
 * Whether Instagram is there is asked with `canOpenURL`, which iOS answers only for a scheme the INSTALLED app lists in
 * `LSApplicationQueriesSchemes` (app.json — build-time): on a build without it (and in Expo Go) React Native rejects, read as "not
 * installed", so no button is shown that could not work.
 */
const SCHEME = "instagram://";
const APP_URL = "instagram://app";

/** The one sentence when Instagram could not be opened at all. */
export const INSTAGRAM_FAILED = "Instagram could not be opened.";

export function instagramLibraryUrl(localIdentifier: string): string {
  return `instagram://library?LocalIdentifier=${encodeURIComponent(localIdentifier)}`;
}

export async function instagramInstalled(): Promise<boolean> {
  try { return (await Linking.canOpenURL(SCHEME)) === true; } catch { return false; }
}

/** Opens Instagram on the saved video (or, failing that or with no identifier, Instagram itself). False = nothing could be opened. */
export async function openInInstagram(localIdentifier: string | null): Promise<boolean> {
  if (localIdentifier) {
    try { await Linking.openURL(instagramLibraryUrl(localIdentifier)); return true; } catch { /* the fallback below */ }
  }
  try { await Linking.openURL(APP_URL); return true; } catch { return false; }
}

/** Whether Instagram is installed, read when `on` becomes true (the finished state) and again whenever the app comes back to the front — never per render. */
export function useInstagramInstalled(on: boolean): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (!on) { setInstalled(false); return; }
    let live = true;
    const read = () => { instagramInstalled().then((yes) => { if (live) setInstalled(yes); }, () => {}); };
    read();
    const sub = AppState.addEventListener("change", (now) => { if (now === "active") read(); });
    return () => { live = false; sub.remove(); };
  }, [on]);
  return on && installed;
}
