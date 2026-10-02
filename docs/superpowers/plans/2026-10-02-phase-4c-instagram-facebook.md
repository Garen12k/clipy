# Phase 4C — Instagram Reels + Facebook Page Reels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram (Reels) and Facebook (Page Reels) to the posting pipeline: one Meta login per platform, the phone streams the video to Meta's upload host, the server creates the upload, publishes and returns the link.

**Architecture:** Two server adapters (`platforms/facebook.ts`, `platforms/instagram.ts`) share `platforms/meta.ts` (Graph helpers, Facebook Login, Page selection). Both use Meta's `rupload.facebook.com` host, which requires `Authorization: OAuth <token>` on the upload request and documents only "one request carrying the file from an offset". So a new client protocol, `meta-rupload`, streams the whole file natively from the phone in one request; `post-prepare` returns the upload headers including the Page token, which the phone holds in memory only for that upload. Instagram needs a publish call after Meta finishes processing, so prepare results gain an optional `wait` hint (longer polling; a timeout is a resumable failure, not "done").

**Tech Stack:** as 4A/4B. Graph API version pinned in one constant (`v25.0`).

**Spec:** `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md` (§10 overrides; this plan amends §10 — see Task 4). Research with source URLs: `docs/superpowers/research/p4-research-meta.md`.

## Global Constraints

- **Unverified against live Meta** (no Meta app exists). Before coding each endpoint, re-fetch the cited Meta doc pages and correct this plan where they differ; list every correction with its URL in the task report. Known uncertain points to check first: whether classic `scope=` works for a Business-type app or `config_id` (Facebook Login for Business) is mandatory; the exact fields of `/me/accounts`; whether a Page token is accepted for `/{ig-user-id}/media` and for the `rupload` host; the container status fields; the Facebook Reel permalink field.
- **Token on the phone (ruling, amends the spec):** for `meta-rupload` the server returns `uploadHeaders` containing `Authorization: OAuth <page token>`. The phone keeps it only inside the in-memory `Prepared` for that post, sends it only to `https://rupload.facebook.com/…`, never logs or stores it. The server must refuse to return such headers for any upload URL whose host is not `rupload.facebook.com`.
- Server adapter rules from 4A: web-standard APIs, `.ts` imports, no `Deno.*`; tokens and the app secret never in a thrown message, response body (other than the ruled `uploadHeaders`) or log; platform error text verbatim (`error.error_user_msg` → `error.message`); Graph error code 190 / 102 (and permission codes 10, 200–299) mean reconnect via `isAuthError`; rate-limit codes (4, 17, 32, 613) map to HTTP 429; codes 1 and 2 to 503.
- A finished upload is never re-uploaded (4A rule). Temporary failures use `platform_unavailable` (4B).
- Limits: Instagram Reels 3 s – 15 min, ≤ 300 MB, caption ≤ 2200; Facebook Reels 3 – 90 s; 30 Facebook Reels / day per Page; Instagram's daily quota is whatever Meta enforces (error shown verbatim).
- UI from the kit and theme only; `src/__tests__/noHexLiterals.test.ts` green; Expo Go safe; no new dependencies.
- Windows: PowerShell tool, no `&&`, `npx.cmd`. Checks: `npm run typecheck`, `npm test`, `npx.cmd expo-doctor`.
- `git add` explicit paths only. Every commit message ends with exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Meta core, Facebook adapter, `meta-rupload` + `wait` plumbing

**Files:**
- Create: `supabase/functions/_shared/platforms/{meta,facebook}.ts`, `supabase/functions/_shared/__tests__/{meta,facebook}.test.ts`
- Modify: `supabase/functions/_shared/types.ts`, `handlers/postPrepare.ts` (+ its tests), `platforms/registry.ts`

**Interfaces (produced):**
```ts
// types.ts
export type UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks" | "meta-rupload";
/** How long the phone should keep polling after finalize, and whether running out of time means "tap Resume" rather than "done". */
export interface WaitHint { maxSeconds: number; resumeOnTimeout: boolean }
export interface PrepareResult { /* existing */ wait?: WaitHint }
// handlers/postPrepare.ts — PrepareResponse gains `wait?: WaitHint` (passed through unchanged)
// platforms/meta.ts
export const GRAPH = "https://graph.facebook.com/v25.0";
export const RUPLOAD_HOST = "rupload.facebook.com";
export const META_SECRETS = ["META_APP_ID", "META_APP_SECRET"] as const;
export function metaAuthUrl(c: AdapterCtx, state: string, scopes: string[]): string        // uses config_id when META_LOGIN_CONFIG_ID is set, else scope=
export function graph<T>(c: AdapterCtx, platform: PlatformId, path: string, init?: { method?: "GET" | "POST"; token?: string; params?: Record<string, string> }): Promise<T>
export interface MetaPage { id: string; name: string; accessToken: string; tasks: string[]; pictureUrl: string | null; instagram: { id: string; username: string; pictureUrl: string | null } | null }
export function exchangeForPages(c: AdapterCtx, platform: PlatformId, code: string): Promise<MetaPage[]>   // code → short → long-lived user token → /me/accounts
export function ruploadHeaders(token: string, fileSize: number, uploadUrl: string): Record<string, string>   // throws unless the URL host is rupload.facebook.com over https
export function metaIsAuthError(e: PlatformError): boolean
```

**Behaviour**
- `graph()` sends `params` as a query string for GET and as a form body for POST, with `access_token` added from `token`; parses `{ error: { message, code, error_subcode, error_user_msg } }`; throws `PlatformError(platform, status, error_user_msg || message || "Meta returned <http status>")` with `reason = String(code)` and status mapped: codes 190/102 → 401; 4/17/32/613 → 429; 1/2 → 503; otherwise the HTTP status (400 when Meta sends 200 with an `error` object).
- `metaAuthUrl`: `https://www.facebook.com/v25.0/dialog/oauth?client_id&redirect_uri&state&response_type=code` plus `config_id=<META_LOGIN_CONFIG_ID>` when that secret is set, otherwise `scope=<comma list>`.
- `exchangeForPages`: `GET {GRAPH}/oauth/access_token?client_id&redirect_uri&client_secret&code` → short-lived user token → `GET {GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token` → long-lived user token → `GET {GRAPH}/me/accounts?fields=id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}&limit=100` → `MetaPage[]`. (Page tokens obtained from a long-lived user token do not expire.)
- **Facebook adapter** (`id: "facebook"`, `secrets: META_SECRETS`, scopes `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`):
  - `exchange`: first Page whose `tasks` include `CREATE_CONTENT`; none → `PlatformError("facebook", 400, "No Facebook Page you can post to was found. Create a Page (or pick it in the Facebook dialog) and connect again.")`. Returns `{ accessToken: page.accessToken, refreshToken: null, expiresAt: null, scopes }`.
  - `refresh`: never needed (no expiry) — throw `PlatformError("facebook", 401, "Reconnect Facebook in Accounts.")`.
  - `revoke`: no-op (the Page token cannot revoke the user's grant; the README says how to remove the app in Facebook settings).
  - `profile(token)`: `GET /me?fields=id,name,picture{url}` (with a Page token, "me" is the Page) → `{ accountId: id, displayName: name, avatarUrl }`.
  - `prepare`: `GET /me?fields=id` → `POST /{page-id}/video_reels` `upload_phase=start` → `{ video_id, upload_url }`; returns `{ protocol: "meta-rupload", uploadUrl: upload_url, uploadHeaders: ruploadHeaders(token, fileSize, upload_url), chunkSize: fileSize, ref: { videoId, pageId } }`. A missing `video_id`/`upload_url` → `PlatformError(…, 502, "Facebook did not return an upload address.")`.
  - `finalize`: `POST /{pageId}/video_reels` with `video_id`, `upload_phase=finish`, `video_state=PUBLISHED`, `description=<caption>`; then the same check as `status`.
  - `status`: `GET /{videoId}?fields=status` → `status.video_status`: `error`/`expired` → `PlatformError(…, 400, "Facebook couldn't process this video.")` (append Meta's own text when the response has one); `ready` or `status.publishing_phase.publish_status === "published"` → `{ status: "done", url: "https://www.facebook.com/reel/<videoId>" }`; otherwise `{ status: "processing" }`.
  - `isAuthError: metaIsAuthError`. `wait`: `{ maxSeconds: 300, resumeOnTimeout: false }` (the Reel publishes on Facebook's side once processing ends).
- `postPrepare` passes `wait` through; nothing else in the handlers changes.

- [ ] **Step 1: Failing tests** (same fake-fetch `ctx(responses, env)` pattern as `youtube.test.ts`; env `META_APP_ID: "app"`, `META_APP_SECRET: "sec"`). Write one test per bullet:
  - `meta.test.ts`: `metaAuthUrl` with and without `META_LOGIN_CONFIG_ID` (exact query objects); `graph` GET puts params + `access_token` in the query, POST puts them in a form body; error mapping for codes 190 (→ 401, reason "190"), 4 (→ 429), 2 (→ 503), 100 (→ HTTP status), an `error` object inside HTTP 200 (→ 400), `error_user_msg` preferred over `message`; `exchangeForPages` makes exactly three calls in order with the documented parameters and maps pages (with and without `instagram_business_account`, with missing `picture`); `ruploadHeaders` returns `{ Authorization: "OAuth tok", offset: "0", file_size: "123" }` for `https://rupload.facebook.com/video-upload/v25.0/1` and throws for `https://evil.example/x`, `http://rupload.facebook.com/x` and `https://rupload.facebook.com.evil.example/x`; `metaIsAuthError` true for reasons "190", "102", "10", "200", "250", false for "4", "100", undefined.
  - `facebook.test.ts`: `authUrl` scopes; `exchange` picks the first Page with `CREATE_CONTENT` and returns its token with no expiry; no eligible Page → the message above; `profile`; `prepare` (two calls, exact URLs and form bodies, result shape incl. `wait` and the headers); `prepare` with a non-rupload `upload_url` rejects (502) and never returns the token; `finalize` sends the finish call with the caption and returns processing/done per the status response; `status` for `processing`, `ready`, `published`, `error`; `refresh` rejects with 401; `secrets`.
  - `post.test.ts`: `postPrepare` returns the adapter's `wait` when present and omits it otherwise.
- [ ] **Step 2: Run** — `npm run test:server` → FAIL.
- [ ] **Step 3: Implement** per the Behaviour list (follow `youtube.ts` / `tiktok.ts` style; keep each file focused: `meta.ts` holds everything shared).
- [ ] **Step 4: Verify** — `npm run test:server`; `npm run typecheck`.
- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared
git commit -m "feat(server): Meta core and Facebook Page Reels adapter; meta-rupload protocol and wait hint"
```

---

### Task 2: Instagram adapter, setup guide

**Files:**
- Create: `supabase/functions/_shared/platforms/instagram.ts`, `supabase/functions/_shared/__tests__/instagram.test.ts`
- Modify: `platforms/registry.ts`, `supabase/README.md`

**Behaviour** (`id: "instagram"`, `secrets: META_SECRETS`, scopes `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`):
- `exchange`: first Page with a non-null `instagram`; none → `PlatformError("instagram", 400, "No Instagram professional account is linked to your Facebook Page. Link one in Instagram (Settings → Account type and tools), then connect again.")`. Stores that Page's token (no expiry).
- `profile(token)`: `GET /me?fields=instagram_business_account{id,username,profile_picture_url}` → `{ accountId: ig.id, displayName: "@" + username, avatarUrl }`; missing → the same "No Instagram professional account…" error.
- `prepare`: resolve the IG user id (same `/me` call) → `POST /{ig-user-id}/media` with `media_type=REELS`, `upload_type=resumable`, `caption=<caption, cut to 2200 chars by whole characters>`, `share_to_feed=true` → `{ id, uri }`; returns `{ protocol: "meta-rupload", uploadUrl: uri, uploadHeaders: ruploadHeaders(token, fileSize, uri), chunkSize: fileSize, ref: { containerId: id, igUserId }, wait: { maxSeconds: 600, resumeOnTimeout: true } }`.
- `finalize` and `status` share one function, `publishWhenReady(ref)`:
  1. `GET /{containerId}?fields=status_code,status`.
  2. `IN_PROGRESS` → `{ status: "processing" }`.
  3. `ERROR` or `EXPIRED` → `PlatformError("instagram", 400, "Instagram couldn't process this video." + (status text ? " " + status : ""))`.
  4. `FINISHED` → `POST /{igUserId}/media_publish` `creation_id=<containerId>` → `{ id }` → `GET /{id}?fields=permalink` → `{ status: "done", url: permalink ?? null }` (a failure of the permalink call alone still returns done with `url: null`).
  5. `PUBLISHED` (already published by an earlier call whose answer was lost) → `{ status: "done", url: null }`.
- `refresh` rejects 401; `revoke` no-op; `isAuthError: metaIsAuthError`.

- [ ] **Step 1: Failing tests** — `instagram.test.ts`, one per bullet: scopes; `exchange` picks the Page with an Instagram account, error when none; `profile` (with and without the account); `prepare` — exact calls, the caption cut at 2200 whole characters (test with emoji), result incl. `wait` and headers, non-rupload `uri` rejected; `publishWhenReady` for `IN_PROGRESS`, `ERROR` (message includes Meta's status text), `EXPIRED`, `FINISHED` (three calls: status, publish, permalink → url), `FINISHED` with the permalink call failing (done, `url: null`, and the publish call made exactly once), `PUBLISHED` (no publish call); a Graph error 190 during publish surfaces as status 401; missing `containerId`/`igUserId` in the ref → `PlatformError(…, 502, "Instagram upload reference is missing.")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Register both `facebook` and `instagram` in `registry.ts` if Task 1 did not.
- [ ] **Step 4: `supabase/README.md`** — add an "Instagram and Facebook" section for a non-developer (numbered steps, one command per fenced `powershell` block, labels you could not confirm marked "may be named slightly differently"): switch Instagram to a professional account; create a Facebook Page and link the Instagram account to it; create the Meta app (Business type), add Facebook Login for Business and the Instagram product, create a login configuration with the permissions listed above and copy its Configuration ID, add the redirect URI (the same `oauth-callback` URL), copy App ID and App Secret; `supabase secrets set META_APP_ID=… META_APP_SECRET=… META_LOGIN_CONFIG_ID=…`; in the Facebook dialog choose exactly one Page; "What to expect": Instagram posts as a Reel and can take a few minutes to process (keep the Post screen open, or press Resume later); Facebook Reels must be 3–90 seconds; while the Meta app is in Development mode a Facebook post may be visible only to you until the app is switched to Live; the phone is given the Page's access token for the duration of the upload (kept in memory only); to remove Clipy's access, use Facebook → Settings → Business integrations; nothing here has run against live Meta. Add a "First live run: Instagram/Facebook" checklist (login with `config_id` vs `scope`; Page token accepted for Instagram calls and for the upload host; the single-request upload succeeds; publish after processing; the Facebook Reel link opens).
- [ ] **Step 5: Verify** — `npm run test:server`; `npm run typecheck`. **Step 6: Commit**

```powershell
git add supabase/functions/_shared supabase/README.md
git commit -m "feat(server): Instagram Reels adapter; Meta setup guide"
```

---

### Task 3: `meta-rupload` upload and `wait` handling on the phone

**Files:**
- Create: `src/publish/wholeFileUpload.ts`
- Modify: `src/publish/{upload,api,runPost,usePost}.ts`, tests `src/publish/__tests__/{upload,runPost,api}.test.ts`, `jest.setup.ts` (mock of the upload API if needed)

**Interfaces (produced):**
```ts
// wholeFileUpload.ts — the only file that touches the native upload API
export interface WholeFileResult { status: number; body: string }
/** Streams the file as the raw request body (never loads it into JS memory). Rejects with an Error named "AbortError" when the signal aborts. */
export function postWholeFile(url: string, fileUri: string, headers: Record<string, string>, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<WholeFileResult>
// upload.ts
export function uploadMetaWhole(url: string, headers: Record<string, string>, fileUri: string, a: Pick<UploadArgs, "onProgress" | "signal">, post?: typeof postWholeFile): Promise<void>
// api.ts
export type UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks" | "meta-rupload";
export interface Prepared { /* existing */ wait?: { maxSeconds: number; resumeOnTimeout: boolean } }
// runPost.ts — PostDeps gains uploadMetaWhole
```

**Behaviour**
- `postWholeFile`: use `expo-file-system`'s upload task (confirm in `node_modules/expo-file-system` typings and the v57 docs which API streams a file as a binary POST body with custom headers and progress: the new `File` upload/`createUploadTask` with `UploadType.BINARY_CONTENT`, or `createUploadTask` from `expo-file-system/legacy`); method POST; headers passed through unchanged; progress = bytes sent / total; abort cancels the native task. Keep it tiny; it is mocked in tests.
- `uploadMetaWhole`: refuses any URL that is not `https://rupload.facebook.com/…` (`UploadError("Unexpected upload address.", false)`) — the headers carry a token; aborted before start → "Upload cancelled."; calls `post`; a thrown error while aborted → "Upload cancelled."; a thrown error otherwise → `UploadError("The connection dropped. Post again to restart the upload.", false)`; non-2xx → `UploadError(<error.message from the JSON body, else the first 200 chars, else "Upload failed (<status>).">, false)`; 2xx whose JSON has `success === false` → the same treatment using `message`/`debug_info`; success → `onProgress(1)`. Never logs the headers.
- `runPost`: for `meta-rupload` do not open a chunk reader; call `deps.uploadMetaWhole(p.uploadUrl ?? "", p.uploadHeaders, job.video.fileUri, { onProgress, signal })`; `planIsValid` requires `uploadUrl` for it. Polling uses `p.wait`: `limit = ceil((wait?.maxSeconds ?? 120) / 3)` polls of 3 s. On running out of polls: if `wait?.resumeOnTimeout` → row `failed`, `resumable: true`, message `"<Label> is still processing the video. Tap Resume in a minute to finish posting."`, keeping the ResumeInfo (resume goes straight to finalize/status); otherwise the existing "Still processing on <Label> — check the app later." done-without-link. Cancel during polling with `resumeOnTimeout` → the same resumable failure (not "done"), because the post is not published yet.
- The `Prepared` object (which holds the token for `meta-rupload`) must stay in memory only: confirm nothing persists or logs `ResumeInfo`/`Prepared`.

- [ ] **Step 1: Failing tests**
  - `upload.test.ts` (inject a fake `post`): success path (`post` called with the URL, file URI, the exact headers, progress forwarded, final `onProgress(1)`); non-rupload URL rejected without calling `post`; HTTP 400 with `{"error":{"message":"Invalid file size"}}` → that message; HTTP 200 with `{"success":false,"message":"Partial request"}` → that message; `post` throws → "The connection dropped. Post again to restart the upload."; abort before and during → "Upload cancelled.".
  - `runPost.test.ts`: a `meta-rupload` plan calls `uploadMetaWhole` with the file URI and headers, opens no reader, finalizes with `clientResult: null`; `wait: { maxSeconds: 600, resumeOnTimeout: true }` polls up to 200 times then ends `failed` + `resumable` with the Instagram message and returns the ResumeInfo with `uploaded: true`; resuming from it calls `finalize` again without uploading; `wait: { maxSeconds: 300, resumeOnTimeout: false }` polls up to 100 times then ends done-without-link; no `wait` keeps the 40-poll default; cancel during polling with `resumeOnTimeout` → resumable failure; a `meta-rupload` plan with no `uploadUrl` → "The server sent an unexpected upload plan.".
  - `api.test.ts`: `prepare` passes `wait` through.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify** — `npx.cmd jest src/publish`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish jest.setup.ts
git commit -m "feat(publish): whole-file upload to Meta and server-directed polling"
```

---

### Task 4: Instagram and Facebook on the Post screen, docs

**Files:**
- Create: `src/publish/adapters/{instagram,facebook}.ts`
- Modify: `src/publish/adapters/index.ts`, Post-screen code only where a behaviour below needs it, tests `src/publish/__tests__/{adapters,PostScreen}.test.tsx`, `README.md`, `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md`

**Behaviour**
- `adapters/instagram.ts`: `captionMax: 2200`; `hasOptions: false`; `defaultOptions: () => ({})`; `validate`: duration < 3 s → "Instagram Reels must be at least 3 seconds."; > 900 s → "Instagram Reels can be up to 15 minutes."; size > 300 MB → "Instagram accepts videos up to 300 MB."; caption > 2200 → "Instagram captions can be up to 2200 characters."; else null. `note`: "Posts as a Reel. Instagram can take a few minutes to process — keep this screen open."
- `adapters/facebook.ts`: `captionMax: 5000`; `hasOptions: false`; `validate`: duration < 3 s → "Facebook Reels must be at least 3 seconds."; > 90 s → "Facebook Reels can be up to 90 seconds."; size > 1 GB → "Facebook accepts videos up to 1 GB."; else null. `note`: "Posts as a Reel on your Page. Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you."
- With all five rows possible on screen, accessible names stay unique (`Retry Instagram`, `Resume Instagram`, `View on Facebook`, …).
- A resumable Instagram timeout row reads the message from the row and offers `Resume Instagram`.

- [ ] **Step 1: Failing tests** — `adapters.test.ts`: both adapters' defaults and every validation sentence at the boundaries (2.9 s, 3 s, 90 s, 90.1 s, 900 s, 900.1 s, 300 MB, 300 MB + 1); `clientAdapters` has youtube, tiktok, instagram, facebook. `PostScreen.test.tsx`: Instagram + Facebook available and connected — both ticked by default with their notes and no options buttons; a 2-minute video unticks/blocks Facebook with its reason while Instagram and YouTube still post; the caption limit with YouTube + Instagram ticked is 2200; a failed-resumable Instagram row shows its message and `Resume Instagram`; pressing Post sends one job per ticked valid platform.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Docs** — `README.md` posting section: Instagram and Facebook work as Reels; what they need (professional Instagram account linked to a Facebook Page); the processing wait and Resume; the 90-second Facebook limit; that only X remains. Spec: Status line → `4A–4C implemented 2026-10-02 — unverified against live services; 4D (X) pending`; in §10 replace the "Instagram and Facebook" relay bullets with: "Both upload with **one streamed request from the phone** to `rupload.facebook.com` (the only documented form). That request needs the Page access token, so `post-prepare` returns it in `uploadHeaders`; the phone holds it in memory for that upload only and sends it nowhere else. (This replaces the earlier 'relay through the server' design, which depended on undocumented chunk behaviour and exceeds free-tier function limits.) One Meta login per platform row; the first eligible Page is used. Instagram publishes only after Meta finishes processing, so the app polls for up to 10 minutes and offers Resume." Also amend §3's constraint sentence "Platform tokens never reach the phone" with "(exceptions: §10 — the YouTube fallback switch and Meta uploads)".
- [ ] **Step 5: Full verification** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 6: Commit**

```powershell
git add src/publish README.md docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md
git commit -m "feat(post): Instagram and Facebook Reels on the Post screen"
```

**Device checklist (after the Meta app exists):** Accounts → Connect Facebook (choose one Page) → row shows the Page name → Connect Instagram → row shows @username → Post a 30-second vertical video with both ticked → Uploading % → Publishing… → Facebook: Done + View; Instagram: Done + View after processing (or "still processing" → Resume) → both posts visible.
