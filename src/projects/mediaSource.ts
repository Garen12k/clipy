import { useCallback, useEffect, useRef } from "react";
import { ActionSheetIOS } from "react-native";
import { openSettings, readPermission } from "@/src/auth/permissions";
import { useToast } from "@/src/ui/Toast";
import { canUseCamera, takeMedia } from "./camera";
import { AFTER_SHEET_MS } from "./ProjectActionsSheet";
import type { PickedAsset } from "./storage";

/** Where new media comes from: the photo library (`pickMedia`) or the system camera (`takeOne`). */
export type MediaSource = "library" | "camera";

/** The menu's items, in order (Apple's own wording). Cancel is last. */
export const SOURCE_MENU = ["Choose from Library", "Take Photo or Video", "Cancel"];
/** Said when the camera was refused before and only Settings can change it — the Photos sentence of `pickMedia`, for the camera. */
export const CAMERA_REFUSED = "Clipy needs Camera access to take photos and videos. Open Settings to allow it.";
export const CAMERA_FAILED = "Couldn't open the camera.";

/**
 * Whether New Project and the editor's "+" show the menu at all. In an installed app that cannot open the camera (an older build:
 * iOS would END the app) there is NO menu — the button goes straight to the library, exactly as it always did.
 */
export function sourceMenuShown(): boolean {
  return canUseCamera();
}

/** The menu that is up, or its answer waiting out the close: `done` is called exactly once. */
type Wait = { timer: ReturnType<typeof setTimeout> | null; done: (source: MediaSource | null) => void };

/**
 * The two-item menu — the system's action sheet, as the editor's project menu is. `ask()` answers with the choice only
 * `AFTER_SHEET_MS` after the menu answered (iOS drops a picker or a camera presented while the menu is still closing), and with null
 * for Cancel. One menu and one wait at a time: a second `ask()` meanwhile answers null and opens nothing. `forget()` — also run
 * when the part that asked goes away — ends a wait at once with null, so nothing is presented later and no caller waits for ever.
 */
export function useMediaSource(): { ask: () => Promise<MediaSource | null>; forget: () => void } {
  const waiting = useRef<Wait | null>(null);
  const end = useCallback((answer: MediaSource | null) => {
    const w = waiting.current;
    if (!w) return;
    waiting.current = null;
    if (w.timer !== null) clearTimeout(w.timer);
    w.done(answer);
  }, []);
  const forget = useCallback(() => end(null), [end]);
  useEffect(() => forget, [forget]);
  const ask = useCallback(() => {
    if (waiting.current) return Promise.resolve(null);
    return new Promise<MediaSource | null>((done) => {
      const w: Wait = { timer: null, done };
      waiting.current = w;
      ActionSheetIOS.showActionSheetWithOptions({ options: SOURCE_MENU, cancelButtonIndex: SOURCE_MENU.length - 1 }, (index) => {
        if (waiting.current !== w || w.timer !== null) return;   // forgotten meanwhile, or answered already
        if (index !== 0 && index !== 1) { end(null); return; }
        w.timer = setTimeout(() => { w.timer = null; end(index === 0 ? "library" : "camera"); }, AFTER_SHEET_MS);
      });
    });
  }, [end]);
  return { ask, forget };
}

/**
 * "Take Photo or Video": the system camera for ONE photo or video, answered in `pickMedia`'s shape (a list of one) so it continues
 * into the same flow; null when nothing was taken. A refusal is said as the Photos one is — the sentence, and Settings opened —
 * but only when the camera had been refused BEFORE this tap: someone who has just answered Apple's alert is told nothing more
 * (iOS reports "cannot ask again" from the first refusal on, so the state is read before the question). Closing the camera says
 * nothing; a camera that cannot open says so.
 */
export async function takeOne(): Promise<PickedAsset[] | null> {
  const before = await readPermission("camera");
  const taken = await takeMedia();
  if (taken.status === "taken") return [taken.asset];
  if (taken.status === "denied" && !taken.canAskAgain && before !== "notAsked") {
    useToast.getState().show(CAMERA_REFUSED);
    openSettings();
  } else if (taken.status === "unavailable") useToast.getState().show(CAMERA_FAILED, { kind: "problem" });
  return null;
}
