import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";

export type SessionState = { status: "unconfigured" | "loading" | "signedOut" } | { status: "signedIn"; email: string | null };

/** Follows the Clipy (Supabase) sign-in state. Token refresh is managed app-wide in supabase.ts. */
export function useSession(): SessionState {
  const supabase = getSupabase();
  const [state, setState] = useState<SessionState>({ status: supabase ? "loading" : "unconfigured" });
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let seenEvent = false;
    const toState = (s: { user?: { email?: string | null } } | null): SessionState => (s ? { status: "signedIn", email: s.user?.email ?? null } : { status: "signedOut" });
    supabase.auth.getSession().then(
      ({ data }) => { if (!cancelled && !seenEvent) setState(toState(data.session)); },
      () => { if (!cancelled && !seenEvent) setState({ status: "signedOut" }); },
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      seenEvent = true;
      if (!cancelled) setState(toState(s));
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [supabase]);
  return state;
}
