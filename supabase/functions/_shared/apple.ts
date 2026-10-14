// Sign in with Apple, server side: revoke what a deleted account's Apple sign-in granted (App Store Review Guideline 5.1.1(v)).
// Clipy keeps no Apple token (the phone signs in with the ID token alone), so the phone asks Apple for a fresh authorization
// code at deletion; here it is exchanged (`/auth/token`) and the result revoked (`/auth/revoke`) — Apple's REST API, as in its
// "Token validation", "Token revocation" and "Creating a client secret" pages and TN3194. Plain TS, web-standard APIs only.
import { plainCode } from "./errors.ts";
import { FORM, formBody } from "./platforms/http.ts";
import type { Deps, Env } from "./types.ts";

/** The developer team that owns the Sign in with Apple key (the client secret's `iss`). */
export const APPLE_TEAM_ID = "H7WG867R7K";
/** The App ID the native sheet's code is issued for: Clipy's bundle id (`client_id`, and the secret's `sub`). */
export const APPLE_CLIENT_ID = "com.astinos.clipy";
/** The client secret is made per request and never stored, so it lives five minutes (Apple allows up to six months). */
export const APPLE_SECRET_SECONDS = 300;
const APPLE = "https://appleid.apple.com";

/** THE SWITCH: on only when both secrets are set — `APPLE_REVOKE_KEY` (the .p8's text) and `APPLE_KEY_ID`. Off = Apple is never asked. */
export const appleRevokeOn = (env: Env): boolean => !!env.get("APPLE_REVOKE_KEY")?.trim() && !!env.get("APPLE_KEY_ID")?.trim();

/**
 * The PKCS#8 bytes of a .p8: every `-----…-----` marker, literal `\n` and white space removed, then base64. So the secret may hold
 * the file as it is OR squeezed onto one line (the README's clipboard command does that: `npx.cmd` cannot pass a line break).
 */
export function pemBody(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-----[^-]*-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

/**
 * The `client_secret`: a JWT, header `{ alg: ES256, kid }`, claims `{ iss: team, iat, exp, aud: https://appleid.apple.com, sub: client_id }`,
 * signed with ECDSA P-256 / SHA-256. WebCrypto's ECDSA signature is the raw r ‖ s (64 bytes) — exactly JWS's ES256 form, no DER.
 */
export async function appleClientSecret(p8: string, keyId: string, now: Date): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemBody(p8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const iat = Math.floor(now.getTime() / 1000);
  const signing = `${b64urlJson({ alg: "ES256", kid: keyId })}.${b64urlJson({ iss: APPLE_TEAM_ID, iat, exp: iat + APPLE_SECRET_SECONDS, aud: APPLE, sub: APPLE_CLIENT_ID })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signing)));
  return `${signing}.${b64url(sig)}`;
}

/** Apple's `error` (one plain word) for the log, or nothing. */
const errorCode = async (res: Response): Promise<string> => {
  const b = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof b?.error === "string" ? plainCode(b.error) : "";
};

export type AppleRevoke = "off" | "revoked" | "failed";

/**
 * Exchange the phone's authorization code (single use, five minutes) and revoke what it gives — the refresh token, or the access
 * token when that is all there is. Best effort: it NEVER throws, and the caller never waits on its answer to delete. The log has
 * the step, Apple's status and error code only — never the code, the secret, a token or the key.
 */
export async function revokeApple(deps: Pick<Deps, "env" | "fetch" | "now">, code: string): Promise<AppleRevoke> {
  if (!appleRevokeOn(deps.env)) return "off";
  try {
    const secret = await appleClientSecret(deps.env.get("APPLE_REVOKE_KEY")!, deps.env.get("APPLE_KEY_ID")!.trim(), deps.now());
    const exchanged = await deps.fetch(`${APPLE}/auth/token`, { method: "POST", headers: FORM, body: formBody({ client_id: APPLE_CLIENT_ID, client_secret: secret, code, grant_type: "authorization_code" }) });
    if (!exchanged.ok) { console.error("apple revoke: code not exchanged", exchanged.status, await errorCode(exchanged)); return "failed"; }
    const t = (await exchanged.json().catch(() => null)) as { refresh_token?: unknown; access_token?: unknown } | null;
    const refresh = typeof t?.refresh_token === "string" && t.refresh_token ? t.refresh_token : null;
    const access = typeof t?.access_token === "string" && t.access_token ? t.access_token : null;
    const token = refresh ?? access;
    if (!token) { console.error("apple revoke: no token in Apple's answer"); return "failed"; }
    const revoked = await deps.fetch(`${APPLE}/auth/revoke`, { method: "POST", headers: FORM, body: formBody({ client_id: APPLE_CLIENT_ID, client_secret: secret, token, token_type_hint: refresh ? "refresh_token" : "access_token" }) });
    if (!revoked.ok) { console.error("apple revoke: refused", revoked.status, await errorCode(revoked)); return "failed"; }
    console.log("apple revoke: done");
    return "revoked";
  } catch (e) {
    console.error("apple revoke: failed", e instanceof Error ? plainCode(e.name) : "");
    return "failed";
  }
}
