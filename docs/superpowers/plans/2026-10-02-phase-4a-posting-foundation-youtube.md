# Phase 4A — Posting Foundation + YouTube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the whole direct-posting pipeline — Supabase backend, Sign in with Apple, Accounts screen, Post screen, chunked uploader, post records — and the first platform, YouTube. Plans 4B–4D add TikTok, Instagram + Facebook and X by adding one server adapter and one client adapter each.

**Architecture:** "Server signs, phone uploads." Edge Functions hold platform secrets and encrypted user tokens, open upload sessions and publish; the phone uploads video bytes straight to the platform (or relays ≤ 4 MB pieces through a function when a platform demands the token). All backend logic is plain TypeScript in `supabase/functions/_shared/` built on web-standard APIs and injected dependencies, tested with Jest in Node; each function's `index.ts` is a thin Deno wrapper. The app side lives in `src/publish/` behind typed `api.ts` calls and is built from the Grand Voyage UI kit.

**Tech Stack:** Supabase (Auth, Postgres, Edge Functions/Deno), `@supabase/supabase-js`, `expo-sqlite` (session storage), `expo-apple-authentication`, `expo-web-browser`, `expo-linking`, `expo-file-system` (`File.open` handles), `expo-image-picker`, Expo SDK 57, TypeScript strict, Zustand, Jest (jest-expo for the app, Node environment for the server code).

**Spec:** `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md` — **§10 (amendments) overrides §1–§9.** UI spec: `docs/superpowers/specs/2026-10-02-ui-redesign-grand-voyage-design.md`.

## Global Constraints

- **Nothing here can be run against the real platforms yet** (no Supabase project, no Google client). Correctness comes from tests with fakes plus reading against the docs. Before using any Supabase, Google or Expo API, fetch its current doc page (`AGENTS.md` rule) and correct the plan's code if the API differs; record every correction in the task report.
- Secrets never ship in the app. Platform tokens never reach the phone (sole exception: the YouTube fallback header when the function secret `YOUTUBE_UPLOAD_TOKEN_ON_PHONE=true`, held in memory only). The server never stores video.
- Graceful absence: backend not configured, signed out, platform unavailable, not connected, server unreachable — each is a normal UI state; nothing throws to the user.
- Expo Go safe: runtime deps added only via `npx.cmd expo install` — `@supabase/supabase-js expo-sqlite expo-apple-authentication expo-web-browser`. No native code, no Swift.
- UI uses only the kit in `src/ui/` and tokens from `src/theme/theme.ts`; `src/__tests__/noHexLiterals.test.ts` stays green. Safe areas via `Screen`.
- Server code in `supabase/functions/_shared/` uses only `fetch`, `Request`, `Response`, `URL`, `crypto.subtle`, `TextEncoder`; relative imports carry the `.ts` extension (Deno requires it). No `Deno.*` outside `index.ts` wrappers and `_shared/runtime.ts`.
- Platform error text is surfaced verbatim; auth failures map to code `reconnect`.
- Windows: PowerShell tool, no `&&` (use `;`), `npx.cmd`. Before each commit: `npm run typecheck` and the task's tests; before finishing a task: full `npm test`.
- `git add` explicit paths only (never `-A`; nothing under `.superpowers/`; never commit `.env`). Every commit message ends with exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- RNTL v14: `render` and `fireEvent.*` are async — always `await`.

## File Map

| File | Responsibility |
|---|---|
| `supabase/config.toml`, `supabase/migrations/20261002000000_posting.sql` | project config, tables + RLS |
| `supabase/functions/_shared/errors.ts` | `ApiError`, `PlatformError`, `toResponse` |
| `…/_shared/crypto.ts`, `pkce.ts` | AES-GCM token encryption, PKCE + random ids |
| `…/_shared/types.ts` | `PlatformId`, `ServerAdapter`, `Db`, `Deps`, row types |
| `…/_shared/memoryDb.ts`, `supabaseDb.ts` | in-memory Db for tests, real Db over supabase-js |
| `…/_shared/tokens.ts` | decrypt / refresh / persist access tokens |
| `…/_shared/handlers/{oauthStart,oauthCallback,accounts,postPrepare,postUpload,postFinalize,postStatus}.ts` | pure request handlers |
| `…/_shared/platforms/youtube.ts`, `registry.ts` | YouTube server adapter, adapter registry |
| `…/_shared/runtime.ts` + `supabase/functions/<name>/index.ts` ×7 | Deno wiring |
| `supabase/README.md` | setup guide for a non-technical user |
| `jest.server.config.js`, `supabase/tsconfig.json` | server test + typecheck setup |
| `src/editor/model/{types,migrate}.ts`, `src/editor/store.ts` | schema v4 `posts`, `addPostRecord` |
| `src/publish/platforms.ts`, `adapters/youtube.ts`, `adapters/index.ts` | platform list, client limits/options |
| `src/publish/supabase.ts`, `api.ts`, `useSession.ts` | client, typed calls, session hook |
| `src/publish/upload.ts`, `fileReader.ts` | chunked uploader, file handle reader |
| `src/publish/runPost.ts`, `usePost.ts`, `useAccounts.ts` | post state machine, accounts logic |
| `src/publish/components/{SignInCard,AccountRow,PostRow,PostOptionsSheet}.tsx` | UI pieces |
| `app/accounts.tsx`, `app/post.tsx`, `app/oauth.tsx` | screens |

---

### Task 1: Server scaffolding — test setup, errors, crypto, PKCE, migration

**Files:**
- Create: `jest.server.config.js`, `supabase/tsconfig.json`, `supabase/config.toml`, `supabase/migrations/20261002000000_posting.sql`, `supabase/functions/_shared/{errors,crypto,pkce}.ts`, `supabase/functions/_shared/__tests__/{errors,crypto,pkce}.test.ts`, `.env.example`
- Modify: `package.json` (scripts, jest ignore), `tsconfig.json` (exclude `supabase`), `.gitignore` (add `.env`, `supabase/.temp/`, `supabase/functions/.env`)

**Interfaces (produced):**
```ts
// errors.ts
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) }
export class PlatformError extends ApiError { constructor(public platform: string, status: number, message: string, code?: string) } // default code "platform_error"
export function json(body: unknown, status?: number): Response
export function toResponse(e: unknown): Response            // ApiError → {code,message} with its status; anything else → 500 {code:"internal"}
// crypto.ts
export function importKey(base64Key: string): Promise<CryptoKey>   // 32 raw bytes, base64
export function encrypt(key: CryptoKey, plaintext: string): Promise<string>
export function decrypt(key: CryptoKey, payload: string): Promise<string>
// pkce.ts
export function randomToken(bytes?: number): string                 // base64url, default 32 bytes
export function challengeFor(verifier: string): Promise<string>     // base64url(SHA-256(verifier)), no padding
```

- [ ] **Step 1: Test + typecheck setup**

`jest.server.config.js`
```js
/** Server-side (Edge Function) logic runs under plain Node: no React Native, no Deno. */
module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: ["<rootDir>/supabase/functions/**/*.test.ts"],
  transform: { "^.+\\.ts$": ["babel-jest", { babelrc: false, configFile: false, presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-typescript"] }] },
};
```
Check `node_modules/@babel/preset-env` and `@babel/preset-typescript` exist (they come with Expo); if one is missing, use `presets: ["babel-preset-expo"]` instead and say so in the report.

`package.json`: scripts → `"test:app": "jest"`, `"test:server": "jest -c jest.server.config.js"`, `"test": "npm run test:app && npm run test:server"`, `"typecheck": "tsc --noEmit && tsc --noEmit -p supabase"`; in the `jest` block add `"testPathIgnorePatterns": ["/node_modules/", "<rootDir>/supabase/"]`.

Root `tsconfig.json`: add `"exclude": ["node_modules", "supabase"]`.

`supabase/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true, "noEmit": true, "allowImportingTsExtensions": true, "skipLibCheck": true, "types": ["jest", "node"]
  },
  "include": ["functions/_shared/**/*.ts"],
  "exclude": ["functions/_shared/runtime.ts", "functions/_shared/supabaseDb.ts"]
}
```
(`runtime.ts` and `supabaseDb.ts` import Deno/npm specifiers and are checked by reading.)

`.env.example`
```
# Copy to .env (never commit .env). Values come from your Supabase project: Settings → API.
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
```

- [ ] **Step 2: Failing tests**

`supabase/functions/_shared/__tests__/crypto.test.ts`
```ts
import { decrypt, encrypt, importKey } from "../crypto.ts";

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

test("round-trips and uses a fresh IV each time", async () => {
  const key = await importKey(KEY);
  const a = await encrypt(key, "ya29.token");
  const b = await encrypt(key, "ya29.token");
  expect(a).not.toBe(b);
  expect(await decrypt(key, a)).toBe("ya29.token");
  expect(await decrypt(key, b)).toBe("ya29.token");
});

test("tampering is rejected", async () => {
  const key = await importKey(KEY);
  const bytes = Buffer.from(await encrypt(key, "secret"), "base64");
  bytes[bytes.length - 1] ^= 1;
  await expect(decrypt(key, bytes.toString("base64"))).rejects.toBeDefined();
});

test("a key of the wrong length is refused", async () => {
  await expect(importKey(Buffer.from("short").toString("base64"))).rejects.toThrow("TOKEN_ENC_KEY must be 32 bytes");
});
```

`…/__tests__/pkce.test.ts`
```ts
import { challengeFor, randomToken } from "../pkce.ts";

test("randomToken is url-safe and unique", () => {
  const a = randomToken(), b = randomToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a).not.toBe(b);
});

test("challengeFor matches the RFC 7636 example", async () => {
  expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
```

`…/__tests__/errors.test.ts`
```ts
import { ApiError, PlatformError, toResponse } from "../errors.ts";

test("ApiError becomes its status and {code,message}", async () => {
  const r = toResponse(new ApiError(404, "not_connected", "Connect YouTube first."));
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ code: "not_connected", message: "Connect YouTube first." });
});

test("PlatformError keeps the platform's own words", async () => {
  const r = toResponse(new PlatformError("youtube", 403, "The request cannot be completed because you have exceeded your quota."));
  expect(r.status).toBe(403);
  expect(await r.json()).toEqual({ code: "platform_error", message: "The request cannot be completed because you have exceeded your quota." });
});

test("unknown errors are a generic 500", async () => {
  const r = toResponse(new Error("boom"));
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ code: "internal", message: "Something went wrong." });
});
```

- [ ] **Step 3: Run** — `npm run test:server` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`errors.ts`
```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
/** A failure reported by a platform; `message` is the platform's own text, shown to the user verbatim. */
export class PlatformError extends ApiError {
  constructor(public platform: string, status: number, message: string, code = "platform_error") { super(status, code, message); }
}
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
export function toResponse(e: unknown): Response {
  if (e instanceof ApiError) return json({ code: e.code, message: e.message }, e.status);
  console.error(e);
  return json({ code: "internal", message: "Something went wrong." }, 500);
}
```

`crypto.ts`
```ts
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-GCM key from 32 random bytes, base64 (`openssl rand -base64 32`), kept in the TOKEN_ENC_KEY function secret. */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = unb64(base64Key);
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
/** base64(iv ‖ ciphertext); a fresh 12-byte IV per call. */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const buf = unb64(payload);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}
```

`pkce.ts`
```ts
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomToken(bytes = 32): string { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}
```

`supabase/config.toml` — check the current Supabase config reference for exact keys; minimum:
```toml
project_id = "clipy"

[functions.oauth-callback]
verify_jwt = false
```

`supabase/migrations/20261002000000_posting.sql`
```sql
-- Posting backend. Only Edge Functions (service role) touch these tables: RLS is on and no policies exist.
create table public.connected_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube','tiktok','instagram','facebook','x')),
  account_id text not null,
  display_name text not null,
  avatar_url text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  code_verifier text not null,
  return_url text not null,
  expires_at timestamptz not null
);
create table public.post_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  platform_ref jsonb not null default '{}'::jsonb,
  input jsonb not null default '{}'::jsonb,
  status text not null default 'uploading' check (status in ('uploading','processing','done','failed')),
  url text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.connected_accounts enable row level security;
alter table public.oauth_states enable row level security;
alter table public.post_sessions enable row level security;
revoke all on public.connected_accounts, public.oauth_states, public.post_sessions from anon, authenticated;
```
Verify against the Supabase docs that the service/secret role keeps access after the `revoke` (it bypasses RLS and holds its own grants); adjust if the docs say an explicit `grant … to service_role` is needed.

- [ ] **Step 5: Verify** — `npm run test:server` → PASS; `npm run typecheck` → clean (both projects); `npm run test:app` still green.
- [ ] **Step 6: Commit**

```powershell
git add jest.server.config.js package.json tsconfig.json .gitignore .env.example supabase/tsconfig.json supabase/config.toml supabase/migrations supabase/functions/_shared
git commit -m "feat(server): scaffolding — node test setup, errors, AES-GCM, PKCE, schema"
```

---

### Task 2: Server core — types, in-memory Db, token service

**Files:**
- Create: `supabase/functions/_shared/{types,memoryDb,tokens}.ts`, `…/__tests__/{memoryDb,tokens}.test.ts`, `…/__tests__/fakes.ts`

**Interfaces (produced):**
```ts
// types.ts
export const PLATFORM_IDS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export interface Env { get(name: string): string | undefined }
export interface Tokens { accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string }
export interface Profile { accountId: string; displayName: string; avatarUrl: string | null }
export interface PrepareInput { fileSize: number; durationSec: number; mimeType: string; caption: string; options: Record<string, unknown> }
export type UploadProtocol = "google-resumable" | "relay";
export interface PrepareResult { protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number; ref: Record<string, unknown> }
export type PublishResult = { status: "done"; url: string | null } | { status: "processing" };
export interface AdapterCtx { fetch: typeof fetch; env: Env; redirectUri: string }
export interface ServerAdapter {
  id: PlatformId;
  secrets: readonly string[];
  authUrl(ctx: AdapterCtx, p: { state: string; codeChallenge: string }): string;
  exchange(ctx: AdapterCtx, p: { code: string; codeVerifier: string }): Promise<Tokens>;
  /** A null refreshToken in the result means "keep the old one". */
  refresh(ctx: AdapterCtx, refreshToken: string): Promise<Tokens>;
  revoke(ctx: AdapterCtx, tokens: { accessToken: string; refreshToken: string | null }): Promise<void>;
  profile(ctx: AdapterCtx, accessToken: string): Promise<Profile>;
  prepare(ctx: AdapterCtx, accessToken: string, input: PrepareInput): Promise<PrepareResult>;
  relayChunk?(ctx: AdapterCtx, accessToken: string, ref: Record<string, unknown>, chunk: { offset: number; total: number; body: Uint8Array }): Promise<{ nextOffset: number; ref?: Record<string, unknown> }>;
  finalize(ctx: AdapterCtx, accessToken: string, s: { ref: Record<string, unknown>; input: PrepareInput; clientResult: string | null; account: Profile }): Promise<PublishResult>;
  status(ctx: AdapterCtx, accessToken: string, ref: Record<string, unknown>): Promise<PublishResult>;
}
export interface AccountRow { userId: string; platform: PlatformId; accountId: string; displayName: string; avatarUrl: string | null; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: string | null; scopes: string; meta: Record<string, unknown> }
export interface OAuthStateRow { state: string; userId: string; platform: PlatformId; codeVerifier: string; returnUrl: string; expiresAt: string }
export type SessionStatus = "uploading" | "processing" | "done" | "failed";
export interface PostSessionRow { id: string; userId: string; platform: PlatformId; ref: Record<string, unknown>; input: PrepareInput; status: SessionStatus; url: string | null; error: string | null }
export interface Db {
  getAccount(userId: string, platform: PlatformId): Promise<AccountRow | null>;
  listAccounts(userId: string): Promise<AccountRow[]>;
  upsertAccount(row: AccountRow): Promise<void>;
  deleteAccount(userId: string, platform: PlatformId): Promise<void>;
  putState(row: OAuthStateRow): Promise<void>;
  /** Returns the row and deletes it (single use). */
  takeState(state: string): Promise<OAuthStateRow | null>;
  createSession(row: Omit<PostSessionRow, "id">): Promise<string>;
  getSession(id: string): Promise<PostSessionRow | null>;
  updateSession(id: string, patch: Partial<Pick<PostSessionRow, "ref" | "status" | "url" | "error">>): Promise<void>;
}
export interface Deps {
  db: Db; env: Env; fetch: typeof fetch; now(): Date; key(): Promise<CryptoKey>;
  adapters: Partial<Record<PlatformId, ServerAdapter>>;
  /** The public HTTPS URL of the oauth-callback function, registered on every platform. */
  callbackUrl: string;
}
export function isPlatformId(v: unknown): v is PlatformId
export function adapterCtx(deps: Deps): AdapterCtx
export function availableAdapter(deps: Deps, platform: PlatformId): ServerAdapter | null   // adapter exists and every secret is set

// tokens.ts
export function saveTokens(deps: Deps, userId: string, platform: PlatformId, tokens: Tokens, profile: Profile, meta?: Record<string, unknown>): Promise<void>
/** A usable access token, refreshed when it expires within 60 s. Throws ApiError 404 not_connected, 401 reconnect. */
export function accessTokenFor(deps: Deps, userId: string, platform: PlatformId): Promise<{ accessToken: string; account: AccountRow }>
```

- [ ] **Step 1: Test fakes** — `…/__tests__/fakes.ts`

```ts
import { importKey } from "../crypto.ts";
import { memoryDb } from "../memoryDb.ts";
import type { Deps, PrepareInput, ServerAdapter, Tokens } from "../types.ts";

export const TEST_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
export const USER = "11111111-1111-1111-1111-111111111111";
export const INPUT: PrepareInput = { fileSize: 20_000_000, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} };

export function tokens(over: Partial<Tokens> = {}): Tokens {
  return { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: "2026-10-02T11:00:00.000Z", scopes: "upload", ...over };
}

/** A scriptable adapter: every method is a jest.fn with a sensible default. */
export function fakeAdapter(over: Partial<ServerAdapter> = {}): ServerAdapter {
  return {
    id: "youtube", secrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    authUrl: jest.fn((_c, p) => `https://platform.test/auth?state=${p.state}`),
    exchange: jest.fn(async () => tokens()),
    refresh: jest.fn(async () => tokens({ accessToken: "access-2", refreshToken: null, expiresAt: "2026-10-02T12:00:00.000Z" })),
    revoke: jest.fn(async () => {}),
    profile: jest.fn(async () => ({ accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img.test/a.jpg" })),
    prepare: jest.fn(async () => ({ protocol: "google-resumable" as const, uploadUrl: "https://upload.test/session", uploadHeaders: {}, chunkSize: 8388608, ref: { k: 1 } })),
    finalize: jest.fn(async () => ({ status: "done" as const, url: "https://youtu.be/abc123XYZ_-" })),
    status: jest.fn(async () => ({ status: "done" as const, url: null })),
    ...over,
  };
}

export function fakeDeps(over: Partial<Deps> = {}): Deps {
  const env = new Map<string, string>([["YOUTUBE_CLIENT_ID", "cid"], ["YOUTUBE_CLIENT_SECRET", "secret"]]);
  return {
    db: memoryDb(), env: { get: (n) => env.get(n) }, fetch: jest.fn() as unknown as typeof fetch,
    now: () => new Date("2026-10-02T10:00:00.000Z"), key: () => importKey(TEST_KEY),
    adapters: { youtube: fakeAdapter() }, callbackUrl: "https://ref.supabase.co/functions/v1/oauth-callback",
    ...over,
  };
}
```

- [ ] **Step 2: Failing tests**

`…/__tests__/memoryDb.test.ts`
```ts
import { memoryDb } from "../memoryDb.ts";
import { INPUT, USER } from "./fakes.ts";

test("accounts: upsert replaces, list is per user, delete removes", async () => {
  const db = memoryDb();
  const row = { userId: USER, platform: "youtube" as const, accountId: "UC1", displayName: "A", avatarUrl: null, accessTokenEnc: "x", refreshTokenEnc: null, expiresAt: null, scopes: "", meta: {} };
  await db.upsertAccount(row);
  await db.upsertAccount({ ...row, displayName: "B" });
  expect((await db.getAccount(USER, "youtube"))?.displayName).toBe("B");
  expect(await db.listAccounts("someone-else")).toEqual([]);
  await db.deleteAccount(USER, "youtube");
  expect(await db.getAccount(USER, "youtube")).toBeNull();
});

test("states are single use", async () => {
  const db = memoryDb();
  await db.putState({ state: "s1", userId: USER, platform: "youtube", codeVerifier: "v", returnUrl: "exp://x", expiresAt: "2026-10-02T10:10:00.000Z" });
  expect((await db.takeState("s1"))?.codeVerifier).toBe("v");
  expect(await db.takeState("s1")).toBeNull();
});

test("sessions: create, read, patch", async () => {
  const db = memoryDb();
  const id = await db.createSession({ userId: USER, platform: "youtube", ref: {}, input: INPUT, status: "uploading", url: null, error: null });
  await db.updateSession(id, { status: "done", url: "https://youtu.be/x" });
  expect(await db.getSession(id)).toMatchObject({ id, status: "done", url: "https://youtu.be/x" });
  expect(await db.getSession("nope")).toBeNull();
});
```

`…/__tests__/tokens.test.ts`
```ts
import { decrypt, importKey } from "../crypto.ts";
import { ApiError, PlatformError } from "../errors.ts";
import { accessTokenFor, saveTokens } from "../tokens.ts";
import { fakeAdapter, fakeDeps, TEST_KEY, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: null };

test("saveTokens stores ciphertext, never the token", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  const row = (await deps.db.getAccount(USER, "youtube"))!;
  expect(row.accessTokenEnc).not.toContain("access-1");
  expect(await decrypt(await importKey(TEST_KEY), row.accessTokenEnc)).toBe("access-1");
  expect(await decrypt(await importKey(TEST_KEY), row.refreshTokenEnc!)).toBe("refresh-1");
});

test("a fresh token is returned without refreshing", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  expect((await accessTokenFor(deps, USER, "youtube")).accessToken).toBe("access-1");
  expect(deps.adapters.youtube!.refresh).not.toHaveBeenCalled();
});

test("an expiring token is refreshed, saved, and the old refresh token kept when none is returned", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T10:00:30.000Z" }), profile);
  expect((await accessTokenFor(deps, USER, "youtube")).accessToken).toBe("access-2");
  const row = (await deps.db.getAccount(USER, "youtube"))!;
  const key = await importKey(TEST_KEY);
  expect(await decrypt(key, row.accessTokenEnc)).toBe("access-2");
  expect(await decrypt(key, row.refreshTokenEnc!)).toBe("refresh-1");
  expect(row.expiresAt).toBe("2026-10-02T12:00:00.000Z");
});

test("a rotated refresh token replaces the old one", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => tokens({ accessToken: "access-3", refreshToken: "refresh-2" })) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await accessTokenFor(deps, USER, "youtube");
  expect(await decrypt(await importKey(TEST_KEY), (await deps.db.getAccount(USER, "youtube"))!.refreshTokenEnc!)).toBe("refresh-2");
});

test("not connected → 404 not_connected", async () => {
  await expect(accessTokenFor(fakeDeps(), USER, "youtube")).rejects.toMatchObject({ status: 404, code: "not_connected" });
});

test("refresh failure marks the account and throws reconnect", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => { throw new PlatformError("youtube", 400, "Token has been expired or revoked."); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
});

test("expired with no refresh token → reconnect", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens({ refreshToken: null, expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toBeInstanceOf(ApiError);
});
```

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement**

`types.ts` — the interfaces above verbatim, plus:
```ts
export function isPlatformId(v: unknown): v is PlatformId { return (PLATFORM_IDS as readonly unknown[]).includes(v); }
export function adapterCtx(deps: Deps): AdapterCtx { return { fetch: deps.fetch, env: deps.env, redirectUri: deps.callbackUrl }; }
export function availableAdapter(deps: Deps, platform: PlatformId): ServerAdapter | null {
  const a = deps.adapters[platform];
  return a && a.secrets.every((s) => !!deps.env.get(s)) ? a : null;
}
```

`memoryDb.ts`
```ts
import type { AccountRow, Db, OAuthStateRow, PostSessionRow } from "./types.ts";

/** In-memory Db for tests (and a reference for supabaseDb's behaviour). */
export function memoryDb(): Db {
  const accounts = new Map<string, AccountRow>();
  const states = new Map<string, OAuthStateRow>();
  const sessions = new Map<string, PostSessionRow>();
  let n = 0;
  const k = (u: string, p: string) => `${u}|${p}`;
  return {
    getAccount: async (u, p) => accounts.get(k(u, p)) ?? null,
    listAccounts: async (u) => [...accounts.values()].filter((a) => a.userId === u),
    upsertAccount: async (row) => { accounts.set(k(row.userId, row.platform), { ...row }); },
    deleteAccount: async (u, p) => { accounts.delete(k(u, p)); },
    putState: async (row) => { states.set(row.state, { ...row }); },
    takeState: async (s) => { const row = states.get(s) ?? null; states.delete(s); return row; },
    createSession: async (row) => { const id = `session-${++n}`; sessions.set(id, { ...row, id }); return id; },
    getSession: async (id) => sessions.get(id) ?? null,
    updateSession: async (id, patch) => { const s = sessions.get(id); if (s) sessions.set(id, { ...s, ...patch }); },
  };
}
```

`tokens.ts`
```ts
import { decrypt, encrypt } from "./crypto.ts";
import { ApiError } from "./errors.ts";
import { adapterCtx, type AccountRow, type Deps, type PlatformId, type Profile, type Tokens } from "./types.ts";

const REFRESH_MARGIN_MS = 60_000;

export async function saveTokens(deps: Deps, userId: string, platform: PlatformId, tokens: Tokens, profile: Profile, meta: Record<string, unknown> = {}): Promise<void> {
  const key = await deps.key();
  await deps.db.upsertAccount({
    userId, platform, accountId: profile.accountId, displayName: profile.displayName, avatarUrl: profile.avatarUrl,
    accessTokenEnc: await encrypt(key, tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? await encrypt(key, tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt, scopes: tokens.scopes, meta,
  });
}

const reconnect = (platform: PlatformId) => new ApiError(401, "reconnect", `Reconnect ${platform} in Accounts.`);

export async function accessTokenFor(deps: Deps, userId: string, platform: PlatformId): Promise<{ accessToken: string; account: AccountRow }> {
  const account = await deps.db.getAccount(userId, platform);
  if (!account) throw new ApiError(404, "not_connected", `Connect ${platform} in Accounts first.`);
  const key = await deps.key();
  const fresh = !account.expiresAt || new Date(account.expiresAt).getTime() - deps.now().getTime() > REFRESH_MARGIN_MS;
  if (fresh) return { accessToken: await decrypt(key, account.accessTokenEnc), account };

  const adapter = deps.adapters[platform];
  const oldRefresh = account.refreshTokenEnc ? await decrypt(key, account.refreshTokenEnc) : null;
  if (!adapter || !oldRefresh) throw reconnect(platform);
  let next: Tokens;
  try { next = await adapter.refresh(adapterCtx(deps), oldRefresh); }
  catch {
    await deps.db.upsertAccount({ ...account, meta: { ...account.meta, needsReconnect: true } });
    throw reconnect(platform);
  }
  const updated: AccountRow = {
    ...account, accessTokenEnc: await encrypt(key, next.accessToken),
    refreshTokenEnc: await encrypt(key, next.refreshToken ?? oldRefresh),
    expiresAt: next.expiresAt, scopes: next.scopes || account.scopes, meta: { ...account.meta, needsReconnect: false },
  };
  await deps.db.upsertAccount(updated);
  return { accessToken: next.accessToken, account: updated };
}
```

- [ ] **Step 5: Verify** — `npm run test:server`; `npm run typecheck`.
- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/_shared
git commit -m "feat(server): adapter and Db contracts, in-memory Db, token refresh service"
```

---

### Task 3: Server handlers — OAuth start/callback and accounts

**Files:**
- Create: `supabase/functions/_shared/handlers/{oauthStart,oauthCallback,accounts}.ts`, `…/__tests__/{oauth,accounts}.test.ts`

**Interfaces (produced):**
```ts
export function oauthStart(deps: Deps, userId: string, body: unknown): Promise<{ authUrl: string }>
export function oauthCallback(deps: Deps, url: URL): Promise<{ redirect: string }>      // never throws once a state row is found
export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }
export function listAccounts(deps: Deps, userId: string): Promise<{ platforms: PlatformStatus[] }>
export function disconnect(deps: Deps, userId: string, platform: unknown): Promise<{ ok: true }>
export const RETURN_URL = /^(exp|exps|clipy):\/\/[^\s]*$/
export const STATE_TTL_MS = 600_000
```

- [ ] **Step 1: Failing tests**

`…/__tests__/oauth.test.ts`
```ts
import { challengeFor } from "../pkce.ts";
import { oauthCallback } from "../handlers/oauthCallback.ts";
import { oauthStart } from "../handlers/oauthStart.ts";
import { PlatformError } from "../errors.ts";
import { fakeAdapter, fakeDeps, USER } from "./fakes.ts";

const RETURN = "exp://192.168.1.142:8090/--/oauth";
const cb = (q: string) => new URL(`https://ref.supabase.co/functions/v1/oauth-callback?${q}`);

test("start stores a single-use state with a PKCE verifier and returns the platform URL", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const call = (deps.adapters.youtube!.authUrl as jest.Mock).mock.calls[0][1];
  const row = (await deps.db.takeState(state))!;
  expect(row).toMatchObject({ userId: USER, platform: "youtube", returnUrl: RETURN, expiresAt: "2026-10-02T10:10:00.000Z" });
  expect(call.codeChallenge).toBe(await challengeFor(row.codeVerifier));
});

test.each([
  [{ platform: "myspace", returnUrl: RETURN }, "bad_request"],
  [{ platform: "youtube", returnUrl: "https://evil.example/steal" }, "bad_request"],
  [{ platform: "tiktok", returnUrl: RETURN }, "unavailable"],
])("start rejects %j", async (body, code) => {
  await expect(oauthStart(fakeDeps(), USER, body)).rejects.toMatchObject({ code });
});

test("start reports unavailable when a secret is missing", async () => {
  const deps = fakeDeps({ env: { get: () => undefined } });
  await expect(oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN })).rejects.toMatchObject({ status: 409, code: "unavailable" });
});

test("callback exchanges the code, saves the account and returns to the app", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`code=abc&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=ok&platform=youtube`);
  expect(deps.adapters.youtube!.exchange).toHaveBeenCalledWith(expect.anything(), { code: "abc", codeVerifier: expect.any(String) });
  expect(await deps.db.getAccount(USER, "youtube")).toMatchObject({ accountId: "UC123", displayName: "My Channel" });
  expect(await deps.db.takeState(state)).toBeNull();
});

test("callback: the user said no", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`error=access_denied&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=cancelled&platform=youtube`);
});

test("callback: platform failure comes back as an error with the platform's words", async () => {
  const adapter = fakeAdapter({ exchange: jest.fn(async () => { throw new PlatformError("youtube", 400, "Bad Request"); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`code=abc&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=error&platform=youtube&message=Bad%20Request`);
});

test("callback: unknown or expired state throws (there is nowhere safe to redirect)", async () => {
  await expect(oauthCallback(fakeDeps(), cb("code=abc&state=nope"))).rejects.toMatchObject({ status: 400, code: "bad_state" });
  const deps = fakeDeps();
  await deps.db.putState({ state: "old", userId: USER, platform: "youtube", codeVerifier: "v", returnUrl: RETURN, expiresAt: "2026-10-02T09:59:59.000Z" });
  await expect(oauthCallback(deps, cb("code=abc&state=old"))).rejects.toMatchObject({ code: "bad_state" });
});
```

`…/__tests__/accounts.test.ts`
```ts
import { disconnect, listAccounts } from "../handlers/accounts.ts";
import { saveTokens } from "../tokens.ts";
import { fakeDeps, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img.test/a.jpg" };

test("lists all five platforms in order with availability and connection", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  const { platforms } = await listAccounts(deps, USER);
  expect(platforms.map((p) => p.id)).toEqual(["youtube", "tiktok", "instagram", "facebook", "x"]);
  expect(platforms[0]).toEqual({ id: "youtube", available: true, connected: true, name: "My Channel", avatarUrl: "https://img.test/a.jpg", needsReconnect: false });
  expect(platforms[1]).toEqual({ id: "tiktok", available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false });
});

test("needsReconnect comes from the account meta", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile, { needsReconnect: true });
  expect((await listAccounts(deps, USER)).platforms[0].needsReconnect).toBe(true);
});

test("disconnect revokes with the decrypted tokens and deletes the row even if revoke fails", async () => {
  const deps = fakeDeps();
  (deps.adapters.youtube!.revoke as jest.Mock).mockRejectedValueOnce(new Error("network"));
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  expect(await disconnect(deps, USER, "youtube")).toEqual({ ok: true });
  expect(deps.adapters.youtube!.revoke).toHaveBeenCalledWith(expect.anything(), { accessToken: "access-1", refreshToken: "refresh-1" });
  expect(await deps.db.getAccount(USER, "youtube")).toBeNull();
});

test("disconnect of an unknown platform is a bad request; of a missing account is a no-op", async () => {
  await expect(disconnect(fakeDeps(), USER, "myspace")).rejects.toMatchObject({ code: "bad_request" });
  expect(await disconnect(fakeDeps(), USER, "youtube")).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`handlers/oauthStart.ts`
```ts
import { ApiError } from "../errors.ts";
import { challengeFor, randomToken } from "../pkce.ts";
import { adapterCtx, availableAdapter, isPlatformId, type Deps } from "../types.ts";

/** Where the callback may send the browser back to: Expo Go (exp/exps) or the built app (clipy). Nothing else. */
export const RETURN_URL = /^(exp|exps|clipy):\/\/[^\s]*$/;
export const STATE_TTL_MS = 600_000;

export async function oauthStart(deps: Deps, userId: string, body: unknown): Promise<{ authUrl: string }> {
  const { platform, returnUrl } = (body ?? {}) as { platform?: unknown; returnUrl?: unknown };
  if (!isPlatformId(platform) || typeof returnUrl !== "string" || !RETURN_URL.test(returnUrl)) throw new ApiError(400, "bad_request", "Unknown platform or return address.");
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const state = randomToken(), codeVerifier = randomToken(48);
  await deps.db.putState({ state, userId, platform, codeVerifier, returnUrl, expiresAt: new Date(deps.now().getTime() + STATE_TTL_MS).toISOString() });
  return { authUrl: adapter.authUrl(adapterCtx(deps), { state, codeChallenge: await challengeFor(codeVerifier) }) };
}
```

`handlers/oauthCallback.ts`
```ts
import { ApiError } from "../errors.ts";
import { saveTokens } from "../tokens.ts";
import { adapterCtx, availableAdapter, type Deps } from "../types.ts";

const back = (returnUrl: string, params: Record<string, string>) =>
  `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;

/** The platform's redirect lands here. Exchanges the code at once (X's expires in 30 s) and bounces back into the app. */
export async function oauthCallback(deps: Deps, url: URL): Promise<{ redirect: string }> {
  const row = await deps.db.takeState(url.searchParams.get("state") ?? "");
  if (!row || new Date(row.expiresAt).getTime() < deps.now().getTime()) throw new ApiError(400, "bad_state", "This sign-in link has expired. Go back to Clipy and try again.");
  const { platform, returnUrl } = row;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return { redirect: back(returnUrl, { status: "cancelled", platform }) };
  try {
    const adapter = availableAdapter(deps, platform);
    if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
    const ctx = adapterCtx(deps);
    const tokens = await adapter.exchange(ctx, { code, codeVerifier: row.codeVerifier });
    await saveTokens(deps, row.userId, platform, tokens, await adapter.profile(ctx, tokens.accessToken));
    return { redirect: back(returnUrl, { status: "ok", platform }) };
  } catch (e) {
    const message = e instanceof ApiError ? e.message : "Something went wrong.";
    if (!(e instanceof ApiError)) console.error(e);
    return { redirect: back(returnUrl, { status: "error", platform, message }) };
  }
}
```

`handlers/accounts.ts`
```ts
import { decrypt } from "../crypto.ts";
import { ApiError } from "../errors.ts";
import { adapterCtx, availableAdapter, isPlatformId, PLATFORM_IDS, type Deps, type PlatformId } from "../types.ts";

export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }

export async function listAccounts(deps: Deps, userId: string): Promise<{ platforms: PlatformStatus[] }> {
  const rows = new Map((await deps.db.listAccounts(userId)).map((r) => [r.platform, r]));
  return {
    platforms: PLATFORM_IDS.map((id) => {
      const row = rows.get(id);
      return { id, available: !!availableAdapter(deps, id), connected: !!row, name: row?.displayName ?? null, avatarUrl: row?.avatarUrl ?? null, needsReconnect: row?.meta.needsReconnect === true };
    }),
  };
}

export async function disconnect(deps: Deps, userId: string, platform: unknown): Promise<{ ok: true }> {
  if (!isPlatformId(platform)) throw new ApiError(400, "bad_request", "Unknown platform.");
  const row = await deps.db.getAccount(userId, platform);
  if (!row) return { ok: true };
  const adapter = deps.adapters[platform];
  if (adapter) {
    try {
      const key = await deps.key();
      await adapter.revoke(adapterCtx(deps), { accessToken: await decrypt(key, row.accessTokenEnc), refreshToken: row.refreshTokenEnc ? await decrypt(key, row.refreshTokenEnc) : null });
    } catch (e) { console.error("revoke failed", e); }   // the row is deleted regardless
  }
  await deps.db.deleteAccount(userId, platform);
  return { ok: true };
}
```

- [ ] **Step 4: Verify** — `npm run test:server`; `npm run typecheck`.
- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared
git commit -m "feat(server): OAuth start/callback and accounts handlers"
```

---

### Task 4: Server handlers — prepare, relay upload, finalize, status

**Files:**
- Create: `supabase/functions/_shared/handlers/{postPrepare,postUpload,postFinalize,postStatus}.ts`, `…/__tests__/post.test.ts`

**Interfaces (produced):**
```ts
export const MAX_RELAY_BYTES = 4 * 1024 * 1024
export interface PrepareResponse { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number }
export function postPrepare(deps: Deps, userId: string, body: unknown): Promise<PrepareResponse>
export function postUpload(deps: Deps, userId: string, q: { sessionId: unknown; offset: unknown; total: unknown }, chunk: Uint8Array): Promise<{ nextOffset: number }>
export function postFinalize(deps: Deps, userId: string, body: unknown): Promise<PublishResult>
export function postStatus(deps: Deps, userId: string, body: unknown): Promise<PublishResult>
```

- [ ] **Step 1: Failing tests** — `…/__tests__/post.test.ts`

```ts
import { PlatformError } from "../errors.ts";
import { postFinalize } from "../handlers/postFinalize.ts";
import { postPrepare } from "../handlers/postPrepare.ts";
import { postStatus } from "../handlers/postStatus.ts";
import { MAX_RELAY_BYTES, postUpload } from "../handlers/postUpload.ts";
import { saveTokens } from "../tokens.ts";
import { fakeAdapter, fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: null };
const body = { platform: "youtube", ...INPUT };
async function connected(over = {}) { const deps = fakeDeps(over); await saveTokens(deps, USER, "youtube", tokens(), profile); return deps; }

test("prepare opens a platform session and stores ours", async () => {
  const deps = await connected();
  const r = await postPrepare(deps, USER, body);
  expect(r).toEqual({ sessionId: expect.any(String), protocol: "google-resumable", uploadUrl: "https://upload.test/session", uploadHeaders: {}, chunkSize: 8388608 });
  expect(deps.adapters.youtube!.prepare).toHaveBeenCalledWith(expect.anything(), "access-1", INPUT);
  expect(await deps.db.getSession(r.sessionId)).toMatchObject({ userId: USER, platform: "youtube", status: "uploading", ref: { k: 1 }, input: INPUT });
});

test.each([
  [{ ...body, platform: "myspace" }], [{ ...body, fileSize: 0 }], [{ ...body, fileSize: "big" }], [{ ...body, durationSec: -1 }],
  [{ ...body, mimeType: "" }], [{ ...body, caption: 5 }], [{ ...body, options: null }],
])("prepare rejects bad input %#", async (bad) => {
  await expect(postPrepare(await connected(), USER, bad)).rejects.toMatchObject({ status: 400, code: "bad_request" });
});

test("prepare needs a connected account", async () => {
  await expect(postPrepare(fakeDeps(), USER, body)).rejects.toMatchObject({ code: "not_connected" });
});

test("a platform auth failure during prepare becomes reconnect", async () => {
  const adapter = fakeAdapter({ prepare: jest.fn(async () => { throw new PlatformError("youtube", 401, "Invalid Credentials"); }) });
  const deps = await connected({ adapters: { youtube: adapter } });
  await expect(postPrepare(deps, USER, body)).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
});

test("finalize publishes, records the link, and is idempotent", async () => {
  const deps = await connected();
  const { sessionId } = await postPrepare(deps, USER, body);
  expect(await postFinalize(deps, USER, { sessionId, clientResult: '{"id":"abc123XYZ_-"}' })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  expect(deps.adapters.youtube!.finalize).toHaveBeenCalledWith(expect.anything(), "access-1",
    { ref: { k: 1 }, input: INPUT, clientResult: '{"id":"abc123XYZ_-"}', account: { accountId: "UC123", displayName: "My Channel", avatarUrl: null } });
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  expect(deps.adapters.youtube!.finalize).toHaveBeenCalledTimes(1);
});

test("finalize that is still processing leaves the session processing; status then polls the adapter", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => ({ status: "done" as const, url: "https://x.test/1" })) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "processing" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  expect(await postStatus(deps, USER, { sessionId })).toEqual({ status: "done", url: "https://x.test/1" });
  expect((await deps.db.getSession(sessionId))!).toMatchObject({ status: "done", url: "https://x.test/1" });
});

test("a platform failure in finalize is stored and rethrown verbatim", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 400, "The video has been rejected."); }) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postFinalize(deps, USER, { sessionId, clientResult: null })).rejects.toMatchObject({ message: "The video has been rejected." });
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "failed", error: "The video has been rejected." });
});

test("someone else's session is not found", async () => {
  const deps = await connected();
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postFinalize(deps, "other-user", { sessionId, clientResult: null })).rejects.toMatchObject({ status: 404, code: "not_found" });
  await expect(postStatus(deps, "other-user", { sessionId })).rejects.toMatchObject({ code: "not_found" });
  await expect(postUpload(deps, "other-user", { sessionId, offset: 0, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "not_found" });
});

test("relay upload forwards the chunk, saves the new ref and returns the next offset", async () => {
  const relayChunk = jest.fn(async () => ({ nextOffset: 3, ref: { k: 2 } }));
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  const chunk = new Uint8Array([1, 2, 3]);
  expect(await postUpload(deps, USER, { sessionId, offset: "0", total: "20000000" }, chunk)).toEqual({ nextOffset: 3 });
  expect(relayChunk).toHaveBeenCalledWith(expect.anything(), "access-1", { k: 1 }, { offset: 0, total: 20000000, body: chunk });
  expect((await deps.db.getSession(sessionId))!.ref).toEqual({ k: 2 });
});

test("relay upload refuses oversized or empty chunks, bad offsets, and platforms that upload directly", async () => {
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk: jest.fn() }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: 10 }, new Uint8Array(MAX_RELAY_BYTES + 1))).rejects.toMatchObject({ status: 413, code: "too_large" });
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: 10 }, new Uint8Array(0))).rejects.toMatchObject({ code: "bad_request" });
  await expect(postUpload(deps, USER, { sessionId, offset: -1, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
  const direct = await connected();
  const s = await postPrepare(direct, USER, body);
  await expect(postUpload(direct, USER, { sessionId: s.sessionId, offset: 0, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

Add to `tokens.ts` (shared by the three post handlers) and export it:
```ts
/** Runs a platform call; a 401 from the platform flags the account and becomes `reconnect`. */
export async function withPlatformAuth<T>(deps: Deps, account: AccountRow, run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (e) {
    if (e instanceof PlatformError && e.status === 401) {
      await deps.db.upsertAccount({ ...account, meta: { ...account.meta, needsReconnect: true } });
      throw reconnect(account.platform);
    }
    throw e;
  }
}
```
(import `PlatformError` from `./errors.ts`).

`handlers/postPrepare.ts`
```ts
import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, availableAdapter, isPlatformId, type Deps, type PlatformId, type PrepareInput, type UploadProtocol } from "../types.ts";

export interface PrepareResponse { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number }
const pos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export async function postPrepare(deps: Deps, userId: string, body: unknown): Promise<PrepareResponse> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ok = isPlatformId(b.platform) && pos(b.fileSize) && pos(b.durationSec) && typeof b.mimeType === "string" && b.mimeType.length > 0
    && typeof b.caption === "string" && typeof b.options === "object" && b.options !== null;
  if (!ok) throw new ApiError(400, "bad_request", "The post request is incomplete.");
  const platform = b.platform as PlatformId;
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const input: PrepareInput = { fileSize: b.fileSize as number, durationSec: b.durationSec as number, mimeType: b.mimeType as string, caption: b.caption as string, options: b.options as Record<string, unknown> };
  const { accessToken, account } = await accessTokenFor(deps, userId, platform);
  const p = await withPlatformAuth(deps, account, () => adapter.prepare(adapterCtx(deps), accessToken, input));
  const sessionId = await deps.db.createSession({ userId, platform, ref: p.ref, input, status: "uploading", url: null, error: null });
  return { sessionId, protocol: p.protocol, uploadUrl: p.uploadUrl, uploadHeaders: p.uploadHeaders, chunkSize: p.chunkSize };
}
```
`handlers/postUpload.ts`
```ts
import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow } from "../types.ts";

/** Free-plan Edge Functions take roughly 10 MB per request and 256 MB of memory; 4 MB pieces stay well inside both. */
export const MAX_RELAY_BYTES = 4 * 1024 * 1024;

export async function ownSession(deps: Deps, userId: string, sessionId: unknown): Promise<PostSessionRow> {
  const s = typeof sessionId === "string" ? await deps.db.getSession(sessionId) : null;
  if (!s || s.userId !== userId) throw new ApiError(404, "not_found", "That upload no longer exists.");
  return s;
}

/** Relay mode only: forwards one piece of the video to the platform with the user's token. Nothing is stored. */
export async function postUpload(deps: Deps, userId: string, q: { sessionId: unknown; offset: unknown; total: unknown }, chunk: Uint8Array): Promise<{ nextOffset: number }> {
  const session = await ownSession(deps, userId, q.sessionId);
  const offset = Number(q.offset), total = Number(q.total);
  if (chunk.length > MAX_RELAY_BYTES) throw new ApiError(413, "too_large", "Upload piece is too large.");
  const adapter = deps.adapters[session.platform];
  if (!adapter?.relayChunk || chunk.length === 0 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(total) || total <= 0 || offset + chunk.length > total)
    throw new ApiError(400, "bad_request", "Bad upload piece.");
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  const r = await withPlatformAuth(deps, account, () => adapter.relayChunk!(adapterCtx(deps), accessToken, session.ref, { offset, total, body: chunk }));
  if (r.ref) await deps.db.updateSession(session.id, { ref: r.ref });
  return { nextOffset: r.nextOffset };
}
```

`handlers/postFinalize.ts`
```ts
import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow, type PublishResult } from "../types.ts";
import { ownSession } from "./postUpload.ts";

export const settled = (s: PostSessionRow): PublishResult | null => (s.status === "done" ? { status: "done", url: s.url } : null);

export async function record(deps: Deps, session: PostSessionRow, run: () => Promise<PublishResult>): Promise<PublishResult> {
  try {
    const r = await run();
    await deps.db.updateSession(session.id, r.status === "done" ? { status: "done", url: r.url } : { status: "processing" });
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.code !== "reconnect") await deps.db.updateSession(session.id, { status: "failed", error: e.message });
    throw e;
  }
}

export async function postFinalize(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const { sessionId, clientResult } = (body ?? {}) as { sessionId?: unknown; clientResult?: unknown };
  const session = await ownSession(deps, userId, sessionId);
  const done = settled(session);
  if (done) return done;
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  const profile = { accountId: account.accountId, displayName: account.displayName, avatarUrl: account.avatarUrl };
  return record(deps, session, () => withPlatformAuth(deps, account, () =>
    adapter.finalize(adapterCtx(deps), accessToken, { ref: session.ref, input: session.input, clientResult: typeof clientResult === "string" ? clientResult : null, account: profile })));
}
```

`handlers/postStatus.ts`
```ts
import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PublishResult } from "../types.ts";
import { record, settled } from "./postFinalize.ts";
import { ownSession } from "./postUpload.ts";

export async function postStatus(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const session = await ownSession(deps, userId, (body as { sessionId?: unknown } | null)?.sessionId);
  const done = settled(session);
  if (done) return done;
  if (session.status === "failed") throw new ApiError(400, "platform_error", session.error ?? "The post failed.");
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  return record(deps, session, () => withPlatformAuth(deps, account, () => adapter.status(adapterCtx(deps), accessToken, session.ref)));
}
```

- [ ] **Step 4: Verify** — `npm run test:server`; `npm run typecheck`.
- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared
git commit -m "feat(server): post prepare / relay upload / finalize / status handlers"
```

---

### Task 5: YouTube server adapter, Deno wiring, setup guide

**Files:**
- Create: `supabase/functions/_shared/platforms/{youtube,registry,http}.ts`, `…/__tests__/youtube.test.ts`, `supabase/functions/_shared/{runtime,supabaseDb}.ts`, `supabase/functions/{oauth-start,oauth-callback,accounts,post-prepare,post-upload,post-finalize,post-status}/index.ts`, `supabase/README.md`

**Interfaces (produced):** `youtube: ServerAdapter`; `adapters: Partial<Record<PlatformId, ServerAdapter>>` (registry); `platformFetch` helpers; `serve(...)` wrappers.

- [ ] **Step 1: Failing tests** — `…/__tests__/youtube.test.ts`

```ts
import { youtube } from "../platforms/youtube.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
function ctx(responses: Array<Response | (() => Response)>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "sec", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); const r = responses.shift()!; return typeof r === "function" ? r() : r; }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers });
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));

test("authUrl asks for offline access with both scopes and the state", () => {
  const u = new URL(youtube.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "ch" }));
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(u.searchParams)).toEqual({
    client_id: "cid", redirect_uri: REDIRECT, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: "st",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  });
});

test("exchange posts the code with the secret and maps the tokens", async () => {
  const { ctx: c, calls } = ctx([ok({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "a b" })]);
  const before = Date.now();
  const t = await youtube.exchange(c, { code: "the-code", codeVerifier: "unused" });
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  expect(calls[0].init.method).toBe("POST");
  expect(form(calls[0].init)).toEqual({ code: "the-code", client_id: "cid", client_secret: "sec", redirect_uri: REDIRECT, grant_type: "authorization_code" });
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: "a b" });
  expect(new Date(t.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + 3600_000 - 5);
});

test("refresh returns a null refresh token when Google sends none", async () => {
  const { ctx: c, calls } = ctx([ok({ access_token: "at2", expires_in: 3600, scope: "a" })]);
  const t = await youtube.refresh(c, "rt");
  expect(form(calls[0].init)).toEqual({ refresh_token: "rt", client_id: "cid", client_secret: "sec", grant_type: "refresh_token" });
  expect(t).toMatchObject({ accessToken: "at2", refreshToken: null });
});

test("token errors surface Google's description", async () => {
  const { ctx: c } = ctx([new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 })]);
  await expect(youtube.refresh(c, "rt")).rejects.toMatchObject({ platform: "youtube", status: 400, message: "Token has been expired or revoked." });
});

test("revoke prefers the refresh token", async () => {
  const { ctx: c, calls } = ctx([ok({})]);
  await youtube.revoke(c, { accessToken: "at", refreshToken: "rt" });
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
  expect(form(calls[0].init)).toEqual({ token: "rt" });
});

test("profile reads the channel; no channel is a clear error", async () => {
  const one = ctx([ok({ items: [{ id: "UC123", snippet: { title: "My Channel", thumbnails: { default: { url: "https://img/a.jpg" } } } }] })]);
  expect(await youtube.profile(one.ctx, "at")).toEqual({ accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img/a.jpg" });
  expect(one.calls[0].url).toBe("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
  expect((one.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
  await expect(youtube.profile(ctx([ok({ items: [] })]).ctx, "at")).rejects.toMatchObject({ message: "This Google account has no YouTube channel yet." });
});

test("prepare opens a resumable session with clean metadata", async () => {
  const { ctx: c, calls } = ctx([new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=XYZ" } })]);
  const r = await youtube.prepare(c, "at", { ...INPUT, caption: "Beach <day> #fun", options: { title: "My <best> day", privacy: "unlisted" } });
  expect(calls[0].url).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
  const h = calls[0].init.headers as Record<string, string>;
  expect(h).toMatchObject({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": "20000000", "X-Upload-Content-Type": "video/mp4" });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({
    snippet: { title: "My best day", description: "Beach day #fun", categoryId: "22" },
    status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
  });
  expect(r).toEqual({ protocol: "google-resumable", uploadUrl: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=XYZ", uploadHeaders: {}, chunkSize: 8388608, ref: {} });
});

test("prepare defaults: title from the caption (≤100 chars), then a fallback; privacy public", async () => {
  const long = "x".repeat(150);
  const a = ctx([new Response(null, { status: 200, headers: { Location: "https://u/1" } })]);
  await youtube.prepare(a.ctx, "at", { ...INPUT, caption: long, options: {} });
  const body = JSON.parse(a.calls[0].init.body as string);
  expect(body.snippet.title).toHaveLength(100);
  expect(body.status.privacyStatus).toBe("public");
  const b = ctx([new Response(null, { status: 200, headers: { Location: "https://u/2" } })]);
  await youtube.prepare(b.ctx, "at", { ...INPUT, caption: "", options: { privacy: "nonsense" } });
  expect(JSON.parse(b.calls[0].init.body as string)).toMatchObject({ snippet: { title: "Clipy video" }, status: { privacyStatus: "public" } });
});

test("prepare can hand the phone a short-lived token when the fallback switch is on", async () => {
  const { ctx: c } = ctx([new Response(null, { status: 200, headers: { Location: "https://u/1" } })], { YOUTUBE_UPLOAD_TOKEN_ON_PHONE: "true" });
  expect((await youtube.prepare(c, "at", INPUT)).uploadHeaders).toEqual({ Authorization: "Bearer at" });
});

test("prepare surfaces Google's API error message and status", async () => {
  const err = { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded" }] } };
  const { ctx: c } = ctx([new Response(JSON.stringify(err), { status: 403 })]);
  await expect(youtube.prepare(c, "at", INPUT)).rejects.toMatchObject({ platform: "youtube", status: 403, message: err.error.message });
  await expect(youtube.prepare(ctx([new Response(null, { status: 200 })]).ctx, "at", INPUT)).rejects.toMatchObject({ message: "YouTube did not return an upload address." });
});

test("finalize builds the link from the uploaded video's id and refuses anything odd", async () => {
  const s = { ref: {}, input: INPUT, account: { accountId: "UC1", displayName: "x", avatarUrl: null } };
  expect(await youtube.finalize(ctx([]).ctx, "at", { ...s, clientResult: '{"kind":"youtube#video","id":"abc123XYZ_-"}' })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  for (const bad of [null, "not json", '{"id":"../../evil"}', "{}"])
    await expect(youtube.finalize(ctx([]).ctx, "at", { ...s, clientResult: bad })).rejects.toMatchObject({ message: "YouTube did not confirm the upload." });
});

test("secrets", () => { expect(youtube.secrets).toEqual(["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]); });
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`platforms/http.ts`
```ts
import { PlatformError } from "../errors.ts";
import type { PlatformId } from "../types.ts";

/** Reads a platform response as JSON; on a non-2xx throws PlatformError with the message `pick` finds (or the raw text). */
export async function readJson<T>(platform: PlatformId, res: Response, pick: (body: unknown) => string | undefined): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new PlatformError(platform, res.status, pick(body) ?? (text.slice(0, 300) || `${platform} returned ${res.status}`));
  return body as T;
}
export const formBody = (params: Record<string, string>) => new URLSearchParams(params).toString();
export const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
```

`platforms/youtube.ts`
```ts
import { PlatformError } from "../errors.ts";
import type { AdapterCtx, ServerAdapter, Tokens } from "../types.ts";
import { FORM, formBody, readJson } from "./http.ts";

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** A multiple of 256 KiB, as the resumable protocol requires for every chunk but the last. */
const CHUNK = 8 * 1024 * 1024;
const PRIVACY = ["public", "unlisted", "private"];
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

const id = (c: AdapterCtx) => c.env.get("YOUTUBE_CLIENT_ID") ?? "";
const secret = (c: AdapterCtx) => c.env.get("YOUTUBE_CLIENT_SECRET") ?? "";
const oauthErr = (b: unknown) => (b as { error_description?: string; error?: string } | null)?.error_description ?? (b as { error?: string } | null)?.error;
const apiErr = (b: unknown) => (b as { error?: { message?: string } } | null)?.error?.message;
/** YouTube rejects angle brackets in titles and descriptions. */
const clean = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

interface TokenBody { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
const toTokens = (b: TokenBody): Tokens => ({
  accessToken: b.access_token, refreshToken: b.refresh_token ?? null,
  expiresAt: typeof b.expires_in === "number" ? new Date(Date.now() + b.expires_in * 1000).toISOString() : null, scopes: b.scope ?? "",
});

export const youtube: ServerAdapter = {
  id: "youtube",
  secrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],

  // Google documents PKCE only for native clients; this is a confidential web client, so state + secret protect the flow.
  authUrl(c, { state }) {
    const q = new URLSearchParams({ client_id: id(c), redirect_uri: c.redirectUri, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(c, { code }) {
    const res = await c.fetch(TOKEN_URL, { method: "POST", headers: FORM, body: formBody({ code, client_id: id(c), client_secret: secret(c), redirect_uri: c.redirectUri, grant_type: "authorization_code" }) });
    return toTokens(await readJson<TokenBody>("youtube", res, oauthErr));
  },
  async refresh(c, refreshToken) {
    const res = await c.fetch(TOKEN_URL, { method: "POST", headers: FORM, body: formBody({ refresh_token: refreshToken, client_id: id(c), client_secret: secret(c), grant_type: "refresh_token" }) });
    return toTokens(await readJson<TokenBody>("youtube", res, oauthErr));
  },
  async revoke(c, t) {
    await c.fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: FORM, body: formBody({ token: t.refreshToken ?? t.accessToken }) });
  },
  async profile(c, accessToken) {
    const res = await c.fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
    const b = await readJson<{ items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }> }>("youtube", res, apiErr);
    const ch = b.items?.[0];
    if (!ch) throw new PlatformError("youtube", 400, "This Google account has no YouTube channel yet.");
    return { accountId: ch.id, displayName: ch.snippet.title, avatarUrl: ch.snippet.thumbnails?.default?.url ?? null };
  },
  async prepare(c, accessToken, input) {
    const o = input.options as { title?: unknown; privacy?: unknown };
    const description = clean(input.caption);
    const title = (clean(typeof o.title === "string" ? o.title : "") || description || "Clipy video").slice(0, 100);
    const privacyStatus = PRIVACY.includes(o.privacy as string) ? (o.privacy as string) : "public";
    const res = await c.fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(input.fileSize), "X-Upload-Content-Type": input.mimeType },
      body: JSON.stringify({ snippet: { title, description, categoryId: "22" }, status: { privacyStatus, selfDeclaredMadeForKids: false } }),
    });
    if (!res.ok) await readJson("youtube", res, apiErr);
    const uploadUrl = res.headers.get("Location");
    if (!uploadUrl) throw new PlatformError("youtube", 502, "YouTube did not return an upload address.");
    // Whether the session URL alone authorises the upload is undocumented for YouTube; this switch sends a short-lived token to the phone instead.
    const uploadHeaders = c.env.get("YOUTUBE_UPLOAD_TOKEN_ON_PHONE") === "true" ? { Authorization: `Bearer ${accessToken}` } : {};
    return { protocol: "google-resumable", uploadUrl, uploadHeaders, chunkSize: CHUNK, ref: {} };
  },
  async finalize(_c, _t, { clientResult }) {
    let videoId: unknown;
    try { videoId = (JSON.parse(clientResult ?? "") as { id?: unknown }).id; } catch { /* handled below */ }
    if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) throw new PlatformError("youtube", 502, "YouTube did not confirm the upload.");
    return { status: "done", url: `https://youtu.be/${videoId}` };
  },
  async status() { return { status: "done", url: null }; },
};
```

`platforms/registry.ts`
```ts
import type { PlatformId, ServerAdapter } from "../types.ts";
import { youtube } from "./youtube.ts";

/** One entry per platform that has a server adapter. Plans 4B–4D add tiktok, instagram, facebook and x. */
export const adapters: Partial<Record<PlatformId, ServerAdapter>> = { youtube };
```

**Deno wiring (not unit-tested; verify every API below against the current Supabase Edge Functions docs before writing — `Deno.serve` vs `export default { fetch }`, how to read the caller's user from the JWT, the env var names for the project URL and the secret/service key — and note the doc URLs in the report).**

`_shared/supabaseDb.ts` — implements `Db` over a service-role supabase-js client: maps `AccountRow` ↔ `connected_accounts` (snake_case columns), `OAuthStateRow` ↔ `oauth_states` (`takeState` = `delete().eq("state", s).select().maybeSingle()`), `PostSessionRow` ↔ `post_sessions` (`ref` ↔ `platform_ref`). Every call throws `ApiError(500, "internal", …)` on a database error. Keep it a thin mapping, mirroring `memoryDb.ts` behaviour exactly.

`_shared/runtime.ts`
```ts
// Deno-only glue shared by every function's index.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importKey } from "./crypto.ts";
import { ApiError, json, toResponse } from "./errors.ts";
import { adapters } from "./platforms/registry.ts";
import { supabaseDb } from "./supabaseDb.ts";
import type { Deps } from "./types.ts";

const env = { get: (n: string) => Deno.env.get(n) };
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export function makeDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key: Promise<CryptoKey> | null = null;
  return {
    db: supabaseDb(admin()), env, fetch, now: () => new Date(), adapters,
    key: () => (key ??= importKey(Deno.env.get("TOKEN_ENC_KEY") ?? "")),
    callbackUrl: `${url}/functions/v1/oauth-callback`,
  };
}

/** The signed-in user's id from the Authorization header, verified by Supabase Auth. */
export async function userId(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");
  return data.user.id;
}

/** Wraps a JSON handler: auth → parse → handle → JSON, with errors mapped by toResponse. */
export function serveJson(handle: (deps: Deps, user: string, body: unknown, req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    try {
      const user = await userId(req);
      const body = req.method === "GET" || req.method === "DELETE" ? null : await req.json().catch(() => null);
      return json(await handle(makeDeps(), user, body, req));
    } catch (e) { return toResponse(e); }
  });
}
```

Function entrypoints (each `supabase/functions/<name>/index.ts`):
```ts
// oauth-start/index.ts
import { oauthStart } from "../_shared/handlers/oauthStart.ts";
import { serveJson } from "../_shared/runtime.ts";
serveJson((deps, user, body) => oauthStart(deps, user, body));
```
```ts
// oauth-callback/index.ts  (public: verify_jwt = false in config.toml)
import { toResponse } from "../_shared/errors.ts";
import { oauthCallback } from "../_shared/handlers/oauthCallback.ts";
import { makeDeps } from "../_shared/runtime.ts";
Deno.serve(async (req) => {
  try { return Response.redirect((await oauthCallback(makeDeps(), new URL(req.url))).redirect, 302); }
  catch (e) { return toResponse(e); }
});
```
```ts
// accounts/index.ts
import { disconnect, listAccounts } from "../_shared/handlers/accounts.ts";
import { serveJson } from "../_shared/runtime.ts";
serveJson((deps, user, _body, req) => req.method === "DELETE" ? disconnect(deps, user, new URL(req.url).searchParams.get("platform")) : listAccounts(deps, user));
```
```ts
// post-prepare/index.ts, post-finalize/index.ts, post-status/index.ts — same shape:
import { postPrepare } from "../_shared/handlers/postPrepare.ts";
import { serveJson } from "../_shared/runtime.ts";
serveJson((deps, user, body) => postPrepare(deps, user, body));
```
```ts
// post-upload/index.ts  (binary body; headers x-session-id, x-offset, x-total)
import { json, toResponse } from "../_shared/errors.ts";
import { postUpload } from "../_shared/handlers/postUpload.ts";
import { makeDeps, userId } from "../_shared/runtime.ts";
Deno.serve(async (req) => {
  try {
    const user = await userId(req);
    const chunk = new Uint8Array(await req.arrayBuffer());   // ≤ 4 MB, enforced in the handler
    return json(await postUpload(makeDeps(), user, { sessionId: req.headers.get("x-session-id"), offset: req.headers.get("x-offset"), total: req.headers.get("x-total") }, chunk));
  } catch (e) { return toResponse(e); }
});
```
`Response.redirect` to a custom scheme (`exp://`, `clipy://`): confirm Deno accepts non-HTTP URLs there; if it throws, return `new Response(null, { status: 302, headers: { Location: redirect } })`.

`supabase/README.md` — a step-by-step guide written for a non-developer, in this order, each step numbered with the exact words to click (mark any label you could not confirm on the live page as "may be named slightly differently"):
1. **Create the Supabase project** (supabase.com → New project; copy Project URL and the publishable/anon key into `.env` from `.env.example`).
2. **Turn on Sign in with Apple** (Authentication → Sign In / Providers → Apple → Client IDs: `host.exp.Exponent` for Expo Go; add `com.clipy.app` later for the real app).
3. **Install the Supabase CLI and deploy** (`npx.cmd supabase login`; `npx.cmd supabase link --project-ref <ref>`; `npx.cmd supabase db push`; `npx.cmd supabase functions deploy`), with one command per fenced block.
4. **Set the secrets** (`TOKEN_ENC_KEY` — include the exact PowerShell one-liner to generate 32 random bytes as base64; `YOUTUBE_CLIENT_ID`; `YOUTUBE_CLIENT_SECRET`; optional `YOUTUBE_UPLOAD_TOKEN_ON_PHONE`).
5. **YouTube: get a Google client** (Google Cloud Console: new project → enable "YouTube Data API v3" → OAuth consent screen: External, add yourself as test user, then **Publish app** so the connection doesn't expire weekly → Credentials → OAuth client ID → Web application → Authorized redirect URI `https://<ref>.supabase.co/functions/v1/oauth-callback`).
6. **What to expect**: the "Google hasn't verified this app" screen (Advanced → Go to Clipy); uploads arrive **private** until Google audits the project — open the video in YouTube and switch it to Public; free projects go to sleep after a week unused (wake from the dashboard); if uploads fail at 0 % with a 401/403, set `YOUTUBE_UPLOAD_TOKEN_ON_PHONE=true`.
7. **Troubleshooting** table: symptom → cause → fix (Not available yet; Reconnect; Server is asleep; quota exceeded).

- [ ] **Step 4: Verify** — `npm run test:server` (all green); `npm run typecheck`; `npm run test:app` unaffected. Re-read every `index.ts` against the docs you fetched.
- [ ] **Step 5: Commit**

```powershell
git add supabase
git commit -m "feat(server): YouTube adapter, Edge Function entrypoints, setup guide"
```

---

### Task 6: Project schema v4 — post records

**Files:**
- Modify: `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/store.ts`, `src/projects/storage.ts`, `src/projects/ProjectCard.tsx`
- Test: `src/editor/model/__tests__/migrate.test.ts` (extend), `src/editor/__tests__/store.posts.test.ts` (new), `src/projects/__tests__/storage.test.ts` + `ProjectCard.test.tsx` (extend)

**Interfaces (produced):**
```ts
// types.ts
export const SCHEMA_VERSION = 4 as const;
export const POST_PLATFORMS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
export interface PostRecord { platform: PostPlatform; url: string | null; postedAt: string }
export interface Project { /* …existing… */ posts: PostRecord[] }          // makeProject default: posts: []
// store.ts
addPostRecord: (record: PostRecord) => void      // marks dirty; not an undo step; survives undo/redo
// storage.ts
export interface ProjectSummary { /* …existing… */ postedTo: PostPlatform[] }   // unique, in POST_PLATFORMS order; [] for broken
```

- [ ] **Step 1: Failing tests**

Append to `migrate.test.ts`:
```ts
test("v3 → v4 adds an empty posts list; v4 keeps valid records and drops junk", () => {
  const v3 = { ...makeProject(), schemaVersion: 3 } as Record<string, unknown>;
  delete v3.posts;
  expect(migrateProject(v3)).toMatchObject({ schemaVersion: 4, posts: [] });
  const good = { platform: "youtube", url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" };
  const v4 = { ...makeProject(), posts: [good, { platform: "myspace", url: "x", postedAt: "y" }, "nope", { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }] };
  expect(migrateProject(v4).posts).toEqual([good, { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }]);
});
```
(Update any existing assertion in this repo that pins `schemaVersion` 3 as "current" to use `SCHEMA_VERSION`; the "newer version is rejected" test should use `SCHEMA_VERSION + 1`.)

`src/editor/__tests__/store.posts.test.ts`
```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { renameProject } from "@/src/editor/model/ops";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";

const rec = { platform: "youtube" as const, url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" };
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject()); });

test("addPostRecord appends, marks dirty and is not an undo step", () => {
  useEditorStore.getState().addPostRecord(rec);
  const s = useEditorStore.getState();
  expect(s.project!.posts).toEqual([rec]);
  expect(s.dirty).toBe(true);
  expect(s.past).toHaveLength(0);
});

test("post records survive undo and redo", () => {
  const s = useEditorStore.getState();
  s.apply((p) => renameProject(p, "Renamed"));
  s.addPostRecord(rec);
  useEditorStore.getState().undo();
  expect(useEditorStore.getState().project).toMatchObject({ name: "Project 1", posts: [rec] });
  useEditorStore.getState().redo();
  expect(useEditorStore.getState().project).toMatchObject({ name: "Renamed", posts: [rec] });
});

test("no project → no-op", () => {
  useEditorStore.getState().reset();
  expect(() => useEditorStore.getState().addPostRecord(rec)).not.toThrow();
});
```

Storage test: a saved project with posts `[youtube, youtube, tiktok]` lists `postedTo: ["youtube", "tiktok"]`; a new project has `posts: []`. ProjectCard test: with `postedTo: ["youtube", "tiktok"]` the second line reads `Posted · YouTube, TikTok`; with `[]` it reads the edited label as before.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**
- `types.ts`: the additions above; `Project` gains `posts`; `makeProject` default `posts: []`.
- `migrate.ts`: rename `normaliseV3` → `normaliseCurrent`; it returns `schemaVersion: SCHEMA_VERSION` and
  ```ts
  const posts = (Array.isArray(raw.posts) ? raw.posts : []).filter((r): r is PostRecord =>
    isObj(r) && (POST_PLATFORMS as readonly unknown[]).includes(r.platform) && (typeof r.url === "string" || r.url === null) && typeof r.postedAt === "string");
  ```
  Update the doc comment ("v2, v3 or v4 file to a safe v4 shape").
- `store.ts`:
  ```ts
  addPostRecord: (record) => {
    const s = get();
    if (!s.project) return;
    set({ project: { ...s.project, posts: [...s.project.posts, record] }, dirty: true });
  },
  ```
  and in `undo` / `redo` carry the live list across: `const prevWithPosts = { ...prev, posts: s.project.posts }` (same for `next`), so a post made after an edit is never lost by undoing the edit. History snapshots pushed in `undo`/`redo` stay as they are.
- `storage.ts`: `createProject` writes `posts: []`; `listProjects` adds `postedTo: POST_PLATFORMS.filter((id) => p.posts.some((r) => r.platform === id))` (and `postedTo: []` for broken).
- `ProjectCard.tsx`: second line = `summary.postedTo.length ? `Posted · ${summary.postedTo.map((id) => PLATFORM_LABELS[id]).join(", ")}` : editedLabel(...)`. Put `PLATFORM_LABELS: Record<PostPlatform, string>` (`YouTube`, `TikTok`, `Instagram`, `Facebook`, `X`) in `src/editor/model/types.ts` next to `POST_PLATFORMS` so the model and UI share one list.
- Fix every other place that builds a `Project` or `ProjectSummary` literal (Grep `schemaVersion: SCHEMA_VERSION`, `broken:`) so typecheck passes.

- [ ] **Step 4: Verify** — `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/editor/model src/editor/store.ts src/editor/__tests__/store.posts.test.ts src/projects
git commit -m "feat(model): schema v4 post records, shown on the project card"
```

---

### Task 7: App plumbing — platforms, client adapter, Supabase client, API, session

**Files:**
- Create: `src/publish/{platforms,supabase,api,useSession}.ts`, `src/publish/adapters/{types,youtube,index}.ts`, `src/publish/__tests__/{adapters,api,supabase}.test.ts`
- Modify: `jest.setup.ts` (mocks), `package.json` (via `npx.cmd expo install @supabase/supabase-js expo-sqlite expo-apple-authentication expo-web-browser`), `app.json` (`ios.usesAppleSignIn: true`)

**Interfaces (produced):**
```ts
// platforms.ts
export type PlatformId = PostPlatform;  export const PLATFORM_IDS = POST_PLATFORMS;
export const PLATFORMS: Record<PlatformId, { label: string; icon: keyof typeof Ionicons.glyphMap }>;
// adapters/types.ts
export interface VideoInfo { fileUri: string; fileSize: number; durationSec: number; mimeType: string }
export interface ClientAdapter {
  id: PlatformId; captionMax: number;
  defaultOptions(title: string): Record<string, unknown>;
  /** A sentence to show the user, or null when the video and options are acceptable. */
  validate(video: VideoInfo, caption: string, options: Record<string, unknown>): string | null;
  /** Standing note shown on the row (platform rules the user should know), or null. */
  note(video: VideoInfo): string | null;
}
// adapters/index.ts
export const clientAdapters: Partial<Record<PlatformId, ClientAdapter>>;   // { youtube }
// supabase.ts
export function isBackendConfigured(): boolean
export function getSupabase(): SupabaseClient | null
export function signInWithApple(): Promise<"ok" | "cancelled">    // throws Error(message) on failure
export function signOut(): Promise<void>
// api.ts
export class ApiFailure extends Error { constructor(public code: string, message: string) }
export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }
export type UploadProtocol = "google-resumable" | "relay";
export interface Prepared { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number }
export type PublishResult = { status: "done"; url: string | null } | { status: "processing" };
export const api: {
  accounts(): Promise<PlatformStatus[]>;
  disconnect(platform: PlatformId): Promise<void>;
  oauthStart(platform: PlatformId, returnUrl: string): Promise<string>;       // authUrl
  prepare(body: { platform: PlatformId; fileSize: number; durationSec: number; mimeType: string; caption: string; options: Record<string, unknown> }): Promise<Prepared>;
  uploadChunk(sessionId: string, offset: number, total: number, bytes: Uint8Array): Promise<{ nextOffset: number }>;
  finalize(sessionId: string, clientResult: string | null): Promise<PublishResult>;
  status(sessionId: string): Promise<PublishResult>;
};
// useSession.ts
export type SessionState = { status: "unconfigured" | "loading" | "signedOut" } | { status: "signedIn"; email: string | null };
export function useSession(): SessionState
```

- [ ] **Step 1: Install + mocks**

Run the `expo install` line above; confirm `npx.cmd expo-doctor` stays 21/21. Add to `jest.setup.ts`:
```ts
jest.mock("expo-sqlite/localStorage/install", () => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  return {};
});
jest.mock("expo-apple-authentication", () => {
  const { View } = require("react-native");
  return { isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn(), AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButton: View, AppleAuthenticationButtonType: { SIGN_IN: 0 }, AppleAuthenticationButtonStyle: { WHITE: 0 } };
});
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
```
`app.json`: add `"usesAppleSignIn": true` under `ios` (ignored by Expo Go; needed for the real build).

- [ ] **Step 2: Failing tests**

`src/publish/__tests__/adapters.test.ts`
```ts
import { clientAdapters } from "../adapters";
import { PLATFORM_IDS, PLATFORMS } from "../platforms";

const video = { fileUri: "file:///v.mp4", fileSize: 20_000_000, durationSec: 21, mimeType: "video/mp4" };

test("every platform has a label and an icon", () => {
  expect(PLATFORM_IDS).toEqual(["youtube", "tiktok", "instagram", "facebook", "x"]);
  for (const id of PLATFORM_IDS) { expect(PLATFORMS[id].label.length).toBeGreaterThan(0); expect(PLATFORMS[id].icon).toBeTruthy(); }
});

test("youtube: defaults, limits and the private-until-audit note", () => {
  const yt = clientAdapters.youtube!;
  expect(yt.defaultOptions("x".repeat(150))).toEqual({ title: "x".repeat(100), privacy: "public" });
  expect(yt.validate(video, "hello", { title: "Beach day", privacy: "public" })).toBeNull();
  expect(yt.validate(video, "hello", { title: "x".repeat(101), privacy: "public" })).toBe("YouTube titles can be up to 100 characters.");
  expect(yt.validate(video, "hello", { title: "  ", privacy: "public" })).toBe("Add a title for YouTube.");
  expect(yt.validate(video, "x".repeat(5001), { title: "t", privacy: "public" })).toBe("YouTube descriptions can be up to 5000 characters.");
  expect(yt.note(video)).toMatch(/private until Google reviews/i);
  expect(yt.note({ ...video, durationSec: 200 })).toMatch(/regular video, not a Short/i);
});
```

`src/publish/__tests__/api.test.ts`
```ts
jest.mock("../supabase", () => ({ getSupabase: jest.fn(), backendUrl: () => "https://ref.supabase.co", backendKey: () => "pk" }));
import { api, ApiFailure } from "../api";
import { getSupabase } from "../supabase";

const session = (token: string | null) => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } });
const fetchMock = jest.fn();
beforeEach(() => { fetchMock.mockReset(); (globalThis as { fetch: unknown }).fetch = fetchMock; (getSupabase as jest.Mock).mockReturnValue(session("jwt")); });
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("accounts sends the session token and returns the platform list", async () => {
  fetchMock.mockResolvedValue(res(200, { platforms: [{ id: "youtube", available: true, connected: false, name: null, avatarUrl: null, needsReconnect: false }] }));
  expect(await api.accounts()).toHaveLength(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://ref.supabase.co/functions/v1/accounts");
  expect(init.headers).toMatchObject({ Authorization: "Bearer jwt", apikey: "pk" });
});

test("prepare posts JSON; disconnect uses DELETE with a query", async () => {
  fetchMock.mockResolvedValue(res(200, { sessionId: "s1", protocol: "google-resumable", uploadUrl: "https://u", uploadHeaders: {}, chunkSize: 8 }));
  await api.prepare({ platform: "youtube", fileSize: 1, durationSec: 1, mimeType: "video/mp4", caption: "c", options: {} });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ platform: "youtube", fileSize: 1, durationSec: 1, mimeType: "video/mp4", caption: "c", options: {} }) });
  fetchMock.mockResolvedValue(res(200, { ok: true }));
  await api.disconnect("youtube");
  expect(fetchMock.mock.calls[1][0]).toBe("https://ref.supabase.co/functions/v1/accounts?platform=youtube");
  expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
});

test("uploadChunk sends raw bytes with the session headers", async () => {
  fetchMock.mockResolvedValue(res(200, { nextOffset: 3 }));
  const bytes = new Uint8Array([1, 2, 3]);
  expect(await api.uploadChunk("s1", 0, 10, bytes)).toEqual({ nextOffset: 3 });
  const init = fetchMock.mock.calls[0][1];
  expect(init.body).toBe(bytes);
  expect(init.headers).toMatchObject({ "x-session-id": "s1", "x-offset": "0", "x-total": "10", "Content-Type": "application/octet-stream" });
});

test("failures map to ApiFailure codes", async () => {
  fetchMock.mockResolvedValue(res(401, { code: "reconnect", message: "Reconnect youtube in Accounts." }));
  await expect(api.status("s1")).rejects.toMatchObject({ code: "reconnect", message: "Reconnect youtube in Accounts." });
  fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("html"); } });
  await expect(api.status("s1")).rejects.toMatchObject({ code: "internal" });
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(api.status("s1")).rejects.toMatchObject({ code: "unreachable" });
  (getSupabase as jest.Mock).mockReturnValue(session(null));
  await expect(api.accounts()).rejects.toMatchObject({ code: "signed_out" });
  (getSupabase as jest.Mock).mockReturnValue(null);
  await expect(api.accounts()).rejects.toBeInstanceOf(ApiFailure);
  await expect(api.accounts()).rejects.toMatchObject({ code: "not_configured" });
});
```

`src/publish/__tests__/supabase.test.ts`
```ts
const signInWithIdToken = jest.fn(async () => ({ error: null }));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: { signInWithIdToken, signOut: jest.fn(async () => ({ error: null })) } })) }));
import * as Apple from "expo-apple-authentication";

const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
afterEach(() => { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

test("not configured without both env vars", () => {
  const m = load();
  expect(m.isBackendConfigured()).toBe(false);
  expect(m.getSupabase()).toBeNull();
});

test("Apple sign-in hands the identity token to Supabase; cancel is quiet; failures carry a message", async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk";
  const m = load();
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: "apple-jwt" });
  expect(await m.signInWithApple()).toBe("ok");
  expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-jwt" });
  (Apple.signInAsync as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("cancel"), { code: "ERR_REQUEST_CANCELED" }));
  expect(await m.signInWithApple()).toBe("cancelled");
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: null });
  await expect(m.signInWithApple()).rejects.toThrow("Apple didn't return a sign-in token.");
  signInWithIdToken.mockResolvedValueOnce({ error: { message: "Unacceptable audience in id_token" } } as never);
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: "apple-jwt" });
  await expect(m.signInWithApple()).rejects.toThrow("Unacceptable audience in id_token");
});
```
(If Babel inlines `process.env.EXPO_PUBLIC_*` at transform time under jest-expo so the test cannot change them, read them through a tiny `env.ts` — `export const env = () => ({ url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_KEY })` — and mock that module in the test instead. Say which approach you used.)

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement**

`platforms.ts`
```ts
import type { Ionicons } from "@expo/vector-icons";
import { PLATFORM_LABELS, POST_PLATFORMS, type PostPlatform } from "@/src/editor/model/types";

export type PlatformId = PostPlatform;
export const PLATFORM_IDS = POST_PLATFORMS;
type Icon = keyof typeof Ionicons.glyphMap;
const ICONS: Record<PlatformId, Icon> = { youtube: "logo-youtube", tiktok: "logo-tiktok", instagram: "logo-instagram", facebook: "logo-facebook", x: "logo-twitter" };
export const PLATFORMS = Object.fromEntries(PLATFORM_IDS.map((id) => [id, { label: PLATFORM_LABELS[id], icon: ICONS[id] }])) as Record<PlatformId, { label: string; icon: Icon }>;
```
(Check the installed Ionicons glyph map for each name; use `logo-x` for X if it exists.)

`adapters/youtube.ts`
```ts
import type { ClientAdapter } from "./types";

const SHORT_MAX_SEC = 180;

export const youtube: ClientAdapter = {
  id: "youtube",
  captionMax: 5000,
  defaultOptions: (title) => ({ title: title.slice(0, 100), privacy: "public" }),
  validate(_video, caption, options) {
    const title = typeof options.title === "string" ? options.title.trim() : "";
    if (!title) return "Add a title for YouTube.";
    if (title.length > 100) return "YouTube titles can be up to 100 characters.";
    if (caption.length > 5000) return "YouTube descriptions can be up to 5000 characters.";
    return null;
  },
  note(video) {
    const base = "YouTube keeps uploads from new apps private until Google reviews Clipy. Open the video in YouTube to make it public.";
    return video.durationSec > SHORT_MAX_SEC ? `${base} Longer than 3 minutes, so it posts as a regular video, not a Short.` : base;
  },
};
```
`adapters/index.ts`: `export const clientAdapters: Partial<Record<PlatformId, ClientAdapter>> = { youtube };` and re-export the types.

`supabase.ts`
```ts
import "expo-sqlite/localStorage/install";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";

export const backendUrl = () => process.env.EXPO_PUBLIC_SUPABASE_URL;
export const backendKey = () => process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const isBackendConfigured = () => !!backendUrl() && !!backendKey();

let client: SupabaseClient | null = null;
/** The Supabase client, or null when the app was built without backend settings (posting is then simply unavailable). */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  client ??= createClient(backendUrl()!, backendKey()!, { auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
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
```

`api.ts`
```ts
import type { PlatformId } from "./platforms";
import { backendKey, backendUrl, getSupabase } from "./supabase";

export class ApiFailure extends Error { constructor(public code: string, message: string) { super(message); } }
export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }
export type UploadProtocol = "google-resumable" | "relay";
export interface Prepared { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number }
export type PublishResult = { status: "done"; url: string | null } | { status: "processing" };

type Init = { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; json?: unknown; bytes?: Uint8Array; headers?: Record<string, string> };

async function call<T>(name: string, init: Init = {}): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new ApiFailure("not_configured", "Posting isn't set up yet.");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiFailure("signed_out", "Sign in to Clipy first.");
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/functions/v1/${name}${qs}`, {
      method: init.method ?? (init.json !== undefined || init.bytes ? "POST" : "GET"),
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: backendKey()!, ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
      body: init.bytes ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    });
  } catch {
    throw new ApiFailure("unreachable", "Clipy's server is asleep or unreachable. Open the Supabase dashboard to wake it, then try again.");
  }
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!res.ok) throw new ApiFailure(body?.code ?? "internal", body?.message ?? "Something went wrong.");
  return body as T;
}

export const api = {
  accounts: async () => (await call<{ platforms: PlatformStatus[] }>("accounts")).platforms,
  disconnect: async (platform: PlatformId) => { await call("accounts", { method: "DELETE", query: { platform } }); },
  oauthStart: async (platform: PlatformId, returnUrl: string) => (await call<{ authUrl: string }>("oauth-start", { json: { platform, returnUrl } })).authUrl,
  prepare: (body: { platform: PlatformId; fileSize: number; durationSec: number; mimeType: string; caption: string; options: Record<string, unknown> }) => call<Prepared>("post-prepare", { json: body }),
  uploadChunk: (sessionId: string, offset: number, total: number, bytes: Uint8Array) =>
    call<{ nextOffset: number }>("post-upload", { bytes, headers: { "Content-Type": "application/octet-stream", "x-session-id": sessionId, "x-offset": String(offset), "x-total": String(total) } }),
  finalize: (sessionId: string, clientResult: string | null) => call<PublishResult>("post-finalize", { json: { sessionId, clientResult } }),
  status: (sessionId: string) => call<PublishResult>("post-status", { json: { sessionId } }),
};
```

`useSession.ts`
```ts
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
```
Verify `signInWithIdToken`, `onAuthStateChange`, `startAutoRefresh` and the storage option against the current supabase-js and Expo "Using Supabase" docs.

- [ ] **Step 5: Verify** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`.
- [ ] **Step 6: Commit**

```powershell
git add src/publish jest.setup.ts package.json package-lock.json app.json
git commit -m "feat(publish): platforms, YouTube client rules, Supabase client, typed API, session hook"
```

---

### Task 8: Chunked uploader

**Files:**
- Create: `src/publish/{fileReader,upload}.ts`, `src/publish/__tests__/upload.test.ts`

**Interfaces (produced):**
```ts
// fileReader.ts
export interface ChunkReader { size: number; read(offset: number, length: number): Uint8Array; close(): void }
export function openReader(uri: string): ChunkReader
// upload.ts
export class UploadError extends Error { constructor(message: string, public resumable: boolean) }
export interface UploadArgs { reader: ChunkReader; mimeType: string; chunkSize: number; onProgress(fraction: number): void; signal: AbortSignal; resume?: boolean; sleep?(ms: number): Promise<void> }
/** Google resumable protocol (YouTube). Resolves with the final response body (the video resource JSON). */
export function uploadGoogleResumable(url: string, headers: Record<string, string>, a: UploadArgs): Promise<string>
/** Sends ≤ chunkSize pieces through `send` (our post-upload function). */
export function uploadRelay(send: (offset: number, total: number, bytes: Uint8Array) => Promise<{ nextOffset: number }>, a: UploadArgs): Promise<void>
export const MAX_ATTEMPTS = 3
```

- [ ] **Step 1: Failing tests** — `src/publish/__tests__/upload.test.ts`

```ts
import { ApiFailure } from "../api";
import { uploadGoogleResumable, UploadError, uploadRelay } from "../upload";

const data = Uint8Array.from({ length: 10 }, (_, i) => i);
const reader = () => ({ size: data.length, read: jest.fn((o: number, n: number) => data.slice(o, o + n)), close: jest.fn() });
const fetchMock = jest.fn();
const r = (status: number, headers: Record<string, string> = {}, text = "") => ({ status, headers: { get: (k: string) => headers[k] ?? null }, text: async () => text });
const args = (over = {}) => ({ reader: reader(), mimeType: "video/mp4", chunkSize: 4, onProgress: jest.fn(), signal: new AbortController().signal, sleep: jest.fn(async () => {}), ...over });
beforeEach(() => { fetchMock.mockReset(); (globalThis as { fetch: unknown }).fetch = fetchMock; });

test("uploads in chunks with Content-Range, follows the server's Range, and returns the final body", async () => {
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-3" })).mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, '{"id":"abc"}'));
  const a = args();
  expect(await uploadGoogleResumable("https://u/s", { Authorization: "Bearer t" }, a)).toBe('{"id":"abc"}');
  const ranges = fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"]);
  expect(ranges).toEqual(["bytes 0-3/10", "bytes 4-7/10", "bytes 8-9/10"]);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer t", "Content-Type": "video/mp4" } });
  expect(Array.from(fetchMock.mock.calls[2][1].body)).toEqual([8, 9]);
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4, 0.8, 1]);
});

test("a partial acknowledgement re-sends from where the server stopped", async () => {
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-1" })).mockResolvedValueOnce(r(308, { Range: "bytes=0-5" })).mockResolvedValueOnce(r(200, {}, "{}"));
  await uploadGoogleResumable("https://u/s", {}, args());
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes 2-5/10", "bytes 6-9/10"]);
});

test("a dropped connection backs off, asks the server how far it got, and carries on", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"))
    .mockResolvedValueOnce(r(308, { Range: "bytes=0-3" }))            // status query
    .mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, "{}"));
  const a = args();
  await uploadGoogleResumable("https://u/s", {}, a);
  expect(fetchMock.mock.calls[1][1].headers["Content-Range"]).toBe("bytes */10");
  expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  expect(a.sleep).toHaveBeenCalledWith(1000);
  expect(fetchMock.mock.calls[2][1].headers["Content-Range"]).toBe("bytes 4-7/10");
});

test("three failures in a row give a resumable error; resume starts with a status query", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: true, message: "The connection dropped. Check your internet, then resume." });
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, "{}"));
  await uploadGoogleResumable("https://u/s", {}, args({ resume: true }));
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes */10", "bytes 8-9/10"]);
});

test("an expired session and other 4xx are final; the platform's text is kept", async () => {
  fetchMock.mockResolvedValueOnce(r(404));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: false, message: "The upload session expired. Post again." });
  fetchMock.mockResolvedValueOnce(r(403, {}, '{"error":{"message":"Forbidden for this channel"}}'));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: false, message: "Forbidden for this channel" });
});

test("cancel stops before the next chunk and closes nothing twice", async () => {
  const ac = new AbortController();
  fetchMock.mockImplementationOnce(async () => { ac.abort(); return r(308, { Range: "bytes=0-3" }); });
  await expect(uploadGoogleResumable("https://u/s", {}, args({ signal: ac.signal }))).rejects.toMatchObject({ message: "Upload cancelled.", resumable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("relay sends pieces through the function and follows nextOffset", async () => {
  const send = jest.fn().mockResolvedValueOnce({ nextOffset: 4 }).mockResolvedValueOnce({ nextOffset: 8 }).mockResolvedValueOnce({ nextOffset: 10 });
  const a = args();
  await uploadRelay(send, a);
  expect(send.mock.calls.map((c) => [c[0], c[1], c[2].length])).toEqual([[0, 10, 4], [4, 10, 4], [8, 10, 2]]);
  expect(a.onProgress).toHaveBeenLastCalledWith(1);
});

test("relay retries unreachable/internal, gives up resumably, and passes other failures through", async () => {
  const send = jest.fn().mockRejectedValueOnce(new ApiFailure("unreachable", "x")).mockResolvedValue({ nextOffset: 10 });
  await uploadRelay(send, args({ chunkSize: 10 }));
  expect(send).toHaveBeenCalledTimes(2);
  const dead = jest.fn().mockRejectedValue(new ApiFailure("unreachable", "x"));
  await expect(uploadRelay(dead, args())).rejects.toBeInstanceOf(UploadError);
  const denied = jest.fn().mockRejectedValue(new ApiFailure("reconnect", "Reconnect"));
  await expect(uploadRelay(denied, args())).rejects.toMatchObject({ code: "reconnect" });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`fileReader.ts`
```ts
import { File, FileMode } from "expo-file-system";

export interface ChunkReader { size: number; read(offset: number, length: number): Uint8Array; close(): void }

/** Reads byte ranges straight from disk. (File.slice and Blob bodies load the whole video into memory — never use them.) */
export function openReader(uri: string): ChunkReader {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  return {
    size: file.size,
    read(offset, length) { handle.offset = offset; return handle.readBytes(length); },
    close() { try { handle.close(); } catch { /* already closed */ } },
  };
}
```
Confirm `File`, `FileMode.ReadOnly`, `open()`, `offset`, `readBytes()` and `size` against `node_modules/expo-file-system/build/*.d.ts` and the v57 docs; adjust names if they differ.

`upload.ts`
```ts
import { ApiFailure } from "./api";
import type { ChunkReader } from "./fileReader";

export class UploadError extends Error { constructor(message: string, public resumable: boolean) { super(message); } }
export interface UploadArgs { reader: ChunkReader; mimeType: string; chunkSize: number; onProgress(fraction: number): void; signal: AbortSignal; resume?: boolean; sleep?(ms: number): Promise<void> }
export const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cancelled = () => new UploadError("Upload cancelled.", false);
const dropped = () => new UploadError("The connection dropped. Check your internet, then resume.", true);
/** "bytes=0-524287" → 524288 (the next byte the server wants); no header → nothing stored yet. */
const nextFromRange = (h: string | null) => { const m = /bytes=0-(\d+)/.exec(h ?? ""); return m ? Number(m[1]) + 1 : 0; };
async function platformText(res: { text(): Promise<string> }, fallback: string): Promise<string> {
  const t = await res.text().catch(() => "");
  try { return (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? (t.slice(0, 200) || fallback); } catch { return t.slice(0, 200) || fallback; }
}

export async function uploadGoogleResumable(url: string, headers: Record<string, string>, a: UploadArgs): Promise<string> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  let offset = 0, attempts = 0, query = !!a.resume;
  for (;;) {
    if (a.signal.aborted) throw cancelled();
    let res: Awaited<ReturnType<typeof fetch>> | null = null;
    const end = Math.min(offset + a.chunkSize, total);
    try {
      res = query
        ? await fetch(url, { method: "PUT", headers: { ...headers, "Content-Range": `bytes */${total}` }, signal: a.signal })
        : await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": a.mimeType, "Content-Range": `bytes ${offset}-${end - 1}/${total}` }, body: a.reader.read(offset, end - offset), signal: a.signal });
    } catch { if (a.signal.aborted) throw cancelled(); }
    if (res && (res.status === 200 || res.status === 201)) { a.onProgress(1); return res.text(); }
    if (res && res.status === 308) {
      const next = nextFromRange(res.headers.get("Range"));
      if (!query && next <= offset) { if (++attempts > MAX_ATTEMPTS) throw dropped(); } else attempts = 0;
      offset = next; query = false;
      a.onProgress(offset / total);
      continue;
    }
    if (res && res.status === 404) throw new UploadError("The upload session expired. Post again.", false);
    if (res && res.status >= 400 && res.status < 500) throw new UploadError(await platformText(res, `Upload failed (${res.status}).`), false);
    // Network error or 5xx: wait, then ask the server how much it has before sending more.
    if (++attempts > MAX_ATTEMPTS) throw dropped();
    await sleep(1000 * 2 ** (attempts - 1));
    query = true;
  }
}

export async function uploadRelay(send: (offset: number, total: number, bytes: Uint8Array) => Promise<{ nextOffset: number }>, a: UploadArgs): Promise<void> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  let offset = 0, attempts = 0;
  while (offset < total) {
    if (a.signal.aborted) throw cancelled();
    const end = Math.min(offset + a.chunkSize, total);
    try {
      offset = (await send(offset, total, a.reader.read(offset, end - offset))).nextOffset;
      attempts = 0;
      a.onProgress(offset / total);
    } catch (e) {
      if (!(e instanceof ApiFailure) || (e.code !== "unreachable" && e.code !== "internal")) throw e;
      if (++attempts >= MAX_ATTEMPTS) throw dropped();
      await sleep(1000 * 2 ** (attempts - 1));
    }
  }
}
```
Make the tests the judge of the exact retry counts and progress values; adjust the implementation (not the tests) until they pass, and keep the loop free of any path that can spin without either advancing, sleeping or throwing.

- [ ] **Step 4: Verify** — `npx.cmd jest src/publish`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish
git commit -m "feat(publish): chunked uploader — Google resumable protocol and relay"
```

---

### Task 9: Post state machine and accounts logic

**Files:**
- Create: `src/publish/{runPost,usePost,useAccounts}.ts`, `src/publish/__tests__/{runPost,useAccounts}.test.ts`
- Modify: `jest.setup.ts` only if `expo-linking` needs a stable mock

**Interfaces (produced):**
```ts
// runPost.ts
export type RowPhase = "idle" | "preparing" | "uploading" | "publishing" | "done" | "failed" | "needsReconnect";
export interface RowState { phase: RowPhase; progress: number; url: string | null; message: string | null; resumable: boolean }
export const IDLE_ROW: RowState
export interface PostJob { platform: PlatformId; video: VideoInfo; caption: string; options: Record<string, unknown> }
export interface PostDeps {
  api: Pick<typeof api, "prepare" | "uploadChunk" | "finalize" | "status">;
  openReader(uri: string): ChunkReader;
  uploadGoogleResumable: typeof uploadGoogleResumable; uploadRelay: typeof uploadRelay;
  sleep(ms: number): Promise<void>;
}
export const POLL_MS = 3000; export const POLL_LIMIT = 40;       // 2 minutes
/** Runs one platform's post to the end. Never throws: every outcome is reported through `update`. Returns the prepared session (for Resume) or null. */
export function runPost(job: PostJob, deps: PostDeps, update: (patch: Partial<RowState>) => void, signal: AbortSignal, resumeFrom?: Prepared | null): Promise<Prepared | null>
// usePost.ts
export function usePost(video: VideoInfo, onPosted: (platform: PlatformId, url: string | null) => void): {
  rows: Record<PlatformId, RowState>; busy: boolean;
  start(jobs: Array<Omit<PostJob, "video">>): void; retry(job: Omit<PostJob, "video">): void; cancel(): void;
}
// useAccounts.ts
export function useAccounts(enabled: boolean): {
  status: "idle" | "loading" | "ready" | "error"; platforms: PlatformStatus[]; error: string | null; busy: PlatformId | null;
  refresh(): Promise<void>; connect(platform: PlatformId): Promise<void>; disconnect(platform: PlatformId): Promise<void>;
}
```

- [ ] **Step 1: Failing tests**

`src/publish/__tests__/runPost.test.ts`
```ts
import { ApiFailure, type Prepared } from "../api";
import { IDLE_ROW, POLL_LIMIT, runPost, type PostDeps, type RowState } from "../runPost";
import { UploadError } from "../upload";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const job = { platform: "youtube" as const, video, caption: "Beach day", options: { title: "Beach", privacy: "public" } };
const prepared: Prepared = { sessionId: "s1", protocol: "google-resumable", uploadUrl: "https://u/s", uploadHeaders: {}, chunkSize: 4 };
const reader = { size: 10, read: jest.fn(), close: jest.fn() };

function deps(over: Partial<PostDeps> = {}): PostDeps {
  return {
    api: { prepare: jest.fn(async () => prepared), uploadChunk: jest.fn(async () => ({ nextOffset: 10 })), finalize: jest.fn(async () => ({ status: "done" as const, url: "https://youtu.be/abc" })), status: jest.fn() },
    openReader: jest.fn(() => reader),
    uploadGoogleResumable: jest.fn(async (_u, _h, a) => { a.onProgress(0.5); a.onProgress(1); return '{"id":"abc"}'; }),
    uploadRelay: jest.fn(async () => {}),
    sleep: jest.fn(async () => {}),
    ...over,
  };
}
function track() { let row: RowState = IDLE_ROW; const phases: string[] = []; return { update: (p: Partial<RowState>) => { row = { ...row, ...p }; if (p.phase) phases.push(p.phase); }, row: () => row, phases }; }
const signal = () => new AbortController().signal;
beforeEach(() => { reader.close.mockClear(); });

test("happy path: prepare → upload → publish → done with the link", async () => {
  const d = deps(), t = track();
  expect(await runPost(job, d, t.update, signal())).toEqual(prepared);
  expect(t.phases).toEqual(["preparing", "uploading", "publishing", "done"]);
  expect(t.row()).toMatchObject({ phase: "done", progress: 1, url: "https://youtu.be/abc", message: null });
  expect(d.api.prepare).toHaveBeenCalledWith({ platform: "youtube", fileSize: 10, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: job.options });
  expect(d.api.finalize).toHaveBeenCalledWith("s1", '{"id":"abc"}');
  expect(reader.close).toHaveBeenCalledTimes(1);
});

test("relay protocol sends pieces through api.uploadChunk and finalizes without a client result", async () => {
  const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => ({ ...prepared, protocol: "relay" as const, uploadUrl: null })) } });
  (d.uploadRelay as jest.Mock).mockImplementation(async (send) => { await send(0, 10, new Uint8Array(4)); });
  await runPost(job, d, track().update, signal());
  expect(d.api.uploadChunk).toHaveBeenCalledWith("s1", 0, 10, expect.any(Uint8Array));
  expect(d.api.finalize).toHaveBeenCalledWith("s1", null);
});

test("processing is polled until done", async () => {
  const d = deps();
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  (d.api.status as jest.Mock).mockResolvedValueOnce({ status: "processing" }).mockResolvedValueOnce({ status: "done", url: "https://p/1" });
  const t = track();
  await runPost(job, d, t.update, signal());
  expect(d.sleep).toHaveBeenCalledWith(3000);
  expect(t.row()).toMatchObject({ phase: "done", url: "https://p/1" });
});

test("still processing after two minutes counts as done without a link", async () => {
  const d = deps();
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
  const t = track();
  await runPost(job, d, t.update, signal());
  expect(d.api.status).toHaveBeenCalledTimes(POLL_LIMIT);
  expect(t.row()).toMatchObject({ phase: "done", url: null, message: "Still processing on YouTube — check the app later." });
});

test("reconnect, platform errors and resumable drops each land in the right state", async () => {
  const a = deps(); (a.api.prepare as jest.Mock).mockRejectedValue(new ApiFailure("reconnect", "Reconnect youtube in Accounts."));
  const ta = track(); expect(await runPost(job, a, ta.update, signal())).toBeNull();
  expect(ta.row()).toMatchObject({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." });

  const b = deps(); (b.api.finalize as jest.Mock).mockRejectedValue(new ApiFailure("platform_error", "The video has been rejected."));
  const tb = track(); await runPost(job, b, tb.update, signal());
  expect(tb.row()).toMatchObject({ phase: "failed", message: "The video has been rejected.", resumable: false });

  const c = deps({ uploadGoogleResumable: jest.fn(async () => { throw new UploadError("The connection dropped. Check your internet, then resume.", true); }) });
  const tc = track(); expect(await runPost(job, c, tc.update, signal())).toEqual(prepared);
  expect(tc.row()).toMatchObject({ phase: "failed", resumable: true });
  expect(reader.close).toHaveBeenCalled();
});

test("resume skips prepare and tells the uploader to query first", async () => {
  const d = deps();
  await runPost(job, d, track().update, signal(), prepared);
  expect(d.api.prepare).not.toHaveBeenCalled();
  expect((d.uploadGoogleResumable as jest.Mock).mock.calls[0][2]).toMatchObject({ resume: true, chunkSize: 4, mimeType: "video/mp4" });
});

test("cancel returns the row to idle", async () => {
  const d = deps({ uploadGoogleResumable: jest.fn(async () => { throw new UploadError("Upload cancelled.", false); }) });
  const ac = new AbortController(); ac.abort();
  const t = track(); await runPost(job, d, t.update, ac.signal);
  expect(t.row()).toMatchObject({ phase: "idle", progress: 0 });
});
```

`src/publish/__tests__/useAccounts.test.ts`
```ts
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
jest.mock("expo-linking", () => ({ createURL: (p: string) => `exp://192.168.1.142:8090/--/${p}`, parse: (u: string) => ({ queryParams: Object.fromEntries(new URL(u.replace(/^exp:/, "http:")).searchParams) }) }));
jest.mock("../api", () => ({ ...jest.requireActual("../api"), api: { accounts: jest.fn(), oauthStart: jest.fn(), disconnect: jest.fn() } }));
import { api, ApiFailure } from "../api";
import { useAccounts } from "../useAccounts";
import { useToast } from "@/src/ui/Toast";

const yt = (over = {}) => ({ id: "youtube", available: true, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); (api.accounts as jest.Mock).mockResolvedValue([yt()]); });

test("loads when enabled; stays idle when not", async () => {
  const off = await renderHook(() => useAccounts(false));
  expect(off.result.current.status).toBe("idle");
  expect(api.accounts).not.toHaveBeenCalled();
  const on = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(on.result.current.status).toBe("ready"));
  expect(on.result.current.platforms).toHaveLength(1);
});

test("a load failure is kept as an error message", async () => {
  (api.accounts as jest.Mock).mockRejectedValue(new ApiFailure("unreachable", "Clipy's server is asleep or unreachable."));
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("error"));
  expect(h.result.current.error).toBe("Clipy's server is asleep or unreachable.");
});

test("connect opens the platform login with the app's return address and refreshes on success", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?state=s");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: "success", url: "exp://192.168.1.142:8090/--/oauth?status=ok&platform=youtube" });
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  (api.accounts as jest.Mock).mockResolvedValue([yt({ connected: true, name: "My Channel" })]);
  await act(() => h.result.current.connect("youtube"));
  expect(api.oauthStart).toHaveBeenCalledWith("youtube", "exp://192.168.1.142:8090/--/oauth");
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=s", "exp://192.168.1.142:8090/--/oauth");
  expect(h.result.current.platforms[0]).toMatchObject({ connected: true, name: "My Channel" });
  expect(h.result.current.busy).toBeNull();
});

test("an error from the platform is shown; closing the sheet is silent", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://x");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "success", url: "exp://h/--/oauth?status=error&platform=youtube&message=Bad%20Request" });
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.connect("youtube"));
  expect(useToast.getState().message).toBe("Bad Request");
  useToast.getState().clear();
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "cancel" });
  await act(() => h.result.current.connect("youtube"));
  expect(useToast.getState().message).toBeNull();
});

test("disconnect calls the server and refreshes", async () => {
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.disconnect("youtube"));
  expect(api.disconnect).toHaveBeenCalledWith("youtube");
  expect(api.accounts).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`runPost.ts`
```ts
import { ApiFailure, type api, type Prepared } from "./api";
import type { VideoInfo } from "./adapters/types";
import type { ChunkReader } from "./fileReader";
import { PLATFORMS, type PlatformId } from "./platforms";
import { UploadError, type uploadGoogleResumable, type uploadRelay } from "./upload";

export type RowPhase = "idle" | "preparing" | "uploading" | "publishing" | "done" | "failed" | "needsReconnect";
export interface RowState { phase: RowPhase; progress: number; url: string | null; message: string | null; resumable: boolean }
export const IDLE_ROW: RowState = { phase: "idle", progress: 0, url: null, message: null, resumable: false };
export interface PostJob { platform: PlatformId; video: VideoInfo; caption: string; options: Record<string, unknown> }
export interface PostDeps {
  api: Pick<typeof api, "prepare" | "uploadChunk" | "finalize" | "status">;
  openReader(uri: string): ChunkReader;
  uploadGoogleResumable: typeof uploadGoogleResumable; uploadRelay: typeof uploadRelay;
  sleep(ms: number): Promise<void>;
}
export const POLL_MS = 3000;
export const POLL_LIMIT = 40;

export async function runPost(job: PostJob, deps: PostDeps, update: (patch: Partial<RowState>) => void, signal: AbortSignal, resumeFrom: Prepared | null = null): Promise<Prepared | null> {
  let prepared = resumeFrom;
  let reader: ChunkReader | null = null;
  try {
    if (!prepared) {
      update({ ...IDLE_ROW, phase: "preparing" });
      const { video } = job;
      prepared = await deps.api.prepare({ platform: job.platform, fileSize: video.fileSize, durationSec: video.durationSec, mimeType: video.mimeType, caption: job.caption, options: job.options });
    }
    const p = prepared;
    update({ phase: "uploading", message: null, resumable: false });
    reader = deps.openReader(job.video.fileUri);
    const args = { reader, mimeType: job.video.mimeType, chunkSize: p.chunkSize, onProgress: (f: number) => update({ progress: f }), signal, resume: !!resumeFrom };
    let clientResult: string | null = null;
    if (p.protocol === "google-resumable") clientResult = await deps.uploadGoogleResumable(p.uploadUrl ?? "", p.uploadHeaders, args);
    else await deps.uploadRelay((offset, total, bytes) => deps.api.uploadChunk(p.sessionId, offset, total, bytes), args);

    update({ phase: "publishing", progress: 1 });
    let result = await deps.api.finalize(p.sessionId, clientResult);
    for (let i = 0; result.status === "processing" && i < POLL_LIMIT; i++) { await deps.sleep(POLL_MS); result = await deps.api.status(p.sessionId); }
    update(result.status === "done"
      ? { phase: "done", url: result.url, message: null }
      : { phase: "done", url: null, message: `Still processing on ${PLATFORMS[job.platform].label} — check the app later.` });
  } catch (e) {
    if (signal.aborted) update({ ...IDLE_ROW });
    else if (e instanceof ApiFailure && e.code === "reconnect") update({ phase: "needsReconnect", message: e.message });
    else if (e instanceof UploadError) update({ phase: "failed", message: e.message, resumable: e.resumable });
    else update({ phase: "failed", message: e instanceof Error && e.message ? e.message : "Something went wrong.", resumable: false });
  } finally { reader?.close(); }
  return prepared;
}
```

`usePost.ts`
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Prepared } from "./api";
import type { VideoInfo } from "./adapters/types";
import { openReader } from "./fileReader";
import { PLATFORM_IDS, type PlatformId } from "./platforms";
import { IDLE_ROW, runPost, type PostDeps, type PostJob, type RowState } from "./runPost";
import { uploadGoogleResumable, uploadRelay } from "./upload";

const realDeps: PostDeps = { api, openReader, uploadGoogleResumable, uploadRelay, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
const allIdle = () => Object.fromEntries(PLATFORM_IDS.map((id) => [id, IDLE_ROW])) as Record<PlatformId, RowState>;
const ACTIVE = ["preparing", "uploading", "publishing"];

/** One row of state per platform; rows run in parallel and never affect each other. */
export function usePost(video: VideoInfo, onPosted: (platform: PlatformId, url: string | null) => void) {
  const [rows, setRows] = useState(allIdle);
  const prepared = useRef<Partial<Record<PlatformId, Prepared | null>>>({});
  const aborts = useRef<Partial<Record<PlatformId, AbortController>>>({});
  const posted = useRef(onPosted); posted.current = onPosted;

  const run = useCallback((job: Omit<PostJob, "video">, resume: boolean) => {
    const ac = new AbortController();
    aborts.current[job.platform] = ac;
    const update = (patch: Partial<RowState>) => {
      setRows((r) => ({ ...r, [job.platform]: { ...r[job.platform], ...patch } }));
      if (patch.phase === "done") posted.current(job.platform, patch.url ?? null);
    };
    runPost({ ...job, video }, realDeps, update, ac.signal, resume ? prepared.current[job.platform] ?? null : null)
      .then((p) => { prepared.current[job.platform] = p; });
  }, [video]);

  const start = useCallback((jobs: Array<Omit<PostJob, "video">>) => { for (const j of jobs) run(j, false); }, [run]);
  const retry = useCallback((job: Omit<PostJob, "video">) => run(job, rowsRef.current[job.platform].resumable), [run]);
  const cancel = useCallback(() => { for (const ac of Object.values(aborts.current)) ac?.abort(); }, []);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  useEffect(() => cancel, [cancel]);   // leaving the screen stops uploads

  return { rows, busy: Object.values(rows).some((r) => ACTIVE.includes(r.phase)), start, retry, cancel };
}
```

`useAccounts.ts`
```ts
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/src/ui/Toast";
import { api, type PlatformStatus } from "./api";
import type { PlatformId } from "./platforms";

type Status = "idle" | "loading" | "ready" | "error";
const text = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** The connected-accounts list plus connect / disconnect. `enabled` is false until the user is signed in. */
export function useAccounts(enabled: boolean) {
  const [status, setStatus] = useState<Status>(enabled ? "loading" : "idle");
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PlatformId | null>(null);

  const refresh = useCallback(async () => {
    try { setPlatforms(await api.accounts()); setError(null); setStatus("ready"); }
    catch (e) { setError(text(e)); setStatus("error"); }
  }, []);
  useEffect(() => { if (enabled) { setStatus("loading"); refresh(); } else setStatus("idle"); }, [enabled, refresh]);

  const connect = useCallback(async (platform: PlatformId) => {
    setBusy(platform);
    try {
      const returnUrl = Linking.createURL("oauth");
      const result = await WebBrowser.openAuthSessionAsync(await api.oauthStart(platform, returnUrl), returnUrl);
      if (result.type === "success") {
        const q = Linking.parse(result.url).queryParams ?? {};
        if (q.status === "error") useToast.getState().show(typeof q.message === "string" && q.message ? q.message : "Couldn't connect.");
        await refresh();
      }
    } catch (e) { useToast.getState().show(text(e)); }
    finally { setBusy(null); }
  }, [refresh]);

  const disconnect = useCallback(async (platform: PlatformId) => {
    setBusy(platform);
    try { await api.disconnect(platform); await refresh(); }
    catch (e) { useToast.getState().show(text(e)); }
    finally { setBusy(null); }
  }, [refresh]);

  return { status, platforms, error, busy, refresh, connect, disconnect };
}
```
Check `openAuthSessionAsync`'s result shape and `Linking.createURL` / `Linking.parse` against the v57 docs.

- [ ] **Step 4: Verify** — `npx.cmd jest src/publish`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish jest.setup.ts
git commit -m "feat(publish): post state machine, parallel rows hook, accounts connect flow"
```

---

### Task 10: Accounts screen, sign-in card, home header

**Files:**
- Create: `src/publish/components/{SignInCard,AccountRow}.tsx`, `app/accounts.tsx`, `app/oauth.tsx`, `src/publish/__tests__/{AccountsScreen,SignInCard}.test.tsx`
- Modify: `app/index.tsx` (header icons), `src/projects/__tests__/ProjectsScreen.test.tsx`

**Interfaces (produced):**
```tsx
<SignInCard />                       // renders per useSession(): unconfigured card, Apple button, or null when signed in / loading
<AccountRow status={PlatformStatus} busy onConnect onDisconnect />
```

**Behaviour (spec §4.1, §4.2):**
- `SignInCard`: `unconfigured` → card titled "Posting isn't set up yet" with body "Clipy's posting server hasn't been connected. You can still share with the Share button." — `signedOut` → title "Sign in to Clipy", body "Clipy keeps your connected accounts safe on its server.", and a button with accessible name "Sign in with Apple" (use `AppleAuthenticationButton`, white style, corner radius 22, height 48, wrapped so tests can press it by label; verify the component's props in the docs). Pressing calls `signInWithApple()`; an error shows its message in the toast; "cancelled" does nothing. `loading`/`signedIn` → `null`.
- `AccountRow` (one per platform, order from the server): platform icon + label; states —
  - `!available` → muted, text "Not available yet", no button;
  - available, not connected → `SecondaryButton` "Connect" (accessibilityLabel `Connect <Label>`);
  - connected → account name under the label, avatar (`Image`, 32 px circle) when present, `SecondaryButton danger` "Disconnect" (label `Disconnect <Label>`) that first asks `Alert.alert("Disconnect <Label>?", "Clipy will stop posting to this account.", [Cancel, Disconnect])`;
  - `needsReconnect` → text "Sign-in expired" and `PrimaryButton compact` "Reconnect" (label `Reconnect <Label>`) calling `onConnect`;
  - `busy` → an `ActivityIndicator` replaces the button.
- `app/accounts.tsx`: `<Screen>`; top bar with back `IconButton` ("Back") and `Title` "Accounts"; `<SignInCard />`; when signed in: loading spinner, the five rows, or the error text with a `SecondaryButton` "Try again" (`refresh`); footer when signed in: `Body muted` "Signed in with Apple" + email if any, and `SecondaryButton` "Sign out". `<ToastHost />`.
- `app/oauth.tsx`: `export default function OAuthReturn() { return <Redirect href="/accounts" />; }` — a safety net if the return link is ever opened as a normal deep link.
- `app/index.tsx` header: title on the left; on the right two `IconButton`s — `paper-plane` with label "Post a video" (wired in Task 11; here it navigates nowhere yet, so add it in Task 11, not now) and `person-circle` with label "Accounts" → `router.push("/accounts")`. In this task add only the Accounts button.

- [ ] **Step 1: Failing tests**

`src/publish/__tests__/SignInCard.test.tsx`
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn() }));
import { SignInCard } from "../components/SignInCard";
import { signInWithApple } from "../supabase";
import { useSession } from "../useSession";
import { useToast } from "@/src/ui/Toast";

beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); });

test("unconfigured backend explains itself and offers no sign-in", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "unconfigured" });
  await render(<SignInCard />);
  expect(screen.getByText("Posting isn't set up yet")).toBeTruthy();
  expect(screen.queryByLabelText("Sign in with Apple")).toBeNull();
});

test("signed out shows Sign in with Apple; errors are toasted; cancel is silent", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await render(<SignInCard />);
  (signInWithApple as jest.Mock).mockResolvedValueOnce("cancelled");
  await fireEvent.press(screen.getByLabelText("Sign in with Apple"));
  expect(useToast.getState().message).toBeNull();
  (signInWithApple as jest.Mock).mockRejectedValueOnce(new Error("Unacceptable audience in id_token"));
  await fireEvent.press(screen.getByLabelText("Sign in with Apple"));
  await waitFor(() => expect(useToast.getState().message).toBe("Unacceptable audience in id_token"));
});

test("signed in or loading renders nothing", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "a@b.c" });
  const v = await render(<SignInCard />);
  expect(v.toJSON()).toBeNull();
});
```

`src/publish/__tests__/AccountsScreen.test.tsx`
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, Redirect: () => null }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn() }));
import AccountsScreen from "@/app/accounts";
import { signOut } from "../supabase";
import { useAccounts } from "../useAccounts";
import { useSession } from "../useSession";

const p = (id: string, over = {}) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
const hook = (over = {}) => ({ status: "ready", platforms: [p("youtube", { available: true }), p("tiktok"), p("instagram"), p("facebook"), p("x")], error: null, busy: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), ...over });
beforeEach(() => { jest.clearAllMocks(); (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "me@icloud.com" }); });

test("signed out: sign-in card only, accounts not requested", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  (useAccounts as jest.Mock).mockReturnValue(hook({ status: "idle", platforms: [] }));
  await render(<AccountsScreen />);
  expect(useAccounts).toHaveBeenCalledWith(false);
  expect(screen.getByLabelText("Sign in with Apple")).toBeTruthy();
  expect(screen.queryByText("YouTube")).toBeNull();
});

test("five rows: Connect for available, Not available yet for the rest", async () => {
  const h = hook(); (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  for (const label of ["YouTube", "TikTok", "Instagram", "Facebook", "X"]) expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getAllByText("Not available yet")).toHaveLength(4);
  await fireEvent.press(screen.getByRole("button", { name: "Connect YouTube" }));
  expect(h.connect).toHaveBeenCalledWith("youtube");
});

test("connected row shows the name and disconnects after confirmation", async () => {
  const h = hook({ platforms: [p("youtube", { available: true, connected: true, name: "My Channel" })] });
  (useAccounts as jest.Mock).mockReturnValue(h);
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === "destructive")?.onPress?.(); });
  await render(<AccountsScreen />);
  expect(screen.getByText("My Channel")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Disconnect YouTube" }));
  expect(alert).toHaveBeenCalledWith("Disconnect YouTube?", expect.any(String), expect.any(Array));
  expect(h.disconnect).toHaveBeenCalledWith("youtube");
});

test("expired sign-in offers Reconnect", async () => {
  const h = hook({ platforms: [p("youtube", { available: true, connected: true, name: "My Channel", needsReconnect: true })] });
  (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  expect(screen.getByText("Sign-in expired")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  expect(h.connect).toHaveBeenCalledWith("youtube");
});

test("load error offers Try again; footer signs out", async () => {
  const h = hook({ status: "error", platforms: [], error: "Clipy's server is asleep or unreachable." });
  (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  expect(screen.getByText("Clipy's server is asleep or unreachable.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(h.refresh).toHaveBeenCalled();
  expect(screen.getByText(/me@icloud.com/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalled();
});
```
Home screen test: the header has a button named "Accounts" that pushes `/accounts`.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the three components and the two routes exactly to the Behaviour list, using only kit components (`Screen`, `Title`, `Body`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `ToastHost`) and theme tokens; cards are `surface` background, `hairline` 1 px border, `radius.card`, `space.lg` padding; row height ≥ 56. Register nothing extra in `app/_layout.tsx` unless a modal presentation is wanted (it is not).
- [ ] **Step 4: Verify** — `npx.cmd jest src/publish src/projects`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish app/accounts.tsx app/oauth.tsx app/index.tsx src/projects/__tests__/ProjectsScreen.test.tsx
git commit -m "feat(accounts): Accounts screen with Sign in with Apple and connect / disconnect rows"
```

---

### Task 11: Post screen, entry points, post records

**Files:**
- Create: `src/publish/components/{PostRow,PostOptionsSheet}.tsx`, `src/publish/pickVideo.ts`, `app/post.tsx`, `src/publish/__tests__/{PostScreen,pickVideo}.test.tsx`
- Modify: `app/index.tsx` ("Post a video" header button), `src/export/ExportScreenBody.tsx` + `app/editor/[id]/export.tsx` ("Post to…" + file size), their tests

**Interfaces (produced):**
```ts
// pickVideo.ts
export function pickVideoForPost(): Promise<{ fileUri: string; durationSec: number; fileSize: number; mimeType: string } | null>
// Route: /post?fileUri=…&durationSec=…&projectId=…&title=…   (projectId and title optional)
```

**Behaviour (spec §4.3, §10):**
- `pickVideoForPost`: `ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: false, videoExportPreset: Passthrough, preferredAssetRepresentationMode: Current })`; cancelled → `null`; returns `durationSec = asset.duration / 1000` (the picker reports milliseconds), `fileSize = asset.fileSize ?? openReader-free size via new File(uri).size`, `mimeType = asset.mimeType ?? "video/mp4"`. Verify option and field names in the v57 image-picker docs.
- Home header button "Post a video" (`paper-plane` icon): `const v = await pickVideoForPost(); if (v) router.push({ pathname: "/post", params: { fileUri: v.fileUri, durationSec: String(v.durationSec), fileSize: String(v.fileSize), mimeType: v.mimeType } })`.
- Export finish: add gold `PrimaryButton` **"Post to…"** above Save (Save becomes a `SecondaryButton`) — `ExportScreenBody` gets a new optional prop `onPost?: () => void` and renders the button only when it is provided; `app/editor/[id]/export.tsx` provides it: push `/post` with `fileUri = state.fileUri`, `durationSec` = the exported duration, `projectId = project.id`, `title = project.name`. The finish summary line gains the size: `1080p · 0:21 · 14 MB` using `formatBytes(new File(uri).size)` via a small `fileSize(uri)` helper in `src/lib/fileInfo.ts` (returns 0 on failure; hide the size part when 0).
- `app/post.tsx`:
  - Reads params; `video: VideoInfo` (fileSize from the param or `fileSize(uri)`; mimeType default `video/mp4`). `useSession()`; `<SignInCard />` at the top; the rest renders only when signed in.
  - `useAccounts(signedIn)`; one `PostRow` per platform in server order.
  - Header: back button + `Title` "Post". Video summary line: `0:21 · 14 MB`.
  - Caption `TextInput` (accessibilityLabel "Caption", multiline, kit input style) with a counter `<length> / <smallest captionMax among ticked platforms that have a client adapter>`; counter text turns `danger` when over.
  - Selection state: a platform is tickable only when `available && connected && !needsReconnect && clientAdapters[id]`. Default: all tickable platforms ticked.
  - Options per platform: `useState` initialised from `clientAdapters[id].defaultOptions(title ?? "")`; tapping a tickable row's "Options" button opens `PostOptionsSheet` for that platform.
  - `PostRow` shows: checkbox (accessibilityRole "checkbox", label `<Label>`, checked state), icon, label, account name, and on the right the status:
    - not tickable → reason text: "Not available yet" / "Not connected" + `SecondaryButton` "Connect" → `router.push("/accounts")` / "Sign-in expired" + "Reconnect" → `/accounts`;
    - validation failure (from `adapter.validate`) → the sentence in `danger`, and the row is unticked/unpostable while it lasts;
    - `adapter.note(video)` under the row in `textMuted` 12 px when ticked;
    - phases: `preparing` "Preparing…", `uploading` `<pct>%` with a thin gold progress bar (accessibilityRole "progressbar"), `publishing` "Publishing…", `done` "Done" + a "View" button (label `View on <Label>`, `Linking.openURL(url)`) when there is a url, or the row message when not, `failed` the message in `danger` + `SecondaryButton` "Resume" when `resumable` else "Retry" (label `Retry <Label>` / `Resume <Label>`), `needsReconnect` the message + "Reconnect" → `/accounts`.
  - Footer: `PrimaryButton` **"Post"** — disabled when nothing postable is ticked, the caption is over the limit, or `busy`; pressing calls `start(jobs)` for every ticked, valid platform with `haptic("light")`. `SecondaryButton` "Share…" opens the share sheet for the same file (reuse the export screen's `Sharing.shareAsync` call with the same options).
  - `onPosted(platform, url)`: `haptic("success")`; if `projectId` and `useEditorStore.getState().project?.id === projectId` → `addPostRecord({ platform, url, postedAt: nowIso() })`.
  - Leaving while `busy`: intercept the back button and hardware/gesture back with `Alert.alert("Stop posting?", "Uploads in progress will be cancelled.", [Keep posting, Stop])`; Stop → `cancel()` then go back. (Use Expo Router's documented way to guard navigation — `usePreventRemove` or the `beforeRemove` listener; verify in the v57 docs.)
- `PostOptionsSheet` (kit `Sheet`, title `<Label> options`) for YouTube: `TextInput` "Title" (label "YouTube title", max 100, counter), privacy `Chip`s Public / Unlisted / Private. Changes update the options state immediately. Platforms without specific options are not openable.

- [ ] **Step 1: Failing tests** — `src/publish/__tests__/PostScreen.test.tsx`

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
const params = { fileUri: "file:///out.mp4", durationSec: "21", fileSize: "14000000", mimeType: "video/mp4", projectId: "p1", title: "Beach day" };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => params, useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../usePost", () => ({ usePost: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn() }));
import PostScreen from "@/app/post";
import { router } from "expo-router";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { IDLE_ROW } from "../runPost";
import { useAccounts } from "../useAccounts";
import { usePost } from "../usePost";
import { useSession } from "../useSession";

const acct = (id: string, over = {}) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
const accounts = (yt = {}) => ({ status: "ready", platforms: [acct("youtube", { available: true, connected: true, name: "My Channel", ...yt }), acct("tiktok"), acct("instagram"), acct("facebook"), acct("x")], error: null, busy: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn() });
const rows = (yt = {}) => ({ youtube: { ...IDLE_ROW, ...yt }, tiktok: IDLE_ROW, instagram: IDLE_ROW, facebook: IDLE_ROW, x: IDLE_ROW });
const post = (over = {}) => ({ rows: rows(), busy: false, start: jest.fn(), retry: jest.fn(), cancel: jest.fn(), ...over });
let onPosted: (p: string, url: string | null) => void;
beforeEach(() => {
  jest.clearAllMocks();
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: null });
  (useAccounts as jest.Mock).mockReturnValue(accounts());
  (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return post(); });
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day" }));
});

test("signed out shows only the sign-in card", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await render(<PostScreen />);
  expect(screen.getByLabelText("Sign in with Apple")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
});

test("YouTube is ticked by default with its note; unavailable platforms say why; Post sends the job", async () => {
  const p = post(); (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return p; });
  await render(<PostScreen />);
  expect(screen.getByText("0:21 · 13.4 MB")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "YouTube" })).toBeChecked();
  expect(screen.getByText(/private until Google reviews/i)).toBeTruthy();
  expect(screen.getAllByText("Not available yet")).toHaveLength(4);
  await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny #beach");
  await fireEvent.press(screen.getByRole("button", { name: "Post" }));
  expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "Sunny #beach", options: { title: "Beach day", privacy: "public" } }]);
});

test("unticking everything disables Post; a not-connected platform links to Accounts", async () => {
  (useAccounts as jest.Mock).mockReturnValue(accounts({ connected: false, name: null }));
  await render(<PostScreen />);
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Connect" }));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

test("options sheet edits the YouTube title and privacy; a blank title blocks posting with a reason", async () => {
  const p = post(); (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return p; });
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "YouTube options" }));
  await fireEvent.changeText(screen.getByLabelText("YouTube title"), "Best day");
  await fireEvent.press(screen.getByRole("button", { name: "Unlisted" }));
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  await fireEvent.press(screen.getByRole("button", { name: "Post" }));
  expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "", options: { title: "Best day", privacy: "unlisted" } }]);
  await fireEvent.press(screen.getByRole("button", { name: "YouTube options" }));
  await fireEvent.changeText(screen.getByLabelText("YouTube title"), "  ");
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  expect(screen.getByText("Add a title for YouTube.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
});

test("row phases: uploading shows percent, done links out, failed offers Retry or Resume, reconnect links to Accounts", async () => {
  const render1 = async (yt: object) => { (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return post({ rows: rows(yt), busy: false }); }); return render(<PostScreen />); };
  const a = await render1({ phase: "uploading", progress: 0.42 });
  expect(screen.getByText("42%")).toBeTruthy(); a.unmount();
  const b = await render1({ phase: "done", progress: 1, url: "https://youtu.be/abc" });
  expect(screen.getByRole("button", { name: "View on YouTube" })).toBeTruthy(); b.unmount();
  const c = await render1({ phase: "failed", message: "The video has been rejected.", resumable: false });
  expect(screen.getByText("The video has been rejected.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry YouTube" })).toBeTruthy(); c.unmount();
  const d = await render1({ phase: "failed", message: "The connection dropped.", resumable: true });
  expect(screen.getByRole("button", { name: "Resume YouTube" })).toBeTruthy(); d.unmount();
  await render1({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." });
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect" }));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

test("a finished post is recorded on the open project", async () => {
  await render(<PostScreen />);
  await act(() => { onPosted("youtube", "https://youtu.be/abc"); });
  expect(useEditorStore.getState().project!.posts).toEqual([{ platform: "youtube", url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" }]);
});

test("Post is disabled while uploads are running", async () => {
  (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return post({ rows: rows({ phase: "uploading", progress: 0.1 }), busy: true }); });
  await render(<PostScreen />);
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
});
```
(Adjust the size string in the first assertion to whatever `formatBytes(14000000)` really returns. If the navigation-guard hook you use differs from the `useNavigation().addListener` mock above, change the mock, not the behaviour.)

`pickVideo.test.tsx`: mock `expo-image-picker`; cancelled → `null`; a picked asset `{ uri, duration: 21000, fileSize: 14000000, mimeType: "video/quicktime" }` → `{ fileUri: uri, durationSec: 21, fileSize: 14000000, mimeType: "video/quicktime" }`; the picker is called with `mediaTypes: ["videos"]` and `allowsEditing: false`.

Export tests: `onPost` provided → "Post to…" button present and calls it; absent → no button (the Task 8 redesign test that asserts "no Post button yet" becomes "no Post button without onPost").

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** to the Behaviour list with kit components and theme tokens only. Keep `app/post.tsx` thin: selection/options/validation state in a `usePostForm(video, platforms, title)` hook inside `src/publish/usePostForm.ts` if the screen grows past ~120 lines.
- [ ] **Step 4: Verify** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish app/post.tsx app/index.tsx app/editor src/export src/lib src/projects/__tests__
git commit -m "feat(post): Post screen with per-platform rows, options, entry points and post records"
```

---

### Task 12: Docs and final checks

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md` (Status), `docs/superpowers/specs/2026-10-02-ui-redesign-grand-voyage-design.md` (the three "arrives with Phase 4" notes are now done)

- [ ] **Step 1: README** — add a "Posting" section: what works (Sign in with Apple, Accounts, Post screen, YouTube), that it needs the Supabase backend (`supabase/README.md`) and a `.env` copied from `.env.example`, the YouTube private-until-audit rule, that TikTok / Instagram / Facebook / X arrive in 4B–4D, and that nothing has been run against the live services yet.
- [ ] **Step 2: AGENTS.md** — add under "This repo (Clipy)":
  `- Posting: app code in src/publish/ talks only to Supabase Edge Functions via src/publish/api.ts; platform secrets and tokens live on the server only. Server logic is plain TS in supabase/functions/_shared/ (web-standard APIs, .ts import extensions, no Deno.* outside runtime.ts / index.ts) and is tested with npm run test:server (Node). Adding a platform = one server adapter (platforms/<id>.ts + registry) and one client adapter (src/publish/adapters/<id>.ts).`
  and update the checks line to mention `npm test` runs app and server suites.
- [ ] **Step 3: Spec status** — Phase 4 spec Status: `4A (foundation + YouTube) implemented 2026-10-02 — unverified against live Supabase/Google until accounts exist; 4B–4D pending`. UI spec: mark the home Accounts icon, export file size and "Post to…" as delivered.
- [ ] **Step 4: Full verification** — `npm run typecheck`; `npm test` (app + server); `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty); Grep `src/publish` and `app/` for hex literals (none) and for any import of `supabase/functions` from app code (none) or of `src/` from server code (none).
- [ ] **Step 5: Commit**

```powershell
git add README.md AGENTS.md docs/superpowers/specs
git commit -m "docs: posting foundation + YouTube (4A)"
```

**Device checklist (for the user, after `supabase/README.md` setup; not part of the automated tasks):** Accounts → Sign in with Apple → Connect YouTube (Google "unverified app" screen → continue) → row shows the channel name → home → Post a video → pick a short clip → caption → Post → Preparing → Uploading % → Publishing → Done → View on YouTube opens the (private) video. Also: with no `.env`, Accounts shows "Posting isn't set up yet" and the Share button still works.
