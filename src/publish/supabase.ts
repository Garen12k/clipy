import "expo-sqlite/localStorage/install";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { AppState } from "react-native";

export const backendUrl = () => process.env.EXPO_PUBLIC_SUPABASE_URL;
export const backendKey = () => process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const isBackendConfigured = () => !!backendUrl() && !!backendKey();

let client: SupabaseClient | null = null;
/** The Supabase client, or null when the app was built without backend settings (posting is then simply unavailable). */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!client) {
    const created = createClient(backendUrl()!, backendKey()!, { auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
    // One app-wide listener: refresh tokens only while the app is in the foreground.
    if (AppState.currentState === "active") created.auth.startAutoRefresh();
    AppState.addEventListener("change", (v) => (v === "active" ? created.auth.startAutoRefresh() : created.auth.stopAutoRefresh()));
    client = created;
  }
  return client;
}

export async function signInWithApple(): Promise<"ok" | "cancelled"> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Posting isn't set up yet.");
  let token: string | null;
  try {
    const c = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
    token = c.identityToken;
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return "cancelled";
    throw e;
  }
  if (!token) throw new Error("Apple didn't return a sign-in token.");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token });
  if (error) throw new Error(error.message);
  return "ok";
}
export async function signOut(): Promise<void> { await getSupabase()?.auth.signOut(); }
