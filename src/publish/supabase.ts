import "expo-sqlite/localStorage/install";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isRunningInExpoGo } from "expo";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
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

/** What every sign-in function says when the app has no backend settings (the welcome screen shows it as it is). */
export const SIGN_IN_NOT_SET_UP = "Sign-in isn't set up yet.";
const WRONG_CODE = "That code didn't work. Check it or send a new one.";
const TOO_MANY = "Too many tries. Wait a minute, then try again.";
const NO_CONNECTION = "Couldn't reach Clipy. Check your connection.";
const FAILED = "Couldn't sign in.";

/** A Supabase auth error (returned or thrown) as one plain sentence. The server's own wording is never shown. */
function plain(e: unknown): Error {
  const { name, message, status, code } = (e ?? {}) as { name?: string; message?: string; status?: number; code?: string };
  const text = typeof message === "string" ? message : "";
  if (code === "otp_expired" || code === "invalid_credentials" || /expired or is invalid|invalid.*(otp|token|code)/i.test(text)) return new Error(WRONG_CODE);
  if (status === 429 || (typeof code === "string" && /rate_limit/.test(code)) || /rate limit|security purposes/i.test(text)) return new Error(TOO_MANY);
  if (name === "AuthRetryableFetchError" || status === 0 || /network request failed|failed to fetch|network error/i.test(text)) return new Error(NO_CONNECTION);
  return new Error(FAILED);
}
/** Runs one auth request: a returned `error` and a thrown one both end as a plain sentence. */
async function ask<T extends { error: unknown }>(request: () => Promise<T>): Promise<T> {
  let result: T;
  try { result = await request(); } catch (e) { throw plain(e); }
  if (result.error) throw plain(result.error);
  return result;
}
function configured(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new Error(SIGN_IN_NOT_SET_UP);
  return supabase;
}

/** Emails a 6-digit code (the Email provider's template must show `{{ .Token }}`). A new address becomes a new user. */
export async function sendEmailCode(email: string): Promise<void> {
  const supabase = configured();
  await ask(() => supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } }));
}
/** Signs in with the code from that email. */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const supabase = configured();
  await ask(() => supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" }));
}

/**
 * Where Google sign-in comes back to: the welcome screen's own address (`clipy://welcome` in a build, `exp://<host>:<port>/--/welcome`
 * in Expo Go). Not `oauth` — that return address belongs to the platform accounts (useAccounts) and its screen redirects to Accounts.
 * The auth session normally swallows the link; if iOS ever opens it as a plain deep link, it lands on the sign-in page.
 */
export const googleRedirectUrl = () => Linking.createURL("welcome");

/** The parameters of a return address: its query and its fragment (Supabase puts the tokens after the `#`). */
function returnParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hash = url.indexOf("#"), query = url.indexOf("?");
  const parts = [hash >= 0 ? url.slice(hash + 1) : "", query >= 0 ? url.slice(query + 1, hash > query ? hash : undefined) : ""];
  for (const part of parts) for (const pair of part.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    try { out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " ")); } catch { /* a broken escape: skip the pair */ }
  }
  return out;
}

/**
 * Google, through Supabase, in the system browser (Supabase's documented flow for Expo). The client keeps its default flow (implicit),
 * so the return address carries `#access_token=…&refresh_token=…` and the session is made with `setSession`; a `?code=` (a client
 * switched to PKCE) is exchanged instead, so neither setting breaks this.
 */
export async function signInWithGoogle(): Promise<"ok" | "cancelled"> {
  const supabase = configured();
  const redirectTo = googleRedirectUrl();
  const { data } = await ask(() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } }));
  if (!data.url) throw new Error(FAILED);
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try { result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo); } catch { throw new Error(FAILED); }
  if (result.type !== "success") return "cancelled";
  const p = returnParams(result.url);
  if (p.error === "access_denied") return "cancelled"; // "Cancel" on Google's own page
  if (p.access_token && p.refresh_token) await ask(() => supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token }));
  else if (p.code && !p.error) await ask(() => supabase.auth.exchangeCodeForSession(p.code));
  else throw new Error(FAILED);
  return "ok";
}

export async function signInWithApple(): Promise<"ok" | "cancelled"> {
  const supabase = configured();
  // In Expo Go, Apple issues the token for Expo Go's bundle id and Supabase would refuse it: say so before opening the sheet.
  if (isRunningInExpoGo()) throw new Error("Apple sign-in works in the installed app, not in Expo Go.");
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
