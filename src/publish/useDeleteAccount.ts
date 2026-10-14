import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { appleIdentity, confirmWithApple, deleteAccount } from "./supabase";

/** The second alert, for an Apple user whose Apple sheet did not confirm (closed, failed, unavailable, another Apple ID). */
export const NO_APPLE_TITLE = "Delete without Apple's confirmation?";
export const NO_APPLE_MESSAGE = "Your Clipy account can still be deleted. Apple will keep listing Clipy under Sign in with Apple until you remove it in Settings, under your name.";

/** How long Apple's sheet may stay unanswered (iOS may decline to present it and never answer) before it counts as not confirmed. */
export const APPLE_SHEET_DEADLINE_MS = 120_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Apple's answer, or null when it fails or does not come within the deadline (a late code is dropped). */
async function appleAnswer(sub: string | null): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), APPLE_SHEET_DEADLINE_MS); });
  try { return await Promise.race([confirmWithApple(sub).catch(() => null), deadline]); }
  finally { clearTimeout(timer); }
}

/**
 * The Accounts screen's "Delete account" row: `ask` shows the system's question, and its Delete runs the deletion ONCE: a ref, so
 * two presses in the same frame cannot both get through, and the row asks nothing while one runs. An Apple user (`appleIdentity`)
 * first meets Apple's own sheet — `AFTER_SHEET_MS` after the alert answered, so the alert is gone — whose fresh code goes with the
 * request so the server can revoke the Apple sign-in (Guideline 5.1.1(v)). When Apple does not confirm, a second alert offers
 * Delete Anyway — also when the sheet fails or stays unanswered for `APPLE_SHEET_DEADLINE_MS`, so the ref is never held for ever (Apple's TN3194: the deletion must still be done; the user removes Clipy from Sign in with Apple in Settings).
 * Email and Google users: exactly as before. It worked → "Account deleted." (the session's listener then draws the signed-out
 * screen); it did not → the plain sentence, and nothing has changed.
 */
export function useDeleteAccount(): { deleting: boolean; ask: () => void } {
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /** The request and what is said after it; the caller holds the ref. */
  const remove = useCallback(async (appleCode?: string) => {
    try { await (appleCode ? deleteAccount(appleCode) : deleteAccount()); useToast.getState().show("Account deleted."); }
    catch (e) { useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't delete the account. Try again."); }   // deleteAccount always throws a sentence; this is the net
  }, []);

  /** Runs `work` under the ref, with the spinner; a second call while one runs does nothing. */
  const guarded = useCallback(async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    try { await work(); }
    finally { inFlight.current = false; if (mounted.current) setDeleting(false); }
  }, []);

  const withoutApple = useCallback(() => {
    Alert.alert(NO_APPLE_TITLE, NO_APPLE_MESSAGE, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete Anyway", style: "destructive", onPress: () => { void guarded(() => remove()); } },
    ]);
  }, [guarded, remove]);

  const run = useCallback(async () => {
    let unconfirmed = false;
    await guarded(async () => {
      const apple = await appleIdentity().catch(() => null);
      if (!apple) { await remove(); return; }
      await wait(AFTER_SHEET_MS);
      const code = await appleAnswer(apple.sub);
      if (code) await remove(code);
      else unconfirmed = true;
    });
    if (unconfirmed && mounted.current) withoutApple();
  }, [guarded, remove, withoutApple]);

  const ask = useCallback(() => {
    if (inFlight.current) return;
    Alert.alert("Delete your Clipy account?", "Your sign-in and connected accounts are removed from Clipy's server. This can't be undone. Projects on this phone stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: run },
    ]);
  }, [run]);

  return { deleting, ask };
}
