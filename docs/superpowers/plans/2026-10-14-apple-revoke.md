# Revoke Sign in with Apple on account deletion: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person who signs in with Apple deletes their Clipy account, the phone asks Apple once more for a fresh
authorization code, sends it with the delete request, and the server exchanges it at `https://appleid.apple.com/auth/token` and
revokes the result at `https://appleid.apple.com/auth/revoke` — best effort, inside the existing budget, before the auth user is
deleted, and only while a server switch (two secrets) is on. If Apple does not confirm, a second alert offers **Delete Anyway**.
Email and Google users, old app builds and old servers are unchanged byte for byte.

**Architecture:** Server: one new pure file `supabase/functions/_shared/apple.ts` (client secret as an ES256 JWT by WebCrypto,
the switch, `revokeApple`), called from `handlers/deleteAccount.ts` beside the platforms' disconnects; `delete-account/index.ts`
hands it `appleCodeOf(body)`. Phone: `appleIdentity()` / `confirmWithApple()` in `src/publish/supabase.ts` (the only file that
names `expo-apple-authentication`'s calls), `deleteAccount(appleCode?)` → `api.deleteAccount({ appleCode }?)`, and the flow and
its words in `src/publish/useDeleteAccount.ts`.

**Tech Stack:** Expo SDK 57, React Native, TypeScript strict, Jest 29 (`jest-expo`) + RNTL 14 for the app; Node Jest
(`jest.server.config.js`) with the global WebCrypto for the server. No new package, no `app.json` change, no native code, no build.

**Spec:** `docs/superpowers/specs/2026-10-14-apple-revoke-design.md` (binding: §2 who, §3 the flow and words, §4 the request,
§5 the server, §6 old/new, §7 setup, §8 tests).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; the "Signing in" and "Posting" lines bind (server: web-standard APIs, `.ts` import
  extensions, NO `Deno.*` outside `runtime.ts` / `index.ts` — the secrets are read only through `deps.env`).
- **Not edited:** `runtime.ts`, `supabaseDb.ts`, `types.ts`, `signInWithApple` (its scopes and behaviour), `app/accounts.tsx`,
  `WelcomeScreen.tsx`, any PROOF file, `app.json`, `package.json`.
- **Existing tests are not changed**, except: `src/publish/__tests__/AccountsScreen.test.tsx` — ONLY its `jest.mock("../supabase", …)`
  factory gains `appleIdentity: jest.fn(async () => null), confirmWithApple: jest.fn(async () => null)` (Task 2). New tests are
  APPENDED to `supabase/functions/_shared/__tests__/deleteAccount.test.ts`, `src/publish/__tests__/deleteAccount.test.ts`,
  `src/publish/__tests__/api.test.ts`; `fakes.ts` gains one helper.
- Nothing logs or shows the Apple code, the client secret, an Apple token or the key. Server logs use `plainCode`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test`. Baseline on this branch (2026-10-14, 7759e8b):
  typecheck clean; app **437 suites / 6555 tests**, all pass; server **21 suites / 591 tests**, all pass. After Task 1: server 22
  suites; after Task 2: app 439 suites. No failure at the end of any task.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only. Commit trailer exactly
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 ∥ 2) → 3 → 4`

| Task | Title | Depends on | Files it owns |
|---|---|---|---|
| 1 | Server: client secret, exchange, revoke, behind the switch | — | `supabase/functions/_shared/apple.ts`, `handlers/deleteAccount.ts`, `delete-account/index.ts`, `__tests__/apple.test.ts`, `__tests__/deleteAccount.test.ts`, `__tests__/fakes.ts` |
| 2 | Phone: Apple's second sheet, the request field, the words | — | `src/publish/{api,supabase,useDeleteAccount}.ts`, `src/publish/__tests__/{api,deleteAccount,supabaseApple,AccountsScreen}.test.*`, `deleteAccount.apple.test.tsx` |
| 3 | Independent review + fixes | 1, 2 | fixes only |
| 4 | Docs: AGENTS.md, README §14, phone checklist | 3 | `AGENTS.md`, `supabase/README.md`, `docs/next-build-phone-checklist.md` |

Tasks 1 and 2 touch disjoint files and may run in parallel.

---

## Task 1 — Server: client secret, exchange, revoke, behind the switch

**Files:**
- Create: `supabase/functions/_shared/apple.ts`
- Create: `supabase/functions/_shared/__tests__/apple.test.ts`
- Modify: `supabase/functions/_shared/handlers/deleteAccount.ts`
- Modify: `supabase/functions/delete-account/index.ts`
- Modify: `supabase/functions/_shared/__tests__/fakes.ts` (append `appleKey`)
- Modify: `supabase/functions/_shared/__tests__/deleteAccount.test.ts` (append a `describe`)

- [ ] **Step 1: The test key helper.** Append to `fakes.ts`:

```ts
/** A Sign in with Apple key made for the test: its `.p8` text (PKCS#8 PEM, 64-character lines, as Apple's file) and its public half. */
export async function appleKey(): Promise<{ pem: string; publicKey: CryptoKey; spki: Buffer }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
    spki: Buffer.from(await crypto.subtle.exportKey("spki", pair.publicKey)),
  };
}
```

- [ ] **Step 2: Write the failing test** `supabase/functions/_shared/__tests__/apple.test.ts`:

```ts
import { createPublicKey, verify } from "crypto";
import { appleClientSecret, appleRevokeOn, pemBody, revokeApple } from "../apple.ts";
import type { Deps } from "../types.ts";
import { appleKey, fakeDeps } from "./fakes.ts";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const IAT = NOW.getTime() / 1000;
const CODE = "c0de1234.0.abcd.EfGh-ij_k";
const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const envOf = (pairs: [string, string][]) => { const m = new Map(pairs); return { get: (n: string) => m.get(n) }; };

let errors: jest.SpyInstance, logs: jest.SpyInstance;
beforeEach(() => { errors = jest.spyOn(console, "error").mockImplementation(() => {}); logs = jest.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { errors.mockRestore(); logs.mockRestore(); });
const said = () => JSON.stringify([...errors.mock.calls, ...logs.mock.calls]);

async function on(): Promise<{ deps: Deps; fetch: jest.Mock; pem: string }> {
  const { pem } = await appleKey();
  const fetch = jest.fn();
  return { deps: fakeDeps({ env: envOf([["APPLE_REVOKE_KEY", pem], ["APPLE_KEY_ID", "ABC123DEFG"]]), fetch: fetch as unknown as typeof globalThis.fetch }), fetch, pem };
}
const form = (init: { body: string }) => new URLSearchParams(init.body);

describe("the client secret", () => {
  test("an ES256 JWT as Apple describes it: header, claims, base64url, and a 64-byte r‖s signature that verifies", async () => {
    const k = await appleKey();
    const jwt = await appleClientSecret(k.pem, "ABC123DEFG", NOW);
    expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [h, p, s] = jwt.split(".");
    expect(part(h)).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(part(p)).toEqual({ iss: "H7WG867R7K", iat: IAT, exp: IAT + 300, aud: "https://appleid.apple.com", sub: "com.astinos.clipy" });
    const sig = Buffer.from(s, "base64url");
    expect(sig).toHaveLength(64);
    const data = Buffer.from(`${h}.${p}`);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.publicKey, sig, data)).toBe(true);
    // Node's own verifier, told the JWS form (RFC 7518 §3.4: R ‖ S, 32 bytes each), not DER: WebCrypto's output IS the JWS signature.
    expect(verify("sha256", data, { key: createPublicKey({ key: k.spki, format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });

  test("the key is read as Apple's file, with CRLF, squeezed onto one line, or with literal \\n", async () => {
    const { pem } = await appleKey();
    const want = pemBody(pem);
    expect(want.length).toBeGreaterThan(100);
    expect(pemBody(pem.replace(/\n/g, "\r\n"))).toEqual(want);
    expect(pemBody(pem.replace(/\s/g, ""))).toEqual(want);           // the README's clipboard command
    expect(pemBody(pem.replace(/\n/g, "\\n"))).toEqual(want);
    await expect(appleClientSecret(pem.replace(/\s/g, ""), "ABC123DEFG", NOW)).resolves.toMatch(/^eyJ/);
  });
});

describe("the switch", () => {
  test("on only with BOTH secrets, neither empty", () => {
    expect(appleRevokeOn(envOf([]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", "k"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", " "], ["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", "k"], ["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(true);
  });

  test("off: Apple is never asked", async () => {
    const fetch = jest.fn();
    expect(await revokeApple(fakeDeps({ fetch: fetch as unknown as typeof globalThis.fetch }), CODE)).toBe("off");
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("exchange, then revoke", () => {
  test("two form posts, exactly: the code for tokens, then the refresh token revoked", async () => {
    const { deps, fetch } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", token_type: "Bearer", expires_in: 3600, refresh_token: "apple-refresh", id_token: "a.b.c" }))
      .mockResolvedValueOnce(answer(200));
    expect(await revokeApple(deps, CODE)).toBe("revoked");
    expect(fetch).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetch.mock.calls[0];
    expect(tokenUrl).toBe("https://appleid.apple.com/auth/token");
    expect(tokenInit.method).toBe("POST");
    expect(tokenInit.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const secret = form(tokenInit).get("client_secret")!;
    expect(part(secret.split(".")[1]).sub).toBe("com.astinos.clipy");
    expect(tokenInit.body).toBe(`client_id=com.astinos.clipy&client_secret=${secret}&code=${CODE}&grant_type=authorization_code`);

    const [revokeUrl, revokeInit] = fetch.mock.calls[1];
    expect(revokeUrl).toBe("https://appleid.apple.com/auth/revoke");
    expect(revokeInit.method).toBe("POST");
    expect(revokeInit.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(revokeInit.body).toBe(`client_id=com.astinos.clipy&client_secret=${secret}&token=apple-refresh&token_type_hint=refresh_token`);
    expect(logs).toHaveBeenCalledWith("apple revoke: done");
  });

  test("only an access token came back: that is revoked, with its hint", async () => {
    const { deps, fetch } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", token_type: "Bearer", expires_in: 3600 })).mockResolvedValueOnce(answer(200));
    expect(await revokeApple(deps, CODE)).toBe("revoked");
    expect(form(fetch.mock.calls[1][1]).get("token")).toBe("apple-access");
    expect(form(fetch.mock.calls[1][1]).get("token_type_hint")).toBe("access_token");
  });

  const failures: [string, (f: jest.Mock) => void, number, string][] = [
    ["the code is refused (spent or older than five minutes)", (f) => f.mockResolvedValueOnce(answer(400, { error: "invalid_grant" })), 1, "invalid_grant"],
    ["the client is refused (wrong key, key id or App ID)", (f) => f.mockResolvedValueOnce(answer(400, { error: "invalid_client" })), 1, "invalid_client"],
    ["an answer without a token", (f) => f.mockResolvedValueOnce(answer(200, { token_type: "Bearer" })), 1, "no token"],
    ["an answer that is not JSON", (f) => f.mockResolvedValueOnce(new Response("<html>", { status: 200 })), 1, "no token"],
    ["the revoke is refused", (f) => f.mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request" })), 2, "invalid_request"],
    ["the network fails", (f) => f.mockRejectedValueOnce(new TypeError("fetch failed")), 1, "TypeError"],
  ];
  test.each(failures)("%s: failed, said in the log by status and code only", async (_n, script, calls, word) => {
    const { deps, fetch } = await on();
    script(fetch);
    expect(await revokeApple(deps, CODE)).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(calls);
    expect(said()).toContain(word);
    expect(logs).not.toHaveBeenCalledWith("apple revoke: done");
  });

  test("a key that will not import: failed, and Apple is never asked", async () => {
    const fetch = jest.fn();
    const deps = fakeDeps({ env: envOf([["APPLE_REVOKE_KEY", "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5\n-----END PRIVATE KEY-----"], ["APPLE_KEY_ID", "ABC123DEFG"]]), fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await revokeApple(deps, CODE)).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
    expect(said()).toContain("apple revoke: failed");
  });

  test("nothing of the code, the secret, a token or the key reaches the log — success or failure", async () => {
    const { deps, fetch, pem } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    await revokeApple(deps, CODE);
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request", detail: "apple-refresh" }));
    await revokeApple(deps, CODE);
    const secret = form(fetch.mock.calls[0][1]).get("client_secret")!;
    const text = said();
    for (const s of [CODE, "c0de1234", secret.split(".")[2], "apple-refresh", "apple-access", pem.split("\n")[1].slice(0, 20), "eyJ"]) expect(text).not.toContain(s);
  });
});
```

- [ ] **Step 3: Run it to see it fail.** `npx.cmd jest -c jest.server.config.js supabase/functions/_shared/__tests__/apple.test.ts` — expected: FAIL, `Cannot find module '../apple.ts'`.

- [ ] **Step 4: Write `supabase/functions/_shared/apple.ts`:**

```ts
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
export function pemBody(text: string): Uint8Array {
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
```

- [ ] **Step 5: Run `apple.test.ts`** — expected: PASS. If the "not JSON" case does not say `no token`, the answer was read once already: check `exchanged.json()` is read only on the `ok` path.

- [ ] **Step 6: Append the handler's failing tests** to `supabase/functions/_shared/__tests__/deleteAccount.test.ts`. Change its first and fourth import lines to

```ts
import { appleCodeOf, deleteAccount, DELETE_FAILED, REVOKE_BUDGET_MS } from "../handlers/deleteAccount.ts";
import { appleKey, fakeAdapter, fakeDeps, INPUT, tokens, USER } from "./fakes.ts";
```

(the existing tests stay as they are) and append:

```ts
describe("Sign in with Apple: revoked before the sign-in goes, never blocking it", () => {
  const CODE = "c0de1234.0.abcd.EfGh-ij_k";
  const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  let logs: jest.SpyInstance;
  beforeEach(() => { logs = jest.spyOn(console, "log").mockImplementation(() => {}); });
  afterEach(() => logs.mockRestore());
  /** The world, with the switch on (both secrets). */
  async function appleOn() {
    const { pem } = await appleKey();
    const env = new Map([["YOUTUBE_CLIENT_ID", "cid"], ["YOUTUBE_CLIENT_SECRET", "secret"], ["APPLE_REVOKE_KEY", pem], ["APPLE_KEY_ID", "ABC123DEFG"]]);
    return world({ env: { get: (n: string) => env.get(n) } });
  }
  const fetchOf = (deps: Deps) => deps.fetch as unknown as jest.Mock;

  test("no code: Apple is never asked — the deletion is today's, even with the switch on", async () => {
    const { deps, mine } = await appleOn();
    expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
    expect(fetchOf(deps)).not.toHaveBeenCalled();
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(await deps.db.getSession(mine)).toBeNull();
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
    expect(errors).not.toHaveBeenCalled();
  });

  test("a code with the switch off: Apple is never asked, and everything else is as without a code", async () => {
    const { deps, mine } = await world();
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(fetchOf(deps)).not.toHaveBeenCalled();
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(await deps.db.getSession(mine)).toBeNull();
    expect(deps.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  test("a code with the switch on: exchanged and revoked BEFORE the rows and the sign-in go", async () => {
    const { deps } = await appleOn();
    const log: string[] = [];
    fetchOf(deps).mockImplementation(async (url: string) => {
      log.push(url.endsWith("/auth/token") ? "apple-token" : "apple-revoke");
      return url.endsWith("/auth/token") ? answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" }) : answer(200);
    });
    const wipe = deps.db.deleteUserData.bind(deps.db);
    deps.db.deleteUserData = async (u) => { log.push("rows"); await wipe(u); };
    (deps.deleteAuthUser as jest.Mock).mockImplementation(async () => { log.push("user"); return null; });
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(log).toEqual(["apple-token", "apple-revoke", "rows", "user"]);
    expect(logs).toHaveBeenCalledWith("apple revoke: done");
  });

  test("Apple refuses: the deletion goes on and is ok", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValue(answer(400, { error: "invalid_grant" }));
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("Apple never answers: it shares the platforms' budget, then the deletion goes on", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockImplementation(() => new Promise(() => {}));
    expect(await deleteAccount(deps, USER, 20, CODE)).toEqual({ ok: true });
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("the accounts cannot be listed: Apple is still asked, and the deletion goes on", async () => {
    const { deps } = await appleOn();
    deps.db.listAccounts = async () => { throw new Error("db hiccup"); };
    fetchOf(deps).mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(fetchOf(deps)).toHaveBeenCalledTimes(2);
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("the sign-in could not be deleted after a revoke: still delete_failed, and the retry may carry no code", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    (deps.deleteAuthUser as jest.Mock).mockResolvedValueOnce({ status: 500 });
    await expect(deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).rejects.toMatchObject({ code: "delete_failed", message: DELETE_FAILED });
    expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  });

  test("nothing of the code or Apple's tokens reaches the log", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request" }));
    (deps.deleteAuthUser as jest.Mock).mockResolvedValue({ status: 500, code: "unexpected_failure" });
    await expect(deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).rejects.toMatchObject({ code: "delete_failed" });
    const text = JSON.stringify([...errors.mock.calls, ...logs.mock.calls]);
    for (const s of [CODE, "apple-refresh", "apple-access", "eyJ"]) expect(text).not.toContain(s);
  });

  test("appleCodeOf: the body's appleCode when it is a plain code, else null — nothing else of the body is read", () => {
    expect(appleCodeOf({ appleCode: CODE })).toBe(CODE);
    expect(appleCodeOf({ appleCode: CODE, userId: "someone-else" })).toBe(CODE);
    for (const bad of [null, undefined, "", "c", 7, [], {}, { appleCode: "" }, { appleCode: 7 }, { appleCode: null }, { appleCode: "has space" },
      { appleCode: "line\nbreak" }, { appleCode: "é" }, { appleCode: "x".repeat(2049) }]) expect(appleCodeOf(bad)).toBeNull();
    expect(appleCodeOf({ appleCode: "x".repeat(2048) })).toBe("x".repeat(2048));
  });
});
```

- [ ] **Step 7: Run it to see it fail.** `npx.cmd jest -c jest.server.config.js supabase/functions/_shared/__tests__/deleteAccount.test.ts` — expected: the new tests FAIL (`appleCodeOf is not a function`, Apple never asked); the old ones pass.

- [ ] **Step 8: Change the handler.** In `supabase/functions/_shared/handlers/deleteAccount.ts`, add the import and replace the function's doc comment's opening line, its signature and step 1 (steps 2 and 3 are not touched):

```ts
import { revokeApple } from "../apple.ts";
import { ApiError } from "../errors.ts";
import type { Deps } from "../types.ts";
import { disconnect } from "./accounts.ts";

/** The one sentence for a deletion that did not finish. The phone shows it as it is; asking again is safe. */
export const DELETE_FAILED = "Couldn't delete the account. Try again.";
/** How long ALL the platforms together (and Apple, for an Apple user) get to forget their connections before the deletion goes on without them. */
export const REVOKE_BUDGET_MS = 8000;
/** The longest Apple authorization code accepted from the phone (Apple's are far shorter; this only bounds what is read). */
export const APPLE_CODE_MAX = 2048;

const failed = () => new ApiError(500, "delete_failed", DELETE_FAILED);

/**
 * The Apple authorization code an Apple user's phone sends with the request (`{ "appleCode": "…" }`), or null: a string of 1 to
 * APPLE_CODE_MAX printable ASCII characters without spaces. Nothing else of the body is read — never WHO (that is the token's).
 */
export function appleCodeOf(body: unknown): string | null {
  const v = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as { appleCode?: unknown }).appleCode : undefined;
  return typeof v === "string" && v.length > 0 && v.length <= APPLE_CODE_MAX && /^[\x21-\x7e]+$/.test(v) ? v : null;
}
```

In the doc comment of `deleteAccount`, change the first line to
`Delete my account, for the CALLER ONLY: \`userId\` is the id in the verified token (runtime.ts) — of the body only Apple's code is read (\`appleCodeOf\`).`
and step 1's sentence to end: `… blocks nothing. For an Apple user whose phone sent \`appleCode\`, Apple is asked beside them, first, to revoke what that sign-in granted (\`revokeApple\`, apple.ts — only while its switch is on): best effort too, inside the same budget, and always before step 3.`

Then the signature and step 1:

```ts
export async function deleteAccount(deps: Deps, userId: string, budgetMs = REVOKE_BUDGET_MS, appleCode: string | null = null): Promise<{ ok: true }> {
  if (typeof userId !== "string" || !userId) throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");

  const forget: Promise<unknown>[] = appleCode ? [revokeApple(deps, appleCode)] : [];
  try {
    const rows = await deps.db.listAccounts(userId);
    for (const r of rows) forget.push(disconnect(deps, userId, r.platform));
  } catch { console.error("delete-account: could not ask the platforms to forget"); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(forget),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, budgetMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }

  // steps 2 and 3: unchanged from here on
```

- [ ] **Step 9: Hand the code over in `supabase/functions/delete-account/index.ts`** (replace the file):

```ts
import { ApiError } from "../_shared/errors.ts";
import { appleCodeOf, deleteAccount, REVOKE_BUDGET_MS } from "../_shared/handlers/deleteAccount.ts";
import { serveJson } from "../_shared/runtime.ts";

// The user is the one in the verified token; of the body only Apple's authorization code is read (appleCodeOf).
export default serveJson((deps, user, body, req) => {
  if (req.method !== "POST") throw new ApiError(405, "bad_request", "Use POST.");
  return deleteAccount(deps, user, REVOKE_BUDGET_MS, appleCodeOf(body));
});
```

- [ ] **Step 10: Run the checks.** `npx.cmd jest -c jest.server.config.js` — expected: 22 suites, all pass (591 + the new tests). Then `npm.cmd run typecheck` (clean) and `npm.cmd test` (app 437 suites unchanged, server 22).

- [ ] **Step 11: Commit.**

```powershell
git add supabase/functions/_shared/apple.ts supabase/functions/_shared/__tests__/apple.test.ts supabase/functions/_shared/handlers/deleteAccount.ts supabase/functions/delete-account/index.ts supabase/functions/_shared/__tests__/fakes.ts supabase/functions/_shared/__tests__/deleteAccount.test.ts
git commit -m @'
feat(server): revoke Sign in with Apple on account deletion, behind APPLE_REVOKE_KEY + APPLE_KEY_ID

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

## Task 2 — Phone: Apple's second sheet, the request field, the words

**Files:**
- Modify: `src/publish/api.ts` (`deleteAccount`)
- Modify: `src/publish/supabase.ts` (`appleIdentity`, `confirmWithApple`, `deleteAccount(appleCode?)`)
- Modify: `src/publish/useDeleteAccount.ts`
- Modify (append only): `src/publish/__tests__/api.test.ts`, `src/publish/__tests__/deleteAccount.test.ts`
- Modify (mock factory only): `src/publish/__tests__/AccountsScreen.test.tsx`
- Create: `src/publish/__tests__/supabaseApple.test.ts`, `src/publish/__tests__/deleteAccount.apple.test.tsx`

- [ ] **Step 1: The request — failing tests.** Append to `src/publish/__tests__/api.test.ts`:

```ts
test("deleteAccount with Apple's code: the code is the body's one field; without it the body stays {}", async () => {
  fetchMock.mockResolvedValue(res(200, { ok: true }));
  await expect(api.deleteAccount({ appleCode: "c0de.0.apple" })).resolves.toBeUndefined();
  expect(fetchMock.mock.calls[0][0]).toBe("https://ref.supabase.co/functions/v1/delete-account");
  expect(fetchMock.mock.calls[0][1].body).toBe('{"appleCode":"c0de.0.apple"}');
  await api.deleteAccount();
  expect(fetchMock.mock.calls[1][1].body).toBe("{}");
});
```

Append to `src/publish/__tests__/deleteAccount.test.ts`:

```ts
test("with Apple's code: the ONE request carries it, and the rest is as without", async () => {
  const order: string[] = [];
  mockDelete.mockImplementation(async () => { order.push("server"); });
  mockAuth.signOut.mockImplementation(async () => { order.push("local"); return { error: null }; });
  await expect(configured().deleteAccount("c0de.0.apple")).resolves.toBeUndefined();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith({ appleCode: "c0de.0.apple" });
  expect(order).toEqual(["server", "local"]);
  mockDelete.mockRejectedValueOnce(failure("delete_failed", FAILED));
  await expect(configured().deleteAccount("c0de.0.apple")).rejects.toThrow(FAILED);
});
```

- [ ] **Step 2: Apple's identity and confirmation — failing test** `src/publish/__tests__/supabaseApple.test.ts`:

```ts
const mockAuth = { getSession: jest.fn(), signOut: jest.fn() };
let mockExpoGo = false;
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }));
jest.mock("expo", () => ({ isRunningInExpoGo: () => mockExpoGo }));
import * as Apple from "expo-apple-authentication";

const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
const configured = () => { process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk"; return load(); };
const signIn = Apple.signInAsync as jest.Mock;
const available = Apple.isAvailableAsync as jest.Mock;
const signedIn = (user: unknown) => mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt", user } }, error: null });
const SUB = "001234.abcdef.0987";
let warns: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); mockExpoGo = false;
  available.mockResolvedValue(true);
  signIn.mockReset().mockResolvedValue({ user: SUB, authorizationCode: "c0de.0.apple", identityToken: "id.token.x", state: null, fullName: null, email: null, realUserStatus: 1 });
  mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  warns = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warns.mockRestore(); delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

describe("appleIdentity: who signed in with Apple — read from the session once", () => {
  const cases: [string, unknown, { sub: string | null } | null][] = [
    ["Apple first, with its identity", { app_metadata: { provider: "apple", providers: ["apple"] }, identities: [{ provider: "apple", identity_data: { sub: SUB } }] }, { sub: SUB }],
    ["email first, Apple linked later", { app_metadata: { provider: "email", providers: ["email", "apple"] } }, { sub: null }],
    ["only the identity says so", { app_metadata: {}, identities: [{ provider: "apple", identity_data: {} }] }, { sub: null }],
    ["provider alone", { app_metadata: { provider: "apple" } }, { sub: null }],
    ["email", { app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email", identity_data: { sub: "x" } }] }, null],
    ["Google", { app_metadata: { provider: "google", providers: ["google"] }, identities: [{ provider: "google", identity_data: { sub: "g" } }] }, null],
    ["a user with nothing", {}, null],
  ];
  test.each(cases)("%s", async (_n, user, want) => {
    signedIn(user);
    await expect(configured().appleIdentity()).resolves.toEqual(want);
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
  });

  test("no session, an unreadable one, or no backend: null, and nothing thrown", async () => {
    await expect(configured().appleIdentity()).resolves.toBeNull();
    mockAuth.getSession.mockRejectedValue(new Error("storage"));
    await expect(configured().appleIdentity()).resolves.toBeNull();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    mockAuth.getSession.mockClear();
    await expect(load().appleIdentity()).resolves.toBeNull();
    expect(mockAuth.getSession).not.toHaveBeenCalled();
  });
});

describe("confirmWithApple: Apple's sheet once more, for a fresh authorization code", () => {
  test("asks for nothing (no name, no email) and gives the code", async () => {
    await expect(load().confirmWithApple(SUB)).resolves.toBe("c0de.0.apple");
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({ requestedScopes: [] });
  });

  test("Apple's id unknown to the session: any Apple ID's code is taken", async () => {
    signIn.mockResolvedValue({ user: "someone", authorizationCode: "c0de.0.apple" });
    await expect(load().confirmWithApple(null)).resolves.toBe("c0de.0.apple");
  });

  const unconfirmed: [string, () => void][] = [
    ["the sheet was closed", () => signIn.mockRejectedValue(Object.assign(new Error("The user canceled"), { code: "ERR_REQUEST_CANCELED" }))],
    ["Apple failed", () => signIn.mockRejectedValue(Object.assign(new Error("Sign Up Not Completed"), { code: "ERR_REQUEST_FAILED" }))],
    ["no code came back", () => signIn.mockResolvedValue({ user: SUB, authorizationCode: null })],
    ["ANOTHER Apple ID confirmed", () => signIn.mockResolvedValue({ user: "001999.other.0000", authorizationCode: "c0de.0.other" })],
    ["the phone cannot show the sheet", () => available.mockResolvedValue(false)],
    ["the availability check throws", () => available.mockRejectedValue(new Error("no module"))],
  ];
  test.each(unconfirmed)("%s: null, nothing thrown, no code in the log", async (_n, setUp) => {
    setUp();
    await expect(load().confirmWithApple(SUB)).resolves.toBeNull();
    expect(JSON.stringify(warns.mock.calls)).not.toMatch(/c0de|Sign Up Not Completed/);
  });

  test("Expo Go: the sheet is never shown", async () => {
    mockExpoGo = true;
    await expect(load().confirmWithApple(SUB)).resolves.toBeNull();
    expect(available).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: The screen — failing test** `src/publish/__tests__/deleteAccount.apple.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, Redirect: () => null, useFocusEffect: (cb: () => void) => { require("react").useEffect(() => { cb(); }, []); } }));
jest.mock("../useSession", () => ({ useSession: jest.fn(() => ({ status: "signedIn", email: "me@privaterelay.appleid.com" })) }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn(), deleteAccount: jest.fn(), appleIdentity: jest.fn(), confirmWithApple: jest.fn() }));
import AccountsScreen from "@/app/accounts";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { appleIdentity, confirmWithApple, deleteAccount, signOut } from "../supabase";
import { useAccounts } from "../useAccounts";
import { NO_APPLE_MESSAGE, NO_APPLE_TITLE } from "../useDeleteAccount";

const p = (id: string) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false });
const hook = () => ({ status: "ready", platforms: ["youtube", "tiktok", "instagram", "facebook", "x"].map(p), error: null, busy: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn() });
type Button = { text: string; style?: string; onPress?: () => void };
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SUB = "001234.abcdef.0987";
const CODE = "c0de.0.apple";
let alert: jest.SpyInstance;
const buttonsOf = (call: number) => alert.mock.calls[call][2] as Button[];
const row = () => screen.getByRole("button", { name: "Delete account" });

beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear();
  (useAccounts as jest.Mock).mockReturnValue(hook());
  (deleteAccount as jest.Mock).mockReset().mockResolvedValue(undefined);
  (appleIdentity as jest.Mock).mockReset().mockResolvedValue({ sub: SUB });
  (confirmWithApple as jest.Mock).mockReset().mockResolvedValue(CODE);
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alert.mockRestore());

/** The row, then the first alert's Delete. */
async function pressDelete() {
  await render(<AccountsScreen />);
  await fireEvent.press(row());
  await act(async () => { buttonsOf(0)[1].onPress!(); });
}
const sheetTime = () => act(async () => { await wait(AFTER_SHEET_MS + 50); });

test("the second alert's words, exactly", () => {
  expect(NO_APPLE_TITLE).toBe("Delete without Apple's confirmation?");
  expect(NO_APPLE_MESSAGE).toBe("Your Clipy account can still be deleted. Apple will keep listing Clipy under Sign in with Apple until you remove it in Settings, under your name.");
});

test("an Apple user: the first alert is today's; Apple's sheet only AFTER_SHEET_MS after it; the code goes with the ONE request", async () => {
  await pressDelete();
  expect(alert).toHaveBeenCalledWith("Delete your Clipy account?", "Your sign-in and connected accounts are removed from Clipy's server. This can't be undone. Projects on this phone stay.", expect.any(Array));
  expect(appleIdentity).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).not.toHaveBeenCalled();
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Deleting account")).toBeTruthy();
  await sheetTime();
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).toHaveBeenCalledWith(SUB);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith(CODE);
  expect(useToast.getState().message).toBe("Account deleted.");
  expect(alert).toHaveBeenCalledTimes(1);
  expect(signOut).not.toHaveBeenCalled();
});

test("while Apple is asked, no second tap gets through — neither the row nor the old alert's Delete", async () => {
  await pressDelete();
  await fireEvent.press(row());
  await act(async () => { buttonsOf(0)[1].onPress!(); });
  await sheetTime();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(appleIdentity).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

test("Apple did not confirm: nothing is deleted; the second alert, word for word; its Cancel changes nothing", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  await pressDelete();
  await sheetTime();
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(2);
  expect(alert.mock.calls[1][0]).toBe(NO_APPLE_TITLE);
  expect(alert.mock.calls[1][1]).toBe(NO_APPLE_MESSAGE);
  expect(buttonsOf(1).map((b) => [b.text, b.style])).toEqual([["Cancel", "cancel"], ["Delete Anyway", "destructive"]]);
  expect(screen.queryByLabelText("Deleting account")).toBeNull();
  expect(useToast.getState().message).toBeNull();
  await act(async () => { buttonsOf(1)[0].onPress?.(); });
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
  expect(screen.getByTestId("signed-in-row")).toBeTruthy();
});

test("Delete Anyway: deleted WITHOUT a code, once even when pressed twice, with the spinner; Apple not asked again", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  let finish!: () => void;
  (deleteAccount as jest.Mock).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
  await pressDelete();
  await sheetTime();
  const anyway = buttonsOf(1)[1].onPress!;
  await act(async () => { anyway(); anyway(); });
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith();
  expect(screen.getByLabelText("Deleting account")).toBeTruthy();
  await act(async () => { finish(); });
  expect(useToast.getState().message).toBe("Account deleted.");
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Deleting account")).toBeNull();
});

test("Delete Anyway that fails: today's sentence, and the row can be tapped again", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  (deleteAccount as jest.Mock).mockRejectedValueOnce(new Error("Couldn't delete the account. Try again."));
  await pressDelete();
  await sheetTime();
  await act(async () => { buttonsOf(1)[1].onPress!(); });
  expect(useToast.getState().message).toBe("Couldn't delete the account. Try again.");
  await fireEvent.press(row());
  expect(alert).toHaveBeenCalledTimes(3);
});

test("an email or Google user: no wait, no Apple, deleteAccount() with nothing — as before", async () => {
  (appleIdentity as jest.Mock).mockResolvedValue(null);
  await pressDelete();
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith();
  expect(useToast.getState().message).toBe("Account deleted.");
  await sheetTime();
  expect(confirmWithApple).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run them to see them fail.** `npx.cmd jest src/publish/__tests__/api.test.ts src/publish/__tests__/deleteAccount.test.ts src/publish/__tests__/supabaseApple.test.ts src/publish/__tests__/deleteAccount.apple.test.tsx` — expected: the new tests FAIL (no `appleIdentity`, the body is `{}`, no `NO_APPLE_TITLE`).

- [ ] **Step 5: `src/publish/api.ts`.** Replace the `deleteAccount` entry (keep its doc line, and add one):

```ts
  /** Delete my account. Nothing says WHO: the server takes the user from the session token alone. An Apple user's phone adds
   *  Apple's fresh authorization code, so the server can revoke the Apple sign-in; without one the body stays `{}`. */
  deleteAccount: async (body?: { appleCode: string }) => { await call("delete-account", { json: body?.appleCode ? { appleCode: body.appleCode } : {} }); },
```

- [ ] **Step 6: `src/publish/supabase.ts`.** Insert after `signInWithApple` (before the `signOut` doc comment):

```ts
/** An Apple sign-in on the signed-in account; `sub` is Apple's id for that person when the session names it (used only to check that the same Apple ID confirms a deletion). */
export interface AppleIdentity { sub: string | null }
/**
 * Whether the signed-in account has an Apple sign-in, read from the session ONCE: `app_metadata.providers` (all the providers
 * linked — an account made by email with Apple linked later counts), `app_metadata.provider`, or an `identities` entry. Null for
 * email and Google accounts, with no session, a session that cannot be read, or no backend. Never throws.
 */
export async function appleIdentity(): Promise<AppleIdentity | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  type SessionUser = { app_metadata?: { provider?: unknown; providers?: unknown }; identities?: { provider?: unknown; identity_data?: { sub?: unknown } }[] };
  let user: SessionUser | undefined;
  try { user = (await supabase.auth.getSession()).data.session?.user; } catch { return null; }
  if (!user) return null;
  const meta = user.app_metadata ?? {};
  const providers = Array.isArray(meta.providers) ? meta.providers : [];
  const identity = Array.isArray(user.identities) ? user.identities.find((i) => i?.provider === "apple") : undefined;
  if (!providers.includes("apple") && meta.provider !== "apple" && !identity) return null;
  const sub = identity?.identity_data?.sub;
  return { sub: typeof sub === "string" && sub ? sub : null };
}

/**
 * Apple's sheet once more, at deletion, for a FRESH authorization code (single use, five minutes) — the server exchanges it and
 * revokes the Apple sign-in. Nothing is asked for (no name, no email). Null when Apple does not confirm: the sheet closed, Apple
 * failed, no code, a DIFFERENT Apple ID than the one that signed in (when `sub` is known), the phone cannot show the sheet, or
 * Expo Go. Never throws; the code is never logged.
 */
export async function confirmWithApple(sub: string | null): Promise<string | null> {
  if (isRunningInExpoGo()) return null;
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) return null;
    const c = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!c.authorizationCode) return null;
    if (sub && c.user !== sub) { console.warn("apple confirm: another Apple ID"); return null; }
    return c.authorizationCode;
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code !== "ERR_REQUEST_CANCELED") console.warn("apple confirm: failed", typeof code === "string" ? code : "");
    return null;
  }
}
```

And change `deleteAccount` (its doc comment gains one sentence: `An Apple user's fresh Apple code, when there is one, goes with that one request.`):

```ts
export async function deleteAccount(appleCode?: string): Promise<void> {
  const supabase = configured();
  try { await (appleCode ? api.deleteAccount({ appleCode }) : api.deleteAccount()); }
  catch (e) { throw new Error(e instanceof ApiFailure && SAID.has(e.code) && e.message ? e.message : DELETE_FAILED); }
  // … the rest unchanged
```

- [ ] **Step 7: `src/publish/useDeleteAccount.ts`** (replace the file):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { appleIdentity, confirmWithApple, deleteAccount } from "./supabase";

/** The second alert, for an Apple user whose Apple sheet did not confirm (closed, failed, unavailable, another Apple ID). */
export const NO_APPLE_TITLE = "Delete without Apple's confirmation?";
export const NO_APPLE_MESSAGE = "Your Clipy account can still be deleted. Apple will keep listing Clipy under Sign in with Apple until you remove it in Settings, under your name.";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The Accounts screen's "Delete account" row: `ask` shows the system's question, and its Delete runs the deletion ONCE: a ref, so
 * two presses in the same frame cannot both get through, and the row asks nothing while one runs. An Apple user (`appleIdentity`)
 * first meets Apple's own sheet — `AFTER_SHEET_MS` after the alert answered, so the alert is gone — whose fresh code goes with the
 * request so the server can revoke the Apple sign-in (Guideline 5.1.1(v)). When Apple does not confirm, a second alert offers
 * Delete Anyway (Apple's TN3194: the deletion must still be done; the user removes Clipy from Sign in with Apple in Settings).
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
      const code = await confirmWithApple(apple.sub).catch(() => null);
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
```

Note: `run` called twice in one frame — the second `guarded` returns at once with `unconfirmed` false, so it shows nothing.

- [ ] **Step 8: The existing screen test's mock.** In `src/publish/__tests__/AccountsScreen.test.tsx` change ONLY line 8 to:

```ts
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn(), deleteAccount: jest.fn(), appleIdentity: jest.fn(async () => null), confirmWithApple: jest.fn(async () => null) }));
```

(Under `jest.clearAllMocks()` a factory's implementation stays, so every existing Delete test is an email user: `deleteAccount()` with nothing, no wait.)

- [ ] **Step 9: Run the checks.** `npx.cmd jest src/publish src/__tests__/casing.guard.test.ts` — expected: all pass, including every existing `AccountsScreen.test.tsx` test unchanged. If "Delete: one call …" sees `deleteAccount` not yet called right after its `act`, the cause is the one extra microtask of `await appleIdentity()` (the identity is async, so it cannot be avoided). Do NOT edit that test's assertions; React 19's async `act` drains resolved promises before it returns, so it is expected to pass — if it does not, stop and report it to the reviewer (Task 3) rather than changing the test. Then `npm.cmd run typecheck` (clean) and `npm.cmd test` (app 439 suites, server as after Task 1 or 21 if Task 1 is not merged yet).

- [ ] **Step 10: Commit.**

```powershell
git add src/publish/api.ts src/publish/supabase.ts src/publish/useDeleteAccount.ts src/publish/__tests__/api.test.ts src/publish/__tests__/deleteAccount.test.ts src/publish/__tests__/supabaseApple.test.ts src/publish/__tests__/deleteAccount.apple.test.tsx src/publish/__tests__/AccountsScreen.test.tsx
git commit -m @'
feat(accounts): an Apple user confirms with Apple once more when deleting; Delete Anyway when Apple does not

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

## Task 3 — Independent review + fixes (a reviewer who wrote none of Tasks 1–2)

- [ ] **Step 1:** Review `git diff 7759e8b..HEAD` against the spec and AGENTS.md. Check, and fix with a test first where wrong:
  1. No `Deno.*` in `apple.ts` / `deleteAccount.ts`; `.ts` import extensions; `npx.cmd tsc --noEmit -p supabase` clean.
  2. With no code, and with a code but the switch off, the handler's behaviour, answer and log are identical to 7759e8b
     (read the diff of step 1 line by line: `listAccounts` failure still logs the same sentence; an empty list still races nothing
     that waits).
  3. `revokeApple` cannot throw (every `await` inside the `try`); its log lines carry no code / secret / token / key; `plainCode`
     on `e.name` and Apple's `error`.
  4. The form bodies' key ORDER and exact names against Apple's pages (spec §1); no `redirect_uri`; `token_type_hint` matches the
     token sent.
  5. The JWT: `kid` is trimmed, `iat` an integer, `exp` = `iat + 300`, base64url without padding; the signature is P1363 (64 bytes).
  6. Phone: email / Google users never call `confirmWithApple`, never wait, call `deleteAccount()` with NO argument; the body is
     `{}` byte for byte (api.test's old pin).
  7. The Apple code is never in a toast, a log, a state, a ref or storage — only a local `const` passed straight to `deleteAccount`.
  8. The ref: no path leaves `inFlight` true (throwing mocks of `appleIdentity` / `confirmWithApple` / `deleteAccount`); the second
     alert is not shown after unmount; Delete Anyway takes the ref.
  9. Casing guard passes ("Delete Anyway" title style; the alert title and message sentence style); `signInWithApple` untouched.
  10. `expo-apple-authentication` is named only in `src/publish/supabase.ts` (+ tests / jest.setup).
- [ ] **Step 2:** `npm.cmd run typecheck`, `npm.cmd test` — all pass (app 439 suites, server 22 suites).
- [ ] **Step 3:** Commit any fixes: `fix(accounts): review of the Apple revocation` with the trailer, explicit `git add` paths.

---

## Task 4 — Docs: AGENTS.md, README §14, phone checklist

- [ ] **Step 1: AGENTS.md.** In the "Signing in" line, after `… and never the \`welcomeSeen\` flag.` append:

```
Apple's revocation (Guideline 5.1.1(v); Apple's TN3194): Clipy keeps no Apple token, so for an Apple user (`appleIdentity()` in supabase.ts: the session's `app_metadata.providers` / `provider` / `identities` — read once) the Delete of the alert waits `AFTER_SHEET_MS`, shows Apple's sheet again (`confirmWithApple`: `signInAsync({ requestedScopes: [] })`, the same Apple ID when the session names it) and sends its fresh `authorizationCode` with the ONE request (`{ appleCode }`; without one the body stays `{}`); the server (`revokeApple`, `_shared/apple.ts`) exchanges it at `/auth/token` with an ES256 client secret made per request (WebCrypto, team `H7WG867R7K`, client `com.astinos.clipy`, 5 minutes) and revokes the refresh token at `/auth/revoke` — beside the platforms' disconnects, inside `REVOKE_BUDGET_MS`, before the auth user is deleted, best effort (it never fails or blocks a deletion; nothing of the code, secret, tokens or key is logged), and ONLY while the switch is on: both secrets `APPLE_REVOKE_KEY` (the .p8 text) and `APPLE_KEY_ID` set (`appleRevokeOn`) — off, or no code, the deletion is byte for byte what it was. Apple not confirming (closed, failed, unavailable, Expo Go, another Apple ID) → the second alert "Delete without Apple's confirmation?" with Cancel / Delete Anyway (deletes with no code). Email and Google users never see any of it. Unverified until Apple sign-in works on a phone (supabase/README.md §14).
```

- [ ] **Step 2: `supabase/README.md` §14.** Change the sentence "**It must be put online once.** … no new secret or database change is needed." to end "… no database change is needed." and append after the "First live run" list:

````markdown
### Apple: revoking Sign in with Apple when an account is deleted

Apple asks that when someone who signed in with Apple deletes their account, the app also tells Apple to forget Clipy for that
Apple ID. Clipy does this on the server, and it stays **off** until you add two secrets. While it is off, deleting works exactly as
above (Apple users only see Apple's sheet once more).

**What the person sees.** After **Delete**, someone who signed in with Apple sees Apple's own sheet again and confirms with Face ID.
If they close it, or Apple fails (as it does today, while Apple's "Sign Up Not Completed" problem lasts), Clipy asks **Delete
without Apple's confirmation?** with **Cancel** and **Delete Anyway**. Delete Anyway deletes the account; Clipy then stays in their
Apple ID's Sign in with Apple list until they remove it in Settings. People who use email or Google see nothing new.

**Switch it on (once):**

1. Put the server online (if not done since this change):

   ```powershell
   npx.cmd supabase functions deploy
   ```

2. Make a Sign in with Apple key. This ADDS a key to the Apple developer account; nothing there is deleted or revoked.
   In [developer.apple.com/account](https://developer.apple.com/account): **Certificates, Identifiers & Profiles** → **Keys** →
   the **+** button. Name it `Clipy Sign in with Apple`, tick **Sign in with Apple**, click **Configure** next to it, choose the
   primary App ID **com.astinos.clipy**, **Save** → **Continue** → **Register**. Click **Download**: you get a file
   `AuthKey_XXXXXXXXXX.p8`. **Apple lets you download it only once** — keep it somewhere safe (not in the project folder).
   Note the **Key ID** shown on the page (10 letters and digits).
3. Give the server the Key ID. Copy the Key ID (select it on Apple's page, Ctrl+C). Do not paste it anywhere. Then the developer
   runs:

   ```powershell
   $k = (Get-Clipboard -Raw).Trim(); npx.cmd supabase secrets set "APPLE_KEY_ID=$k"; Remove-Variable k
   ```

4. Give the server the key. Open the `.p8` file in Notepad, press Ctrl+A, then Ctrl+C, and close Notepad without saving. Do not
   paste it anywhere. Then the developer runs:

   ```powershell
   $k = (Get-Clipboard -Raw) -replace '\s',''; npx.cmd supabase secrets set "APPLE_REVOKE_KEY=$k"; Remove-Variable k
   ```

   Afterwards copy any ordinary word, so the key is no longer on the clipboard. Secrets take effect straight away.

**To switch it off again** (this only removes our server's copies; nothing at Apple changes):

```powershell
npx.cmd supabase secrets unset APPLE_REVOKE_KEY APPLE_KEY_ID
```

**First live run** — only possible once Apple sign-in itself works:

1. On the phone, sign in to Clipy with a throw-away Apple ID. Check iPhone Settings → your name → Sign in with Apple: Clipy is listed.
2. **Accounts → Delete account → Delete**. Apple's sheet appears; confirm. Expected: **Account deleted.**
3. **Edge Functions → delete-account → Logs**: a line `apple revoke: done`. A line `apple revoke: code not exchanged 400 invalid_client`
   means the key, Key ID or App ID is wrong; `invalid_grant` means the code was already used or too old — copy the line for the developer.
4. Settings → your name → Sign in with Apple: Clipy is gone from that Apple ID's list (this is the Apple ID's own list, not the
   developer account). Signing in with Apple again asks for name and email again and makes a new, empty Clipy account.
5. Once more, but close Apple's sheet: **Delete without Apple's confirmation?** appears; **Cancel** keeps you signed in;
   **Delete Anyway** deletes, and the log has no `apple revoke` line.
````

- [ ] **Step 3: Phone checklist.** Append to `docs/next-build-phone-checklist.md`:

```markdown
## I. Deleting an account that signed in with Apple

Only once Apple sign-in works (today Apple answers "Sign Up Not Completed"); the server part needs the two secrets of
`supabase/README.md` §14 "Apple: revoking". Use a throw-away Apple ID.

### 38. Apple asks once more, then the account is gone
Accounts → Delete account → Delete.
- **Right looks like:** Apple's sheet appears a moment after the alert; after Face ID, "Account deleted." and the Sign In card.
  In iPhone Settings → your name → Sign in with Apple, Clipy is no longer listed.
- **Wrong looks like:** no Apple sheet, the account deleted without asking, an error from Apple's sheet every time, or Clipy
  still listed in Settings after a minute.

### 39. Closing Apple's sheet
Sign in with Apple again, Accounts → Delete account → Delete, then close Apple's sheet.
- **Right looks like:** "Delete without Apple's confirmation?" with Cancel and Delete Anyway. Cancel: still signed in.
  Delete Anyway: "Account deleted."
- **Wrong looks like:** the account deleted the moment the sheet closes, or no way to delete at all.

### 40. Email accounts are unchanged
Sign in with email, Accounts → Delete account → Delete.
- **Right looks like:** exactly as before — no Apple sheet, "Account deleted."
```

- [ ] **Step 4:** `npm.cmd run typecheck`, `npm.cmd test` (docs only: unchanged counts). Commit:

```powershell
git add AGENTS.md supabase/README.md docs/next-build-phone-checklist.md
git commit -m @'
docs: Apple revocation on account deletion — AGENTS.md, server setup, phone checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

## Unverified until a live run (spec §9)

A second `signInAsync` returns an `authorizationCode` for an already-authorized Apple ID; the code exchanges with
`client_id = com.astinos.clipy` and no `redirect_uri`; Deno's WebCrypto imports Apple's real `.p8`; Apple accepts a 5-minute
secret; `/auth/token` returns a `refresh_token`; `/auth/revoke` answers 200 and Clipy leaves the Apple ID's list; the session's
`identities[].identity_data.sub` is present; Apple's sheet presents after the alert with the `AFTER_SHEET_MS` wait; the squeezed
key survives `npx.cmd`. None of it can be tried before Apple fixes the App ID ("Sign Up Not Completed").
