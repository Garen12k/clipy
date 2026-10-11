import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useToast } from "@/src/ui/Toast";
import { deleteAccount } from "./supabase";

/**
 * The Accounts screen's "Delete account" row: `ask` shows the system's question, and its Delete runs `deleteAccount()` (supabase.ts —
 * the server first, then this phone's session) ONCE: a ref, so two presses in the same frame cannot both get through, and the row
 * asks nothing while one runs. It worked → "Account deleted." (the session's listener then draws the signed-out screen); it did
 * not → the plain sentence, and nothing has changed.
 */
export function useDeleteAccount(): { deleting: boolean; ask: () => void } {
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    try { await deleteAccount(); useToast.getState().show("Account deleted."); }
    catch (e) { useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't delete the account. Try again."); }   // deleteAccount always throws a sentence; this is the net
    finally { inFlight.current = false; if (mounted.current) setDeleting(false); }
  }, []);

  const ask = useCallback(() => {
    if (inFlight.current) return;
    Alert.alert("Delete your Clipy account?", "Your sign-in and connected accounts are removed from Clipy's server. This can't be undone. Projects on this phone stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: run },
    ]);
  }, [run]);

  return { deleting, ask };
}
