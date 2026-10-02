import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getSupabase } from "./supabase";

export type SessionState = { status: "unconfigured" | "loading" | "signedOut" } | { status: "signedIn"; email: string | null };

/** Follows the Clipy (Supabase) sign-in state and keeps the token fresh while the app is in the foreground. */
export function useSession(): SessionState {
  const supabase = getSupabase();
  const [state, setState] = useState<SessionState>({ status: supabase ? "loading" : "unconfigured" });
  useEffect(() => {
    if (!supabase) return;
    const toState = (s: { user?: { email?: string | null } } | null): SessionState => (s ? { status: "signedIn", email: s.user?.email ?? null } : { status: "signedOut" });
    supabase.auth.getSession().then(({ data }) => setState(toState(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setState(toState(s)));
    supabase.auth.startAutoRefresh();
    const app = AppState.addEventListener("change", (v) => (v === "active" ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
    return () => { sub.subscription.unsubscribe(); app.remove(); supabase.auth.stopAutoRefresh(); };
  }, [supabase]);
  return state;
}
