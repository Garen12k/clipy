# Clipy Phase 4 — Direct Posting — Design

**Date:** 2026-10-02
**Status:** 4A + 4B (TikTok inbox) implemented 2026-10-02 — unverified against live services; 4C–4D pending. Approved 2026-10-02; amended the same day after verifying platform docs (see §10, which overrides earlier sections where they differ)
**Parent specs:** `2026-10-01-clip-editor-app-design.md` and the Phase 1–3 specs (all still apply unless overridden here)

## 1. Goal

Post a finished video from Clipy straight to YouTube Shorts, TikTok, Instagram Reels, Facebook (Pages) and X, several at once, with the iOS share sheet kept as the universal fallback. A small Supabase backend holds the platform secrets and the user's platform tokens; the app never sees either.

**Done when** (iPhone, Expo Go, with at least one platform's developer app registered and the Supabase project deployed): Sign in with Apple → Accounts → Connect that platform (row shows the account name) → pick a video (an export, or a video from Photos) → Post screen: tick the platform, type a caption, Post → the row goes Preparing → Uploading % → Publishing → Done → the link opens the live post → the project card shows "Posted to …". With nothing registered or no backend configured, every platform row reads "Not available yet", the share sheet still works and nothing crashes. Jest and Deno tests green.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Platforms | All five, built now; each lights up when its developer app is registered. X included although its API is paid. |
| Where tokens live | On the Supabase server, tied to a Clipy account. |
| Clipy sign-in | Sign in with Apple only. |
| Post screen | Multi-select platforms, one shared caption, one Post button, one progress row per platform; per-row title/privacy. |
| Architecture | "Server signs, phone uploads" (approach 1). |

## 3. Constraints

- **Secrets never ship in the app.** Platform client ids/secrets and the token-encryption key live only in Supabase function secrets. The app holds only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and its own Supabase session (in `expo-secure-store`).
- **Platform tokens never reach the phone.** They are stored AES-GCM-encrypted in Postgres and decrypted only inside Edge Functions.
- **The server never stores video.** Two upload modes, declared per adapter:
  - `direct` — the server opens an upload session and returns a URL that is itself the credential; the phone uploads straight to the platform (YouTube, TikTok).
  - `relay` — the platform requires the user's token on every upload request (Instagram, Facebook, X), so the phone sends ≤ 4 MB chunks to the `post-upload` function, which forwards each chunk with the token and discards it. Video bytes pass through the server in transit only; nothing is written to storage or the database.
- **Graceful absence.** No Supabase config, not signed in, platform not registered, or platform not connected are all normal states with their own UI; none may throw. The share sheet never depends on the backend.
- **Expo Go safe.** Only modules bundled in Expo Go: `expo-apple-authentication`, `expo-web-browser`, `expo-secure-store`, `expo-linking`, `expo-file-system`, `expo-image-picker`, `@supabase/supabase-js`. No new native code.
- **OAuth returns through the server.** The platform redirects to the HTTPS `oauth-callback` function, which redirects to the app's return URL (`exp://…/--/oauth` in Expo Go, `clipy://oauth` in a native build). Return URLs are checked against an allowlist of schemes; no open redirect.
- One platform failing never blocks another; platform error text is shown verbatim.
- Platform API details in §6 are from the design discussion; **the plan must re-verify every endpoint, scope and limit against the platforms' current documentation** and correct this spec where they differ. Likewise Expo/Supabase APIs are verified against versioned docs per `AGENTS.md`.
- Theme, TDD, `git add` specific paths and the commit trailer are unchanged. No One Piece content.

## 4. Screens & Interactions

### 4.1 Sign-in sheet
Shown the first time the user opens Accounts or Post while signed out. One "Sign in with Apple" button and a one-line explanation ("Clipy keeps your connected accounts safe on its server"). Cancel returns to the previous screen. If the backend is not configured: a card "Posting isn't set up yet" with only the share-sheet button.

### 4.2 Accounts (`app/accounts.tsx`, opened from the home screen header and from the Post screen)
One row per platform in the fixed order YouTube, TikTok, Instagram, Facebook, X:
- **Not available yet** — the server reports the platform has no credentials. Greyed, no button.
- **Connect** — opens the platform login in an in-app browser sheet (`WebBrowser.openAuthSessionAsync`). On return the row refreshes.
- **Connected** — avatar, account name, **Disconnect** (confirm dialog). Instagram and Facebook connect through one Meta login that lets the user pick a Page; the Instagram row needs a professional account linked to that Page, otherwise it shows "No Instagram business account on this Page".
- **Reconnect** — token expired or revoked.
Footer: "Signed in with Apple as …" and **Sign out** (does not disconnect platforms).

### 4.3 Post (`app/editor/[id]/post.tsx` and `app/post.tsx` for a library video)
Entry points: **Post to…** on the export result screen (with the exported file); **Post a video** on the home screen (pick a video from Photos — this is also how posting is exercised in Expo Go, where the export engine is unavailable).
- Video thumbnail, duration and size.
- Caption field (shared). Character counter turns red past the smallest limit among ticked platforms.
- One row per platform: checkbox, account name, status. Unavailable/unconnected rows show the reason and a **Connect** shortcut. A ticked platform that fails the limits check (§6) is unticked with the reason shown.
- Tapping a row before posting opens its options: YouTube title (default = project name, ≤ 100 chars) and privacy (public / unlisted / private); TikTok privacy (options returned by TikTok for that creator; unaudited apps are limited to private — shown as a note) and the comment/duet/stitch toggles TikTok requires; Facebook title; Instagram and X have no extra options.
- **Post** starts all ticked rows in parallel. Row states: `idle → preparing → uploading (0–100 %) → publishing → done(link) | failed(message, Retry) | needsReconnect`.
- Leaving the screen while a row is uploading asks for confirmation; uploads stop if the user leaves.
- **Share…** button opens the share sheet with the same file at any time.

### 4.4 Project card
Projects with post records show "Posted to YouTube, TikTok" under the name; tapping it lists the links.

## 5. Architecture

```
app (Expo)                                Supabase                           Platforms
───────────                               ────────                           ─────────
src/publish/
  supabase.ts      session, client  ───►  Auth (Apple id-token sign-in)
  api.ts           typed calls      ───►  Edge Functions:
  adapters/*.ts    limits, options          oauth-start  ─────────────────►  authorize URL
  upload.ts        chunked uploader         oauth-callback ◄───────────────  code → tokens
  usePost.ts       per-row state            accounts (list / disconnect)
  useAccounts.ts                            post-prepare ─────────────────►  open upload session
                   direct upload ─────────────────────────────────────────►  YouTube, TikTok
                   relay chunks     ───►    post-upload  ─────────────────►  Instagram, Facebook, X
                                            post-finalize / post-status ──►  publish, poll
                                          Postgres: connected_accounts, oauth_states, post_sessions
```

### 5.1 App modules (`src/publish/`)
- `platforms.ts` — `PlatformId = "youtube" | "tiktok" | "instagram" | "facebook" | "x"`, order, labels, icons.
- `adapters/<platform>.ts` — pure data + functions: `limits { maxDurationSec, maxFileSizeMB, captionMax, aspectRatios }`, `uploadMode`, `defaultOptions`, `validate(video, options) → string | null`.
- `supabase.ts` — creates the client only when both env vars exist; `isBackendConfigured()`; secure-store session persistence; `signInWithApple()` (Apple identity token → `auth.signInWithIdToken`); `signOut()`.
- `api.ts` — typed wrappers for the functions in §5.2; maps HTTP errors to `{ code, message }`.
- `upload.ts` — `uploadDirect(fileUri, session, onProgress, signal)` and `uploadRelay(...)`; reads the file in chunks via `expo-file-system`; retries a failed chunk 3× with backoff; resumes from the last confirmed offset.
- `usePost.ts` — state machine per platform row; runs rows in parallel; exposes `start`, `retry(platform)`, `cancel`.
- `useAccounts.ts` — list, connect (opens the auth session and refreshes), disconnect.
- `postRecords.ts` — append a record to the project (op + undo-exempt, like autosave metadata).

### 5.2 Backend (`supabase/`)
Edge Functions (Deno, TypeScript). All except `oauth-callback` require the user's Supabase JWT.

| Function | Input → Output |
|---|---|
| `oauth-start` | `{ platform, returnUrl }` → `{ authUrl }`. Validates `returnUrl`, stores `state` + PKCE verifier in `oauth_states` (10-minute expiry). |
| `oauth-callback` | Platform redirect (`code`, `state`). Exchanges the code, fetches the account profile, encrypts and upserts tokens, deletes the state, redirects to `returnUrl?status=ok|error&platform=…`. |
| `accounts` | `GET` → `{ platforms: [{ id, available, connected, name?, avatarUrl?, needsReconnect }] }`. `DELETE ?platform=` → revokes where supported, deletes the row. |
| `post-prepare` | `{ platform, fileSize, durationSec, mimeType, caption, options }` → `{ sessionId, protocol, uploadUrl?, chunkSize, tiktokCreatorInfo? }`. Refreshes the token if needed; creates a `post_sessions` row. |
| `post-upload` | relay mode only: `sessionId`, `offset`, `total` headers + chunk body → `{ nextOffset }`. Rejects bodies over 4 MB and sessions not owned by the caller. |
| `post-finalize` | `{ sessionId }` → `{ status: "done", url } | { status: "processing" }`. |
| `post-status` | `{ sessionId }` → same shape; the app polls every 3 s for up to 2 minutes while `processing`. |

Shared code in `supabase/functions/_shared/`: `crypto.ts` (AES-GCM with `TOKEN_ENC_KEY`), `auth.ts`, `db.ts`, `platforms/<platform>.ts` (one server adapter each: `authUrl`, `exchange`, `refresh`, `revoke`, `profile`, `prepare`, `relayChunk?`, `finalize`, `status`), `http.ts` (fetch wrapper that surfaces the platform's error text).

A platform is `available` when its client id and secret are present in the function secrets.

### 5.3 Database (migration in `supabase/migrations/`)
- `connected_accounts(user_id, platform, account_id, display_name, avatar_url, access_token_enc, refresh_token_enc, expires_at, scopes, meta jsonb, created_at, updated_at, primary key (user_id, platform))`.
- `oauth_states(state primary key, user_id, platform, code_verifier, return_url, expires_at)`.
- `post_sessions(id, user_id, platform, platform_ref jsonb, status, url, error, created_at)`.
Row-level security is on for all three with **no** policies for the `anon`/`authenticated` roles; only the functions (service role) read or write them. The app learns account state only through `accounts`.

### 5.4 Project data (schema v4)
`Project.posts: PostRecord[]` where `PostRecord = { platform: PlatformId; url: string; postedAt: string }`. Migration v3 → v4 adds `posts: []`. Post records are not part of undo history.

## 6. Platform notes (to be re-verified in the plan)

| Platform | Auth | Upload | Publish | App-side limits |
|---|---|---|---|---|
| YouTube | Google OAuth 2 + PKCE, scope `youtube.upload` (+ `youtube.readonly` for the channel name), offline access | `direct`: resumable upload session URL | The upload completes the video; Shorts are inferred from vertical ≤ 3 min | ≤ 3 min for Shorts, title ≤ 100 |
| TikTok | Login Kit OAuth 2 + PKCE, scopes `user.info.basic`, `video.publish` | `direct`: Content Posting API init (`FILE_UPLOAD`) → chunked PUT | Poll publish status; unaudited apps post as private | ≤ 10 min, caption ≤ 2200 |
| Instagram | Meta login; Page + linked professional account; `instagram_content_publish` etc. | `relay`: resumable upload to the Reels container | `media_publish`, poll container status | 3 s–15 min, ≤ 1 GB, caption ≤ 2200 |
| Facebook | Same Meta login; Page access token; `pages_manage_posts` etc. | `relay`: Page Reels/video upload | finish phase; poll | ≤ 1 GB, per Page video limits |
| X | OAuth 2 + PKCE, `tweet.write`, `media.write`, `offline.access` | `relay`: chunked media upload (INIT/APPEND/FINALIZE) | create the post with the media id | ≤ 2 min 20 s, ≤ 512 MB, text ≤ 280 |

## 7. Error Handling

- Backend not configured / signed out / not available / not connected: dedicated UI states (§4), never exceptions.
- Token refresh fails or the platform returns an auth error → row `needsReconnect`; Accounts row shows Reconnect.
- Network loss during upload → the row pauses with **Resume**; direct uploads resume from the platform-reported offset, relay uploads from the last acknowledged offset; Instagram/Facebook restart if the platform refuses the offset.
- Processing longer than 2 minutes → row shows "Still processing on <platform> — check the app later" and counts as done-without-link.
- `oauth-callback` errors redirect back with `status=error` and the platform's message; the Accounts screen shows it as a toast.
- Function errors return `{ code, message }` with a 4xx/5xx; unknown errors show "Something went wrong" plus the code.
- User cancels the Apple sheet or the browser sheet → silent return, no error.

## 8. Testing

- **Jest:** adapter limits/validation for all five; `usePost` state machine with a fake `api`/`upload` (parallel rows, one failing, retry, reconnect, cancel); chunked uploader (chunk boundaries, retry, resume) with a fake file reader and fetch; Accounts and Post screens in every state incl. backend-not-configured; migration v3 → v4; project card label.
- **Deno (`supabase/functions/**/_test.ts`):** crypto round-trip; `oauth-start` return-URL allowlist and state creation; `oauth-callback` happy/error paths; each server adapter's request building and response parsing against a fake platform; `post-upload` ownership and size checks; token refresh.
- **Manual (device):** the "Done when" walkthrough per registered platform.
- `supabase/README.md` documents: creating the Supabase project, enabling the Apple provider (authorized client id `host.exp.Exponent` for Expo Go, the real bundle id later), setting secrets, deploying, and the per-platform developer-app registration steps with the exact redirect URL.

## 9. Out of Scope

Scheduled or background posting; drafts; analytics; comments; more than one account per platform; platforms beyond the five; hosting video on the server; App Store submission and each platform's public app review/audit (the "going public" step after the Apple Developer account); Android and web.

## 10. Amendments after verifying current platform docs (2026-10-02)

Research notes with source URLs were gathered per platform before planning. Where this section differs from §1–§9, this section wins. The user chose to **build all five platforms now from the documentation and test later**, so every adapter is unverified against the live platform until the developer accounts exist.

**Delivery:** four plans built back to back — 4A foundation + YouTube, 4B TikTok, 4C Instagram + Facebook, 4D X.

**App**
- Supabase session storage follows Expo's current guide: `expo-sqlite/localStorage/install` (not `expo-secure-store`, whose ~2 KB value limit is too small for a session). No URL polyfill.
- Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (the project's publishable/anon key).
- One Post route, `app/post.tsx` (params `fileUri`, optional `projectId`, `title`), reached from the export result and from **Post a video** on the home header; the home header also gets the **Accounts** icon.
- Chunked reads use `expo-file-system`'s `File.open()` handle (`offset`, `readBytes`); `File.slice()` and Blob bodies load the whole file and are not used. `fetch` has no upload progress, so progress advances per confirmed chunk (8 MB for YouTube).
- Post records exist only for project posts; a library video posts without a record.
- Post sessions on the server follow `uploading → publishing → processing → done | failed` with compare-and-set transitions; a finished upload is never re-uploaded on retry.

**Backend**
- All logic lives in plain TypeScript modules under `supabase/functions/_shared/` using only web-standard APIs (`fetch`, `Request`, `Response`, WebCrypto), tested with **Jest in a Node environment** (no Deno or Docker on the dev PC). Each function's `index.ts` is a thin Deno wrapper, verified by reading until deployed.
- One `oauth-callback` URL for every platform (the platform is recovered from `state`).
- `post-prepare` returns `{ sessionId, protocol, uploadUrl, uploadHeaders, chunkSize }` (`protocol` is `google-resumable` or `relay`). `uploadHeaders` is normally empty.
- Free-plan limits (150 s wall clock, 2 s CPU, 256 MB, undocumented ~10 MB request body) cap relay chunks at 4 MB and forbid buffering whole videos.
- Free projects pause after about a week without activity; the app shows "Server is asleep — open the Supabase dashboard to wake it" when the backend is unreachable.

**YouTube**
- Uploads from an un-audited API project are **locked to private** by Google until the project passes YouTube's API audit. The row shows this note and the finished post links to the video so the user can switch it to Public in YouTube. The chosen privacy is still sent.
- The OAuth consent screen must be **published** (unverified is fine) or the connection expires every 7 days; the Accounts row shows Reconnect when it does.
- Whether the resumable session URL accepts the phone's upload without a token is not documented. Default: no token on the phone. Fallback switch (function secret `YOUTUBE_UPLOAD_TOKEN_ON_PHONE=true`): `uploadHeaders` carries a short-lived (≈1 h) access token, held in memory only.
- Shorts: square or vertical, up to 3 minutes; no `#Shorts` needed. Scopes `youtube.upload` + `youtube.readonly`. Quota: 100 uploads/day.

**TikTok**
- Un-audited apps can only post privately and only to accounts that are themselves private, so 4B uses **Upload to inbox** (`video.upload`): the video lands in the user's TikTok inbox and they finish the post in TikTok. The row ends as "Sent to TikTok — open TikTok to finish" with no link. Direct Post (privacy picker, interaction toggles, consent text) is built behind a flag for after the audit.
- The upload URL needs no token (direct mode); refresh tokens rotate and must be re-saved on every refresh.
- Direct Post is deferred until the app is audited (it is restricted to private accounts and private posts before that); 4B ships the inbox route only. A dropped TikTok upload restarts from a fresh address — TikTok has no resume query.

**Instagram and Facebook**
- Instagram uses **Instagram API with Facebook Login** (the only route with a documented no-hosting resumable upload); one Meta login yields the Page token for Facebook too. Requires an Instagram professional account linked to a Facebook Page.
- Every upload request needs the token, so both use `relay`. Only "whole remaining body from an offset" is documented, so the relay sends 4 MB pieces with `offset` and must be confirmed against the live API; the documented fallback is a storage-hosted `video_url`/`file_url` for Instagram.
- Facebook Reels: 3–90 s, 30 per day per Page. Instagram Reels: up to 15 min, 300 MB (not 1 GB). Posts from a Development-mode app may be visible only to the app's own roles until the app is Live.

**X**
- No free tier and no flat monthly plan are required: pricing is pay-per-use (about $0.015 per post; to be re-confirmed in 4D). Video limits are 20 min / 8 GB for ordinary accounts.
- Uploads use the v2 chunked media endpoints with the user's token (`relay`, multipart, ≤ 4 MB pieces through the function). The authorization code expires in 30 s, so `oauth-callback` exchanges it immediately.
