# Revoke Sign in with Apple when an account is deleted — design

Date: 2026-10-14. Branch: `apple-revoke` (from `next-build` @ 7759e8b). Plan: `docs/superpowers/plans/2026-10-14-apple-revoke.md`.

**Why.** App Store Review Guideline 5.1.1(v): an app that offers account creation must let the user delete the account in the app,
and an app that offers Sign in with Apple is expected to revoke the user's Apple tokens through Apple's REST API when that account
is deleted. Clipy already deletes accounts (AGENTS.md, "Signing in": `useDeleteAccount` → `deleteAccount()` → `api.deleteAccount()`
→ the `delete-account` function). What is missing is the Apple revocation.

**State of Apple sign-in today.** Apple sign-in fails on Apple's side ("Sign Up Not Completed", a server-side App ID registration
fault Apple must fix). Nothing in this design can be tried end to end until that is fixed (§9).

## 0. What was read in the tree

| Fact | Where |
|---|---|
| Apple sign-in is the native ID-token flow: `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })`, then `supabase.auth.signInWithIdToken({ provider: "apple", token: identityToken })`. The `authorizationCode` is NEVER sent anywhere, so neither Clipy nor Supabase holds an Apple refresh or access token. Cancel is `ERR_REQUEST_CANCELED` → `"cancelled"`; Expo Go is refused before the sheet | `src/publish/supabase.ts:120-135` |
| `deleteAccount()` (phone): `api.deleteAccount()` with no argument, then `signOut({ scope: "local" })`, stored session removed by hand if still there; failures map through `SAID` / `DELETE_FAILED` | `src/publish/supabase.ts:152-178` |
| `api.deleteAccount` posts `delete-account` with `json: {}` — the body is the two bytes `{}` (pinned: `api.test.ts:105-118`) | `src/publish/api.ts:70-71` |
| `useDeleteAccount`: one system alert ("Delete your Clipy account?", Cancel / Delete), a ref so one request at a time, spinner, toast "Account deleted." or the sentence | `src/publish/useDeleteAccount.ts` |
| Pins of that flow: alert words and buttons, `deleteAccount` called once WITH NO ARGUMENTS, the double press, the failure path | `src/publish/__tests__/AccountsScreen.test.tsx:283-400`, `src/publish/__tests__/deleteAccount.test.ts` |
| `delete-account/index.ts` passes `_body` nowhere: `deleteAccount(deps, user)`. `serveJson` parses any POST body as JSON (capped 64 KB; unparseable → `null`), so an OLD server simply ignores a new field | `supabase/functions/delete-account/index.ts`, `supabase/functions/_shared/runtime.ts:66-75` |
| The handler: `listAccounts` → `Promise.race([allSettled(disconnect…), budget])` (`REVOKE_BUDGET_MS` 8000) → `deleteUserData` → `deleteAuthUser` (404 = ok); logs carry no token | `supabase/functions/_shared/handlers/deleteAccount.ts` |
| Server secrets are read only through `deps.env.get` (built in `runtime.ts` from `Deno.env`); a switch is a pure function of `env` — `directOn = (c) => c.env.get("TIKTOK_DIRECT_POST") === "true"` | `runtime.ts:15-18`, `platforms/tiktok.ts:15` |
| Form posts use `formBody` (`URLSearchParams(...).toString()`) and `FORM` (`Content-Type: application/x-www-form-urlencoded`) | `supabase/functions/_shared/platforms/http.ts:16-17` |
| Server tests: Node (`jest.server.config.js`, `testEnvironment: "node"`), `fakeDeps` with a `jest.fn()` fetch and `now` = 2026-10-02T10:00:00Z; WebCrypto is the global `crypto.subtle` (already used by `crypto.ts`) | `supabase/functions/_shared/__tests__/fakes.ts` |
| expo-apple-authentication 57.0.2: `signInAsync(options?)` with `requestedScopes?`, `state?`, `nonce?`; the credential has `user` (Apple's stable id), `identityToken`, `authorizationCode: string \| null`; `isAvailableAsync()`; cancel rejects `ERR_REQUEST_CANCELED`. Under Jest it is mocked in `jest.setup.ts:109-113` (`isAvailableAsync` → true, `signInAsync` a bare `jest.fn()`) | `node_modules/expo-apple-authentication/build/*.d.ts` |
| @supabase/auth-js 2.117.2: `User.app_metadata: { provider?: string; providers?: string[] }` ("the first provider" / "all providers linked"), `User.identities?: UserIdentity[]` with `provider` and `identity_data?: { [key]: any }` | `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:338-410` |
| `AFTER_SHEET_MS` (350) is the app's one wait between a system sheet answering and the next system presentation (`mediaSource.ts` uses it before the camera) | `src/projects/ProjectActionsSheet.tsx:12` |
| Bundle id `com.astinos.clipy`, `usesAppleSignIn: true` | `app.json:12-14` |

## 1. What Apple says (fetched 2026-10-14 from developer.apple.com's documentation JSON — quoted briefly)

- **Token validation** — `POST https://appleid.apple.com/auth/token`, form data `client_id` (App ID or Services ID), `client_secret`,
  `code` ("single-use only and valid for five minutes"), `grant_type` = `authorization_code`, and `redirect_uri` "only if the
  application provided a `redirect_uri` in the initial authorization request" (the native sheet provides none → not sent). The
  answer (`TokenResponse`): `access_token`, `expires_in`, `id_token`, `refresh_token`, `token_type`.
- **Token revocation** — `POST https://appleid.apple.com/auth/revoke`, form data `client_id`, `client_secret`, `token` ("the user
  refresh token or access token intended to be revoked"), `token_type_hint` (`refresh_token` or `access_token`). 200 with no body
  when revoked "or was previously invalid"; 400 with an `ErrorResponse`.
- **ErrorResponse** — one `error` of `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`,
  `unsupported_grant_type`, `invalid_scope`.
- **Creating a client secret** (the page now lives under Account and Organizational Data Sharing; same JWT): header `alg` `ES256`,
  `kid` the 10-character key id; claims `iss` = the 10-character Team ID, `iat`, `exp` (more than 15777000 s ahead is an error),
  `aud` = `https://appleid.apple.com`, `sub` = "the same App ID or Services ID that you use as the `client_id`"; signed with ECDSA
  P-256 and SHA-256.
- **TN3194, "Handling account deletions and revoking tokens for Sign in with Apple"** (first published 2025-10-03): the revoke
  endpoint "is the only way to programmatically invalidate user tokens"; and — the sentence that decides §3 — if you do not have the
  user's refresh token, access token or authorization code, "you must still fulfill the user's account deletion request": delete
  the data and direct the user to Apple's support page **102571** ("Manage your apps with Sign in with Apple": Settings → your name
  → Sign in with Apple → the app → Delete) to remove the app themselves.

UNVERIFIED (could not be fetched): the old URLs `developer.apple.com/documentation/sign_in_with_apple/revoke_tokens` and
`…/generate_and_validate_tokens` now 404; the JSON of their successors (`/documentation/signinwithapplerestapi/revoke-tokens`,
`…/generate-and-validate-tokens`, `…/tokenresponse`, `…/errorresponse`) was read instead. The 5.1.1(v) text itself was not fetched.

## 2. Who is an Apple user

`appleIdentity()` in `src/publish/supabase.ts` reads the session ONCE (`supabase.auth.getSession()`) and answers:

- an Apple user when `user.app_metadata.providers` contains `"apple"`, OR `user.app_metadata.provider === "apple"`, OR
  `user.identities` has an entry with `provider === "apple"`;
- otherwise (email, Google, no session, a session that cannot be read, no backend) `null`.

Why `providers` and not only `provider`: Supabase links identities that share a verified email, so a person who signed up by email
and later used Apple has `provider: "email"` but `providers: ["email", "apple"]` — Apple holds an authorization for Clipy for that
person too, so they are an Apple user here.

The answer carries `sub`: the Apple identity's `identity_data.sub` when the session has it (string, non-empty), else `null`. It is
used for one check only (§3): that the Apple ID that confirms is the one that signed in.

Email and Google users: NOTHING changes — same alert, no wait, no Apple call, `deleteAccount()` with no argument, the request body
`{}` byte for byte. Pinned by the existing tests (unchanged) plus one new test that says so explicitly.

## 3. The phone flow and its words

1. Tap **Delete account** → the existing alert, word for word ("Delete your Clipy account?", the same message, Cancel / Delete).
   Cancel: nothing, as today.
2. **Delete** → the row shows its spinner and the ref is held (as today). `appleIdentity()`:
   - `null` → `deleteAccount()` exactly as today.
   - an Apple user → wait `AFTER_SHEET_MS` (the alert must be gone before iOS presents another sheet — the same reason and the same
     constant as `mediaSource.ts`), then `confirmWithApple(sub)` shows Apple's own sheet:
     `AppleAuthentication.signInAsync({ requestedScopes: [] })` — no name, no email asked; only the `authorizationCode` is used.
3. Apple's sheet gives a code (and, when `sub` is known, `credential.user === sub`) → `deleteAccount(code)` → the request body is
   `{"appleCode":"<code>"}` → "Account deleted." exactly as today, or the same failure sentences as today.
4. **Apple did not confirm** — the user closed Apple's sheet, Apple refused or failed, the phone cannot show the sheet
   (`isAvailableAsync()` false, Expo Go), Apple returned no code, or a DIFFERENT Apple ID confirmed — the ref is let go, the spinner
   goes, and a second system alert asks:

   - Title: **Delete without Apple's confirmation?**
   - Message: **Your Clipy account can still be deleted. Apple will keep listing Clipy under Sign in with Apple until you remove it in Settings, under your name.**
   - Buttons: **Cancel** (style `cancel`: nothing happens, still signed in, no toast) and **Delete Anyway** (style `destructive`:
     `deleteAccount()` with NO code, under the same ref, then "Account deleted." or the failure sentence as today).

**The decision, and why.** Not "cancel = no deletion": TN3194 says a deletion must be fulfilled even without a token or code, and
Guideline 5.1.1(v) is first of all about letting the user delete. A user whose Apple sheet does not work (as on every phone today,
while Apple's App ID fault lasts) must still be able to delete. Not "delete silently without it" either: the revocation is what
Apple expects, so the user is asked once more and told, in one sentence, the one thing that stays (Clipy in their Sign in with Apple
list) and where to remove it — which is exactly TN3194's manual path. One alert for every cause (a deliberate close and a failure
read the same: in both the user can choose again). Casing: the alert title and message are sentence style; "Delete Anyway" is title
style (casing.guard).

The words name no Settings path beyond "under your name": Apple's support page gives Settings → your name → Sign in with Apple, and
the level below the name has moved between iOS versions (UNVERIFIED for iOS 26), so the sentence stays true on all of them.

The Apple code is single-use and lives 5 minutes; it is taken right before the request, held only in a local variable, sent once,
never stored, logged or shown. A second tap is impossible while the ref is held (the row is disabled, the old alert's Delete does
nothing); "Delete Anyway" takes the same ref.

## 4. The request

- `api.deleteAccount(body?: { appleCode: string })`: the body is `{ appleCode }` only when a code is given, otherwise `{}` (the
  existing pin `init.body === "{}"` stays).
- `deleteAccount(appleCode?: string)` (supabase.ts) calls `api.deleteAccount({ appleCode })` with a code and `api.deleteAccount()`
  without (so the existing pin `toHaveBeenCalledWith()` stays). Everything after the request is unchanged.

## 5. The server

New file `supabase/functions/_shared/apple.ts` (plain TS, web-standard APIs, no `Deno.*`):

- Constants: `APPLE_TEAM_ID = "H7WG867R7K"`, `APPLE_CLIENT_ID = "com.astinos.clipy"` (the bundle id: the native sheet's code is
  issued for the App ID, and Supabase's Apple provider lists the same id), `APPLE_SECRET_SECONDS = 300`.
- `pemBody(text)`: the PKCS#8 bytes of a `.p8` — removes every `-----…-----` marker, literal `\n` sequences and all white space,
  then base64-decodes. So the key may be stored as the file's text OR squeezed onto one line (the README's clipboard command does
  that, because `npx.cmd` is a batch file and cannot pass a line break).
- `appleClientSecret(p8, keyId, now)`: `crypto.subtle.importKey("pkcs8", pemBody(p8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])`,
  header `{"alg":"ES256","kid":keyId}`, claims `{"iss":APPLE_TEAM_ID,"iat":⌊now⌋,"exp":⌊now⌋+300,"aud":"https://appleid.apple.com","sub":APPLE_CLIENT_ID}`,
  base64url without padding, signature `crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, …)`. WebCrypto's ECDSA signature
  IS the raw `r ‖ s` (64 bytes for P-256), which is exactly the JWS ES256 form (RFC 7518 §3.4) — no DER conversion; the test
  checks it with Node's own verifier told `dsaEncoding: "ieee-p1363"`. The secret is made per request and lives 5 minutes, not 6
  months: it is never stored, so a short life costs nothing.
- `appleRevokeOn(env)`: the SWITCH — on only when BOTH `APPLE_REVOKE_KEY` (the `.p8` text) and `APPLE_KEY_ID` are set and not
  empty. Off ⇒ nothing is asked of Apple.
- `revokeApple(deps, code)` → `"off" | "revoked" | "failed"`, never throws: switch off → `"off"`. Else make the secret; POST
  `/auth/token` with exactly `client_id, client_secret, code, grant_type=authorization_code` (in that order, `formBody` + `FORM`);
  a non-2xx or unreadable answer → log `apple revoke: code not exchanged <status> <error code>` → `"failed"`. Revoke the
  `refresh_token` (hint `refresh_token`) — or, when only an access token came back, that (hint `access_token`); neither → log, `"failed"`.
  POST `/auth/revoke` with exactly `client_id, client_secret, token, token_type_hint`; non-2xx → log `apple revoke: refused
  <status> <error code>` → `"failed"`; 2xx → log `apple revoke: done` → `"revoked"`. Any throw (a key that will not import, the
  network) → log `apple revoke: failed <error name>` → `"failed"`. Logs carry the status and Apple's error code through
  `plainCode`, NEVER the code, the secret, a token or the key.

`handlers/deleteAccount.ts`:

- `appleCodeOf(body)`: the body's `appleCode` when it is a string of 1–2048 printable ASCII characters without spaces, else `null`.
  Nothing else of the body is read; the USER is still only the verified token's.
- `deleteAccount(deps, userId, budgetMs = REVOKE_BUDGET_MS, appleCode: string | null = null)`: step 1 now holds the Apple
  revocation BESIDE the platforms' disconnects, started first, all inside the one `budgetMs` race — and it runs even when the
  accounts cannot be listed. Steps 2 and 3 are untouched: the revocation can never block or fail the deletion, and it always
  happens BEFORE the auth user is deleted.
- `delete-account/index.ts`: `deleteAccount(deps, user, REVOKE_BUDGET_MS, appleCodeOf(body))`.

Byte for byte as today (pinned): a request with no code; a request with a code while the switch is off (Apple never asked, same
answer, same rows, same log). Secrets are read only through `deps.env` (built in `runtime.ts`): no `Deno.*` anywhere new.

## 6. Old and new together

- Old app + new server: no `appleCode` → today's deletion.
- New app + old server: the field is ignored (`_body` is unused) → today's deletion; Apple not revoked (as today).
- New app + new server, switch off (the secrets not set yet): today's deletion; the Apple user still sees Apple's sheet (harmless).
- Expo Go: an Apple user cannot be signed in there; if one somehow is, the sheet is not shown and the second alert offers Delete Anyway.

## 7. Setup for the owner (goes into `supabase/README.md` §14)

1. Deploy (`npx.cmd supabase functions deploy`) — with no secret the switch is off and deleting works as before.
2. In the Apple developer account: Certificates, Identifiers & Profiles → **Keys** → **+** → name it "Clipy Sign in with Apple",
   tick **Sign in with Apple** → **Configure** → primary App ID **com.astinos.clipy** → Save → Continue → **Register** →
   **Download** the `.p8` (Apple lets you download it ONCE; keep the file safe) and note the **Key ID** (10 characters). Creating a
   key is an addition — the owner's rule (never delete or revoke anything in the Apple account) is kept.
3. Secrets by the clipboard method — nothing is pasted into the chat: the owner copies the Key ID, the developer runs
   `$k = (Get-Clipboard -Raw).Trim(); npx.cmd supabase secrets set "APPLE_KEY_ID=$k"; Remove-Variable k`; the owner opens the `.p8`
   in Notepad, Ctrl+A, Ctrl+C, and the developer runs
   `$k = (Get-Clipboard -Raw) -replace '\s',''; npx.cmd supabase secrets set "APPLE_REVOKE_KEY=$k"; Remove-Variable k`; then the
   owner copies something harmless to clear the clipboard. Secrets take effect at once.
4. To switch it off again: `npx.cmd supabase secrets unset APPLE_REVOKE_KEY APPLE_KEY_ID` (our server's secrets, not Apple's).

## 8. Tests

Server (Node, `npm run test:server`):
- `apple.test.ts` (new): the client secret's header, claims, base64url, 64-byte signature verified by WebCrypto AND by Node with
  `dsaEncoding: "ieee-p1363"`, a test key generated in the test; `pemBody` for a multi-line, a CRLF, a squeezed one-line and a
  literal-`\n` key; the switch (neither / one / both secrets); the exchange's exact form body and URL; the revoke's exact form body
  (refresh token preferred; access token when it is all there is); `invalid_grant`, a revoke refusal, a network throw, a bad key, an
  answer with no token → `"failed"` with the stated log lines; no code / secret / token / key text in any log.
- `deleteAccount.test.ts` (existing tests unchanged; new ones appended): no code → Apple never asked; code + switch off → Apple
  never asked, same result; code + on → revoked BEFORE the rows and the auth user; Apple failing or never answering → the deletion
  goes on within the budget; Apple asked even when the accounts cannot be listed; `appleCodeOf` accepts / refuses.

Phone (Jest, `npm run test:app`):
- `api.test.ts`: with a code the body is `{"appleCode":"…"}`; without, still `{}` (existing pin).
- `deleteAccount.test.ts`: `deleteAccount("code")` sends `{ appleCode: "code" }`; `deleteAccount()` still sends nothing.
- `supabaseApple.test.ts` (new): `appleIdentity` for apple / email+apple / email / google / no session / unreadable session /
  no backend; `confirmWithApple` — `signInAsync({ requestedScopes: [] })` once, a code; cancel, error, no code, another Apple ID,
  `isAvailableAsync` false, Expo Go → `null`, nothing thrown.
- `deleteAccount.apple.test.tsx` (new, the real Accounts screen): an Apple user → Apple's sheet only after `AFTER_SHEET_MS`, the code
  sent once; the second alert word for word on cancel; its Cancel does nothing; Delete Anyway deletes with no code, once, guarded
  against a double press; an email / Google user never meets any of it.
- `AccountsScreen.test.tsx`: its `../supabase` mock gains `appleIdentity` (→ `null`) and `confirmWithApple`; nothing else changes.

## 9. What only a live run can settle (and none of it before Apple sign-in works)

- That a SECOND `signInAsync` for an already-authorized Apple ID shows the short "continue" sheet and returns an `authorizationCode`.
- That the code from the native sheet exchanges with `client_id = com.astinos.clipy` and no `redirect_uri`.
- That Apple accepts the 5-minute client secret signed in Supabase's Deno runtime with a real `.p8` (Deno's WebCrypto importing
  Apple's PKCS#8 EC key — tested here only with a Node-generated key).
- That `/auth/token` returns a `refresh_token` for that code, and `/auth/revoke` answers 200.
- That after revocation Clipy disappears from the test Apple ID's Sign in with Apple list, and the next Apple sign-in asks for name
  and email again (a NEW Clipy account — the old one was deleted).
- That the session's user carries `identities[].identity_data.sub` for an Apple sign-in (if not, `sub` is `null` and the Apple-ID
  match check is simply skipped).
- That iOS presents Apple's sheet after the alert with the `AFTER_SHEET_MS` wait (no "already presenting" failure).
- That the README's clipboard commands pass the squeezed key intact through `npx.cmd`.
