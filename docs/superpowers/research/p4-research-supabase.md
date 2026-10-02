# Phase 4 research: Supabase backend for Clipy (researched 2026-10-02)

Method note: every fact below was read from the cited page on 2026-10-02 via fetch/search summaries. Items marked [UNVERIFIED] or [CODE: mine] are not stated by an official page and must be tested.

## 1. Sign in with Apple (native, identity token)

- API: `supabase.auth.signInWithIdToken({ provider, token, access_token?, nonce? })`; returns `{ data, error }`. nonce is optional, "recommended when your provider supports it".
  Source: https://supabase.com/docs/reference/javascript/auth-signinwithidtoken
- Official Expo snippet (no nonce used in the docs example):
  Source: https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/social-login/auth-apple.mdx
  ```ts
  import * as AppleAuthentication from 'expo-apple-authentication'
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })
  if (credential.identityToken) {
    const { error, data: { user } } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })
  }
  ```
- Provider config: Dashboard -> Authentication -> Providers -> Apple, field "Client IDs" (bundle id(s)). For native `signInWithIdToken` ANY listed client ID is accepted as token audience regardless of order (first ID is only used for web OAuth).
  Source: https://supabase.com/docs/guides/auth/social-login/auth-apple (and the raw mdx above)
- Expo Go: docs explicitly say to add `host.exp.Exponent` to the Client IDs list when testing with Expo Go; for dev builds add every variant bundle id (e.g. com.example.app.dev). So yes, it is the documented way. Same sources.
  Expo side: "You can test this library in Expo Go on iOS without following any of the instructions above"; identifiers/values in Expo Go "will likely be different" from standalone; test on a real device (Simulator differs). Sources: https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/ and https://raw.githubusercontent.com/expo/expo/main/docs/pages/versions/unversioned/sdk/apple-authentication.mdx
  Caveat: the audience (`aud`) being `host.exp.Exponent` in Expo Go is implied by Supabase's instruction, not stated verbatim by Apple/Expo [UNVERIFIED on device; decode the JWT once to confirm].
- expo-apple-authentication `signInAsync(options)` (SDK 57 page): options `requestedScopes` (AppleAuthenticationScope.FULL_NAME / EMAIL), `nonce` (arbitrary string, replay protection), `state` (returned unmodified). Returned `AppleAuthenticationCredential`: `user`, `identityToken` (JWT, nullable), `authorizationCode`, `email` (may be relay/null after first sign-in), `fullName` (object with nullable parts), plus `state`. Source: https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/
  Config: `ios.usesAppleSignIn: true` + plugin `"expo-apple-authentication"` in app.json (needed for real builds, not Expo Go). Source: https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/quickstarts/with-expo-react-native-social-auth.mdx and Expo page above.
- Nonce handling: Expo docs do not mention hashing. Supabase's Flutter iOS example generates a raw nonce, sends SHA-256 hex of it to Apple, and passes the RAW nonce to Supabase (`final hashedNonce = sha256.convert(utf8.encode(rawNonce)).toString();`). Source: https://supabase.com/docs/guides/auth/social-login/auth-apple. Applying the same to Expo: [CODE: mine / inferred]
  ```ts
  import * as Crypto from 'expo-crypto'
  const raw = Crypto.randomUUID()
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)
  const cred = await AppleAuthentication.signInAsync({ requestedScopes: [...], nonce: hashed })
  await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken!, nonce: raw })
  ```
  The official Expo example omits the nonce entirely, so nonce is optional; only add it if it works on device in Expo Go (Expo Go behaviour with nonce not documented).
- Apple gives full name only on first sign-in; save it with `supabase.auth.updateUser({ data: { full_name } })`. Source: auth-apple page.

## 2. supabase-js in Expo / React Native

- Install (Expo's current guide): `npx expo install @supabase/supabase-js expo-sqlite`. Source: https://docs.expo.dev/guides/using-supabase.md
- Expo's current recommended client (storage = expo-sqlite localStorage, NOT SecureStore/AsyncStorage; env var names use "publishable key"):
  ```ts
  import 'expo-sqlite/localStorage/install';
  import { createClient } from '@supabase/supabase-js';
  import { AppState } from 'react-native';
  export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  AppState.addEventListener('change', (s) => { s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh(); });
  ```
  Source: https://docs.expo.dev/guides/using-supabase.md
- Supabase's own quickstart still installs `@supabase/supabase-js @react-native-async-storage/async-storage @rneui/themed react-native-url-polyfill`: https://supabase.com/docs/guides/auth/quickstarts/react-native . But a search summary of Expo's guide says react-native-url-polyfill is not needed on Expo (Expo provides URL global) (https://docs.expo.dev/guides/using-supabase/) ; Expo's own client code (above) has no polyfill import. Conclusion: url polyfill not needed in Expo.
- SecureStore limit: Expo SDK 57 page says large payloads can be rejected; "some iOS releases refused values above roughly 2048 bytes"; Expo does not enforce a limit. Keys: alphanumeric, `.`, `-`, `_` only. Works in Expo Go. https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
  Supabase's tutorial: "Expo's SecureStore does not support values larger than 2048 bytes" -> `LargeSecureStore` pattern: generate 256-bit AES key stored in SecureStore, encrypt session with aes-js (AES-256-CTR), put ciphertext in AsyncStorage. Install: `npm install aes-js react-native-get-random-values`, `npx expo install expo-secure-store`, `npm install --save-dev @types/aes-js`, plus `npx expo install @react-native-async-storage/async-storage`. Source: https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/getting-started/tutorials/with-expo-react-native.mdx (I did not retrieve the class code verbatim; copy it from that page.)
- Expo Go: Expo's Supabase guide is generic and no Expo Go limitation is noted; expo-sqlite localStorage / SecureStore / AsyncStorage are all Expo Go modules. supabase-js is pure JS so it runs in Expo Go. [Not explicitly stated by one page; low risk.] Apple sign-in also works in Expo Go (see 1).
- Server-side token verification: `supabase.auth.getClaims()` verifies JWT via JWKS (fast with asymmetric signing keys; falls back to Auth server round trip with symmetric keys). https://supabase.com/docs/reference/javascript/auth-getclaims . Supabase's RN quickstart uses getClaims too.

## 3. Edge Functions

- Layout: `supabase init` -> `supabase/config.toml`; `supabase functions new hello-world` -> `supabase/functions/hello-world/index.ts`. Runtime Deno. https://supabase.com/docs/guides/functions/quickstart
- Shared code: `supabase/functions/_shared/...`; per-function `deno.json` is recommended ("proper isolation"); `npm:` specifiers, `node:` builtins, JSR supported. https://supabase.com/docs/guides/functions/unit-test (layout) and https://supabase.com/docs/guides/functions/dependencies
- Handler style: docs now show `export default { fetch: ... }` wrapped by `withSupabase` (below). `Deno.serve` remains valid in Deno runtime [I did not find a current doc page showing it; the overview page only said "export a handler"]. https://supabase.com/docs/guides/functions
- Reading caller / current recommended: `@supabase/server` (import `npm:@supabase/server@1`). https://supabase.com/docs/guides/functions/auth
  ```ts
  import { withSupabase } from 'npm:@supabase/server@1'
  export default {
    fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
      // ctx.userClaims (id, email, role), ctx.supabase (RLS-scoped), ctx.supabaseAdmin (service role), ctx.authMode
      return Response.json({ email: ctx.userClaims?.email })
    }),
  }
  ```
  Auth modes: `'user'` (JWT on Authorization), `'secret'` (secret key on apikey), `'publishable'`, `'none'` (public, e.g. signed webhooks); arrays allowed: `['user','secret']`; named keys `'secret:automations'`; `createSupabaseContext` for custom 401s. Same page.
- `verify_jwt` in `supabase/config.toml`: `[functions.name] verify_jwt = false` (true is default). Other options: `entrypoint`, `import_map`, `static_files`. `supabase functions serve --no-verify-jwt` for local. https://supabase.com/docs/guides/functions/function-configuration . A public function = `verify_jwt = false` and/or `auth: 'none'`.
- Service-role client: `ctx.supabaseAdmin` from withSupabase; or manually with env vars. Default env vars: `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` (JSON dict), `SUPABASE_PUBLISHABLE_KEYS` (JSON dict), `SUPABASE_DB_URL`, `SUPABASE_JWKS`; legacy `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` still available. https://supabase.com/docs/guides/functions/secrets
- Secrets: `supabase secrets set --env-file .env`, `supabase secrets set NAME=value`, `supabase secrets list`; read immediately without redeploy; local `supabase/functions/.env` (gitignore it). Limits: 100 secrets/project, 48 KiB per value. Same secrets page + limits page.
- Limits (https://supabase.com/docs/guides/functions/limits): memory 256 MB; wall clock Free 150 s / paid 400 s; CPU time 2 s per request (actual CPU, not waiting on I/O); request idle timeout 150 s (504 after); function size 20 MB (CLI bundling) or 5 MB (server-side bundling); 100 functions on Free; outbound SMTP 25/587 blocked; nested calls 30 per trace/60 s.
- Request body size: NOT in official docs (feature request https://github.com/supabase/supabase/issues/28053 notes the gap). A search summary of GitHub discussions claims a 10 MB cap (https://github.com/orgs/supabase/discussions/20864) [UNVERIFIED, treat as ~10MB unofficial]. Related issue about early responses on large uploads hanging: https://github.com/supabase/edge-runtime/issues/737.
- Streaming a request body to another fetch: not covered by docs. [CODE: mine] `fetch(url, { method: 'POST', body: req.body, duplex: 'half', headers })` is the standard Deno/Fetch pattern; avoid `await req.json()` / `.arrayBuffer()` for big bodies (buffers in 256 MB memory). Test with a real file before relying on it.
- CORS: only needed for browser invocations; docs do not address native. Native fetch has no CORS. For `supabase-js` >= 2.95.0: `import { corsHeaders } from 'npm:@supabase/supabase-js@^2/cors'`. https://supabase.com/docs/guides/functions/cors

## 4. Tests and CLI

- Tests: `*.test.ts` run with `deno test` (e.g. `deno test supabase/functions/tests/process-ticket/index.test.ts --allow-env`); add a `deno task test` in deno.json; uses `@std/testing` and `@std/testing/bdd`. Recommended structure: pure logic in separate modules (`pricing.ts`) unit-tested directly; `index.ts` tested separately; tests under `supabase/functions/tests/`. Docker is not mentioned as needed. https://supabase.com/docs/guides/functions/unit-test
- Handler structure for Docker-free tests [CODE: mine / inference]: export a plain `handle(req: Request, deps): Promise<Response>` from `handler.ts`, inject the supabase client/fetch/crypto key as deps, and keep `index.ts` as a thin wrapper (`export default { fetch: withSupabase(..., (req, ctx) => handle(req, { admin: ctx.supabaseAdmin, ... })) }`). Test with `new Request(...)`. Needs Deno installed locally (not the Supabase CLI).
- CLI on Windows: Scoop (`scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` then `scoop install supabase`) or `npm install supabase --save-dev` then `npx supabase <cmd>`; Node 20+ for npx. https://supabase.com/docs/guides/local-development/cli/getting-started
- Docker Desktop needed: `supabase start` / local stack, `functions serve`, `db diff`, `db dump` (pg_dump). https://supabase.com/docs/guides/functions/quickstart and https://supabase.com/docs/reference/cli/supabase-db-push (reference summary)
- No Docker, login only: `supabase login` (or `SUPABASE_ACCESS_TOKEN`, `--token`), `supabase link --project-ref X`, `supabase functions deploy <name>` ("automatically falls back to API-based deployment if Docker isn't available"), `supabase secrets set`. https://supabase.com/docs/reference/cli/supabase-login ; quickstart page. `supabase db push` needs the linked project and DB password (`SUPABASE_DB_PASSWORD` or prompt), not Docker. Same db-push reference page.

## 5. Postgres

- RLS: enabling RLS with no policies denies anon/authenticated; the service/secret key bypasses RLS (standard Supabase behaviour; the RLS page fetched mentions grants+policies, and "secret keys bypass RLS" appears on the secrets page: `SUPABASE_SECRET_KEYS` "bypass Row Level Security"). Note the RLS page now stresses GRANTs too: a missing grant raises error 42501 before policies run. https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/functions/secrets . SQL: `alter table public.x enable row level security;`
- Migrations: `supabase/migrations/<timestamp>_<description>.sql`, created via `supabase migration new <name>`; apply remote with `supabase db push`. https://supabase.com/docs/guides/local-development/overview
- Vault: `vault.create_secret('...', name, description)`, `vault.update_secret(uuid, ...)`, read via `vault.decrypted_secrets` view; libsodium AEAD; key held outside the DB. Docs do not state edge-function access or limits; access = SQL privileges on the view. https://supabase.com/docs/guides/database/vault
  Recommendation: for a per-user third-party token store, app-level AES-GCM in the function with the master key in `supabase secrets` is simpler and testable in Deno without a DB; Vault is fine too but needs SQL RPC from the service role. (Opinion.)
- AES-GCM in Deno [CODE: mine, standard WebCrypto per MDN, not from Supabase docs]:
  ```ts
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
  const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
  async function importKey(b64Key: string) { // 32 random bytes, base64: `openssl rand -base64 32`
    return crypto.subtle.importKey('raw', unb64(b64Key), 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)))
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12)
    return b64(out)
  }
  export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
    const buf = unb64(payload)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
    return new TextDecoder().decode(pt)
  }
  ```
  Set the key: `supabase secrets set TOKEN_ENC_KEY=<base64 32 bytes>`; read with `Deno.env.get('TOKEN_ENC_KEY')`. Unique IV per encryption (never reuse); decrypt throws on tampering. Works in `deno test` unchanged.

## 6. Free plan

- Pausing: Free projects are paused when they lack "sufficient user database activity over the past week"; a few requests/day suffice; warning email about one week before; dashboard visit or API calls prevent it; paused projects restorable for 1 year in Studio; Pro never pauses. https://supabase.com/docs/guides/platform/free-project-pausing
  Single-user implication: if the user doesn't open the app for a week, the project can pause; the first request fails until restored from the dashboard.
- Edge function invocations: 500,000/month on Free. Other free quotas: 5 GB egress, 500 MB DB, 1 GB storage, 50,000 MAU; 2 free projects per org owner (paused don't count). https://supabase.com/docs/guides/platform/billing-on-supabase
- Edge limits on Free: see section 3 (150 s wall clock, 2 s CPU, 256 MB, 100 functions).

## Surprises / contradictions to common assumptions

1. Expo's own Supabase guide now uses `expo-sqlite/localStorage/install` (storage: localStorage), not SecureStore or AsyncStorage, and has no url polyfill (https://docs.expo.dev/guides/using-supabase.md). Supabase's own quickstarts still show AsyncStorage + react-native-url-polyfill, and LargeSecureStore (aes-js) is still their "secure" tutorial.
2. Edge Function auth docs now centre on `@supabase/server` `withSupabase({ auth: 'user' })` with `ctx.userClaims` / `ctx.supabaseAdmin`, `export default { fetch }`, and new env vars `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` (JSON dicts); `SERVICE_ROLE_KEY` is legacy.
3. Wall-clock limit on Free is 150 s, but CPU time is only 2 s and memory 256 MB; request body size limit is undocumented (unofficial ~10 MB), so large video upload through a function is risky; do not buffer bodies.
4. Supabase's Apple doc explicitly says to add `host.exp.Exponent` to Client IDs for Expo Go, and its Expo example uses no nonce at all.
5. `functions deploy` works without Docker (API fallback); only `supabase start`, `functions serve`, `db diff/dump` need Docker Desktop. `db push` needs the DB password, not Docker.
6. Free projects pause on ~1 week of low activity (restore window 1 year); RLS docs now stress explicit GRANTs in addition to policies (42501 error when grant missing).
