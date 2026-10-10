# TikTok direct posting: design

Date: 2026-10-10. Branch: `tiktok-direct` (from `main` at `14e116c`). Plan: `docs/superpowers/plans/2026-10-10-tiktok-direct-post.md`.

Builds on `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md` (tokens only on the server; a post is created once and never retried by itself; a finished upload is never uploaded again; an unknown outcome says "check before posting again") and on `docs/superpowers/research/p4-research-tiktok.md`. The TikTok facts in §4 were fetched again from TikTok's live documentation on 2026-10-10; what could not be confirmed is in §11.

## 1. Goal

TikTok gets an options sheet on the Post screen. Its first control, **How to send**, chooses between

- **Send as draft** (the default): today's inbox route. Its requests, answers, sentences and behaviour do not change by one byte.
- **Post now** (new): TikTok's Direct Post API. The caption typed on the Post screen is the post's title, and the user chooses who can see it and what others may do with it.

Nothing is sent to TikTok before the user presses Post. An account connected with the old permissions keeps working for drafts; choosing Post now without the new permission says plainly to reconnect and offers it.

## 2. What the owner approved (binding)

The sheet, in this order, when **Post now** is chosen:

1. "Posting to <creator nickname>" with the avatar.
2. "Who can see it": a choice with NOTHING pre-selected, offering only the `privacy_level_options` TikTok returns for this creator.
3. Three switches, all OFF by default: "Allow comments", "Allow duet", "Allow stitch". Each is greyed out when the creator has it disabled.
4. A switch "Promotes a brand or product", off by default. When on: two tick boxes "Your brand" and "Branded content", at least one required; "Only me" is not allowed with branded content.
5. The consent line "By posting, you agree to TikTok's Music Usage Confirmation." (with branded content: "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.") and "It may take a few minutes to appear."

Post is disabled until "Who can see it" is chosen and the brand rule is met. Drafts still take no caption. The user reconnects TikTok once for the new permission.

## 3. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | How does the server know draft from direct? | `options.mode === "direct"` in `post-prepare`. ANY other value (absent, `"draft"`, a wrong type, a wrong case) is the draft path, which is the code that runs today, untouched. | One exact string switches; nothing else can reach the new code. The draft request the phone sends stays `options: {}`. |
| D2 | Where is creator info fetched? | A NEW Edge Function `creator-info` (`POST`, body `{ platform }`), handler `creatorInfo` in `_shared/handlers/creatorInfo.ts`, calling the adapter's new optional `creatorInfo()`. | `accounts` is a list read on every screen focus and must stay one database read; `post-prepare` creates a session. A read that calls TikTok is its own function. Any platform without the method answers `400 bad_request`. |
| D3 | When is it fetched? | Each time the TikTok sheet shows Post now: when the sheet opens in that mode and when the user switches to it. One request at a time; a newer one wins. Never on opening the Post screen, never for a draft. | TikTok's guidelines ask for the latest creator info when the post page is rendered. The rate limit is 20 a minute per token; a sheet opening is one. |
| D4 | Its 2-hour freshness | Nothing is cached anywhere. The phone keeps the last answer only in the sheet's own state and in the TikTok row's options (to validate and to say the nickname); the avatar is drawn only in the sheet, which has just fetched it. The server stores none of it. | The avatar URL dies after 2 hours and the privacy options can change at any time; the server asks again at Post anyway (D5). |
| D5 | Is the phone trusted? | Never. `post-prepare` in direct mode calls `creator_info/query` AGAIN and checks every option against that answer before it calls init: the privacy must be in the returned options; an interaction the creator has disabled cannot be allowed; branded content with `SELF_ONLY` is refused; the duration must be ≤ `max_video_post_duration_sec`; the caption ≤ 2200. A refusal is `400 options_refused` with a plain sentence and NO init call. | The owner's rule and TikTok's (`privacy_level_option_mismatch`). A stale sheet must never post something the user was not shown. |
| D6 | A disabled interaction that the phone asks to allow | Refused (D5), not silently switched off. | TikTok would enforce it anyway, but the user should learn the sheet was stale. |
| D7 | Missing permission | TikTok's own answer is the truth: `scope_not_authorized` / `scope_permission_missed` on a DIRECT call becomes `403 needs_permission` ("Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options."), thrown as a plain `ApiError`. It does NOT set `needsReconnect` on the account, because the account is healthy for drafts. On the draft path the same codes do what they do today (`reconnect`, the account is flagged). | `withPlatformAuth` flags an account on a 401 or an auth code; a flagged account cannot be ticked, which would break drafts for an old connection. |
| D8 | How scopes are stored and compared | Stored as today: `connected_accounts.scopes` is the token answer's `scope` string, replaced on every refresh that returns one. Compared by `scopeList(scopes)` = split on commas and white space. `creator-info` uses it only as a SHORTCUT in one direction: when the stored list names `video.upload` (so the format is the one we expect) and does not name `video.publish`, it answers `needs_permission` without calling TikTok. In every other case (empty, unreadable, or naming it) TikTok is asked. `post-prepare` never uses the stored string. | The format of TikTok's `scope` is unverified (§11); a shortcut that could block a correct grant would kill the feature. This one can only fire when the string has proved its format. |
| D9 | The reconnect path | The existing connect flow, unchanged: the sheet's "Reconnect" closes the sheet, waits `AFTER_SHEET_MS` (the Home sheet's constant), calls `useAccounts().connect("tiktok")` and reopens the TikTok sheet when it returns. `oauth-start` asks for `user.info.basic,video.upload,video.publish` from now on; the callback overwrites the stored tokens and scopes. | No new OAuth code. Accounts shows no Reconnect for a healthy account, so the offer has to be where the need is. |
| D10 | Upload protocol | The same `tiktok-chunks` protocol: the same chunk plan, the same PUT to the pre-signed URL, no token on the phone. | TikTok's media transfer guide is one page for both routes (re-read 2026-10-10). |
| D11 | What may be an unknown outcome | For a direct post the upload itself publishes (201 on the last chunk = posting begins). So the server's plan carries `publishes: true`, and the two sentences that end a lost LAST chunk say "check your TikTok profile before posting again" instead of "Post again". Chunks before the last, a cancel, and every draft sentence are unchanged. A retry of the last chunk in place stays: the same range to the same address cannot post twice (TikTok answers 416). | Phase 4's rule: never invite a second post when the first may exist. |
| D12 | Status and "done" | `status/fetch` as today. `PUBLISH_COMPLETE` (or `SEND_TO_USER_INBOX`) = done. The direct plan carries `wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }`; out of time ends as today's "Still processing on TikTok — check the app later." | TikTok says a post can take a few minutes; 5 minutes at 12 polls a minute is inside the 30-a-minute limit. |
| D13 | A link when done | None. The row says "Posted to TikTok. It may take a few minutes to appear." | TikTok's status answer has no URL (verified). The post id appears only for a public post after moderation, is an int64 that `JSON.parse` would round, and the URL pattern is undocumented. Until the audit every post is `SELF_ONLY`, so the id never comes. Revisit after the audit. |
| D14 | The cover frame | Not sent (`video_cover_timestamp_ms` absent = first frame). | Not in the approved drawing; the form merges cover options after a platform's own, which would put a key on the draft request. A later batch. |
| D15 | `is_aigc` | Not sent. | Not in the approved drawing. |
| D16 | The caption | Sent trimmed as `post_info.title`; the key is left out when the caption is empty (TikTok: "omitting it posts without a caption"). Counted as JavaScript string length against 2200 on both sides; over the limit the phone blocks the row with the form's own "Captions can be up to 2200 characters." and the server refuses (never cuts). | The user's words are never changed silently. |
| D17 | The privacy control | Rows (a radio group), not chips: one row per offered option, the picked one with a trailing check. | Chips are title style by the casing rule and the owner's word is "Only me"; a row also has room to be disabled with its reason. |
| D18 | "Only me" with branded content | TikTok's first allowed form: while "Only me" is picked the "Branded content" box is disabled, and while "Branded content" is ticked the "Only me" row is disabled; the line "Branded content visibility cannot be set to private." (TikTok's wording) shows under whichever is disabled. Nothing is ever changed for the user. | TikTok's guidelines; no surprise switch of visibility. |
| D19 | Where the consent is read | In the sheet AND in the TikTok row's standing note on the Post screen, because the gold Post button is on the screen, not in the sheet. | TikTok wants the consent line before the publish button. |
| D20 | What Post does while TikTok is not ready | The existing rule for every platform: the row shows its red reason, is not ticked, and a tap on it opens its options; Post sends the other ticked platforms, and is disabled when none is ready. | No second rule. |
| D21 | What the UI says about the audit | Only what the app KNOWS: the mapped error `unaudited_client_can_only_post_to_private_accounts` (§6). No standing warning. The README says the limits. | The app cannot tell whether it has been audited. |
| D22 | Database | No migration. `post_sessions.input.options` already holds the options; `platform_ref` gains `direct: true`. | — |

## 4. TikTok's API (re-read 2026-10-10)

Base `https://open.tiktokapis.com`; every call `Authorization: Bearer <token>`, `Content-Type: application/json; charset=UTF-8`; answers `{ data, error: { code, message, log_id } }`, `code: "ok"` = success.

| Call | Scope | Limit | Request | Answer |
|---|---|---|---|---|
| `POST /v2/post/publish/creator_info/query/` | `video.publish` | 20 / min / token | no body | `creator_avatar_url` (dies after 2 h), `creator_username`, `creator_nickname`, `privacy_level_options` (public account: `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY`; private: `FOLLOWER_OF_CREATOR`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY`), `comment_disabled`, `duet_disabled`, `stitch_disabled`, `max_video_post_duration_sec` |
| `POST /v2/post/publish/video/init/` | `video.publish` | 6 / min / token | `post_info`: `privacy_level` (required), `title` (optional, ≤ 2200 UTF-16 runes), `disable_duet`, `disable_comment`, `disable_stitch`, `brand_content_toggle` (marked required), `brand_organic_toggle`, `video_cover_timestamp_ms`, `is_aigc`. `source_info`: `source: "FILE_UPLOAD"`, `video_size`, `chunk_size`, `total_chunk_count` | `publish_id` (≤ 64), `upload_url` (≤ 256, valid 1 hour) |
| `PUT <upload_url>` | none (pre-signed) | — | `Content-Type`, `Content-Range: bytes F-L/T`, the chunk | 206 more, 201 all in and posting begins, 400, 403 expired, 404, 416 range, 5xx retry |
| `POST /v2/post/publish/status/fetch/` | `video.upload` or `video.publish` | 30 / min / token | `{ publish_id }` | `status`: `PROCESSING_UPLOAD`, `PROCESSING_DOWNLOAD`, `SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE`, `FAILED`; `fail_reason`; `publicaly_available_post_id` (list of int64, only public and moderated); no URL |

What Clipy sends to init in direct mode, and nothing else:

```json
{ "post_info": { "title": "<caption, trimmed; key absent when empty>", "privacy_level": "<chosen>",
                 "disable_duet": true, "disable_comment": true, "disable_stitch": true,
                 "brand_content_toggle": false, "brand_organic_toggle": false },
  "source_info": { "source": "FILE_UPLOAD", "video_size": 0, "chunk_size": 0, "total_chunk_count": 0 } }
```

`disable_x` is `!allowX`. `source_info` is `chunkPlan(fileSize)`, exactly as for the inbox.

Limits until TikTok's audit (from the guidelines): at most 5 users post in 24 hours; the posting account must be PRIVATE at the time; every post is `SELF_ONLY`. All clients: about 15 direct posts a day per creator.

## 5. Shapes

Phone → `post-prepare`, TikTok options:

- draft: `{}` (always; `sendOptions` strips everything)
- direct: `{ mode: "direct", privacy, allowComment, allowDuet, allowStitch, brandOrganic, brandContent }`; `brandOrganic` / `brandContent` are false unless the brand switch is on.

On the phone the TikTok row's options also hold `brand: boolean` and `creator: CreatorInfo | null`; neither is sent.

`creator-info` answer (`CreatorInfo`, the same type on both sides):

```ts
{ nickname: string; username: string | null; avatarUrl: string | null;   // avatarUrl only when it starts with https://
  privacyOptions: TikTokPrivacy[];   // TikTok's list, filtered to the four known values, in the fixed order below; empty = an error
  commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean;
  maxDurationSec: number }           // TikTok's number; 600 when it sends none
```

Order and labels of "Who can see it": `PUBLIC_TO_EVERYONE` "Everyone", `FOLLOWER_OF_CREATOR` "Followers", `MUTUAL_FOLLOW_FRIENDS` "Friends", `SELF_ONLY` "Only me".

`post-prepare` answer in direct mode: today's keys plus `wait` (D12) and `publishes: true` (D11). In draft mode: today's keys and no other.

## 6. Every new sentence (exact)

Sheet (title "TikTok options", as every platform's):

| Where | Text |
|---|---|
| Label over the first control | How to send |
| The two segments | Send as draft · Post now |
| Under it, draft | Clipy sends the video to your TikTok inbox. You add the caption and post it in TikTok. |
| While creator info loads | spinner, accessibility label "Checking your TikTok account" |
| Identity | Posting to <nickname> |
| Label | Who can see it |
| Rows | Everyone · Followers · Friends · Only me |
| Switches | Allow comments · Allow duet · Allow stitch |
| Under a switch the creator disabled | Turned off in your TikTok settings. |
| Switch | Promotes a brand or product |
| Tick boxes | Your brand · Branded content |
| Brand on, nothing ticked | You need to indicate if your content promotes yourself, a third party, or both. |
| Only "Your brand" ticked | Your video will be labeled as 'Promotional content'. |
| "Branded content" ticked (alone or with the other) | Your video will be labeled as 'Paid partnership'. |
| "Only me" picked or "Branded content" ticked (D18) | Branded content visibility cannot be set to private. |
| Consent | By posting, you agree to TikTok's Music Usage Confirmation. |
| Consent, branded content ticked | By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation. |
| Links under the consent (quiet buttons, title style) | Music Usage Confirmation · Branded Content Policy (the second only with branded content) |
| Last line | It may take a few minutes to appear. |
| No permission | To post directly, TikTok needs one more permission. Reconnect TikTok and allow everything it asks for. — button "Reconnect" |
| Creator info failed | the server's sentence — button "Try Again" |

Post screen, TikTok row:

| Case | Text |
|---|---|
| Standing note, draft | unchanged |
| Standing note, direct, ready | Posting to <nickname>. Who can see it: <label>. <consent line> It may take a few minutes to appear. |
| Standing note, direct, not ready | Post now publishes to your TikTok profile. |
| Red reason: creator info not loaded yet | Open the TikTok options to finish setting up Post now. |
| Red reason: no privacy chosen, or the chosen one is no longer offered | Choose who can see it in the TikTok options. |
| Red reason: brand on, nothing ticked | You need to indicate if your content promotes yourself, a third party, or both. |
| Red reason: branded content with Only me | Branded content visibility cannot be set to private. |
| Red reason: too long for this creator | This TikTok account can post videos up to <N minutes / N seconds>. |
| Done, direct | Posted to TikTok. It may take a few minutes to appear. |
| Done, draft | unchanged |
| Caption line "TikTok doesn't receive this caption…" | draft only; in direct the caption counts against 2200 |
| Last chunk answered 416, direct | TikTok may already have this video — check your TikTok profile before posting again. |
| Last chunk lost after the retries, direct | The connection dropped at the end of the upload. Check your TikTok profile before posting again. |

Server (direct calls only; the draft path keeps today's words for every code):

| TikTok says | HTTP | Clipy's code | Clipy says |
|---|---|---|---|
| `scope_not_authorized`, `scope_permission_missed` | 401 / 400 | `needs_permission` (403), account NOT flagged | Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options. |
| `access_token_invalid` | 401 | `reconnect`, account flagged (today's rule) | Reconnect tiktok in Accounts. |
| `unaudited_client_can_only_post_to_private_accounts` | 403 | `platform_error` | TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options. |
| `spam_risk_too_many_posts` | 403 (200 on creator info) | `platform_error` | TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok. |
| `spam_risk_user_banned_from_posting` | 403 (200) | `platform_error` | TikTok has stopped this account from posting for now. Open TikTok to see why. |
| `reached_active_user_cap` | 403 (200) | `platform_error` | Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options. |
| `privacy_level_option_mismatch` | 403 | `platform_error` | TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again. |
| `rate_limit_exceeded` | 429 | `platform_unavailable` | TikTok is busy — wait a minute, then try again. (today's) |
| `internal_error`, any 5xx | 5xx | `platform_unavailable` | TikTok is having trouble — try again. (today's) |
| `invalid_param`, anything else | 400 | `platform_error` | TikTok's own message |
| creator info without a usable privacy list | — | `platform_unavailable` (502) | TikTok did not say who can see the post. |

Server refusals before init (`400 options_refused`, nothing sent to init):

| Check against the fresh creator info | Sentence |
|---|---|
| options not of the shape in §5 | The TikTok options are incomplete. (`bad_request`) |
| caption longer than 2200 | TikTok captions can be up to 2200 characters. |
| privacy not offered | TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again. |
| branded content with `SELF_ONLY` | Branded content visibility cannot be set to private. |
| comments / duet / stitch allowed but disabled | Comments are turned off in your TikTok settings. Open the TikTok options and try again. (Duet / Stitch likewise) |
| longer than `max_video_post_duration_sec` | This TikTok account can post videos up to <N minutes / N seconds>. |

`FAILED` from `status/fetch` for a direct post (final, as today; a draft keeps today's words):

| `fail_reason` | Sentence |
|---|---|
| `spam_risk_text` | TikTok refused the caption. Change it and post again. |
| `spam_risk` | TikTok refused this post. |
| `spam_risk_too_many_posts` | as above |
| `spam_risk_user_banned_from_posting` | as above |
| `auth_removed` | TikTok access was removed while posting. Reconnect TikTok and post again. |
| `internal` | TikTok had a problem processing the video. (today's) |
| others | TikTok couldn't use this video: <reason>. (today's) |

## 7. Flow

```
sheet shows Post now ─► creator-info ─► needs_permission ─► "Reconnect" ─► the connect flow ─► sheet again
                                     └► ready: nickname, offered privacy rows, switches
user presses Post ─► post-prepare { options.mode: "direct", … }
   server: creator_info/query (fresh) ─► checks (§6) ─► video/init ─► session { ref: { publishId, direct: true } }
phone: the same chunked PUT ─► post-finalize ─► status polls (5 s, up to 5 min) ─► "Posted to TikTok. …"
```

Never retried by itself: `video/init` is called once per Post press. A prepare whose answer is lost leaves a `publish_id` with no upload, which posts nothing. After the upload `finalize` and `status` only read.

## 8. The draft path is pinned first

Before any line of code changes, two PROOF files are written, run green against the untouched code and committed alone. They are never edited afterwards.

- `supabase/functions/_shared/__tests__/tiktok.draft.proof.test.ts`: for the options `{}`, `{ mode: "draft" }`, `{ mode: "Direct" }`, `{ mode: 1 }` and `{ privacy: "SELF_ONLY", allowComment: true }` the adapter makes exactly ONE call, to `inbox/video/init`, with today's body and headers, and returns exactly today's five keys; the draft messages for every code in §6's server table are today's; `status` and `finalize` for `{ publishId }` answer and fail in today's words; through `postPrepare` the answer has exactly today's keys and `scope_not_authorized` is `reconnect` with the account flagged.
- `src/publish/__tests__/tiktokDraft.proof.test.ts`: with the options `{}` the client adapter validates, notes and finishes in today's words; `runPost` sends `post-prepare` today's body with `options: {}` and hands the uploader no `publishes`.

The existing TikTok tests stay green unedited, except the pinned lines the plan lists (the scope string, `hasOptions`, the Options button, the function count in the README).

## 9. Security and privacy

- Tokens never reach the phone; `creator-info` returns only the eight fields of §5.
- `creator-info` needs a signed-in Clipy session like every other function (`serveJson`); no `config.toml` entry.
- The creator's nickname and avatar are shown, never stored on the server and never written to the project.
- The site's privacy text needs no change: no new kind of data is kept, and TikTok was already named.

## 10. Deployment (for `supabase/README.md` section 11)

In this order; the first step must come before the second, or connecting TikTok fails for everyone.

1. TikTok developer portal, **Sandbox** selected: open **Content Posting API**, turn on **Direct Post**; under **Scopes** add `video.publish`; **Apply changes**.
2. PowerShell in the project folder: `npx.cmd supabase functions deploy` (now eight functions; `creator-info` is the new one).
3. In the TikTok app: set the account to **private** (Settings and privacy → Privacy → Private account).
4. In Clipy: Post a video → TikTok **Options** → **Post now** → **Reconnect** → allow everything TikTok asks for.
5. Choose **Only me**, press Post.

## 11. UNVERIFIED, and what settles each on the first live run

| # | Not verified | What the code assumes | How the first run settles it, and the fallback |
|---|---|---|---|
| U1 | That a sandbox / unaudited app may call Direct Post at all, and what happens to a privacy other than `SELF_ONLY` from an unaudited app (refused, or forced private) | Sends what the user chose; maps the documented refusal | Step 5 works or shows the "private accounts" sentence. If another privacy is refused with an unmapped code, add its sentence to `DIRECT_FRIENDLY`. |
| U2 | The format of `scope` in TikTok's token answer (comma-separated?) and that it names `video.publish` after a full grant | Split on commas and white space; the shortcut fires only when `video.upload` is named and `video.publish` is not (D8) | After reconnecting, Post now loads the creator. If it still says to reconnect, read `connected_accounts.scopes` in the Supabase table and delete the shortcut (one line in `tiktok.ts`). |
| U3 | That `creator_info/query` accepts a POST with no body | No body, as TikTok's example | A 400 `invalid_param` on opening Post now: send `{}`. |
| U4 | The HTTP status of `scope_not_authorized` for an old-scope token | Nothing: mapped by code, whatever the status | — |
| U5 | That the direct upload is the same PUT as the inbox one (same guide; neither has run live) and ends in 201 | The same uploader | Uploading reaches 100 % and the row goes to Publishing. |
| U6 | The status sequence and duration of a direct post; whether `SEND_TO_USER_INBOX` can appear | `PUBLISH_COMPLETE` or `SEND_TO_USER_INBOX` = done; 5 minutes of polling | The row ends "Posted to TikTok. …" and the video is on the profile. If it always runs out of time, raise `maxSeconds`. |
| U7 | What "2200 UTF-16 runes" counts | JavaScript string length | A 2200-character caption with emoji posts whole. |
| U8 | The addresses of TikTok's Music Usage Confirmation and Branded Content Policy pages | `https://www.tiktok.com/legal/page/global/music-usage-confirmation/en` and `https://www.tiktok.com/legal/page/global/bc-policy/en` (from memory; no fetched page names them) | Tap both links in the sheet; fix the two constants if either is wrong. |
| U9 | Whether TikTok shows its permission page again for an account that is already connected, and whether a single permission can be declined there | Either way works: a grant without `video.publish` reads "reconnect" again | Step 4. |
| U10 | That `brand_content_toggle` (marked required) and `brand_organic_toggle` are accepted as `false`, and that leaving `title` out is accepted | Both toggles always sent; `title` absent when the caption is empty | A post with an empty caption and the brand switch off goes through. |
| U11 | That a token granted with the old scopes keeps refreshing after the app starts asking for three | Yes | A draft still posts from a phone that has not reconnected. |
| U12 | That iOS presents the sign-in browser 350 ms after the sheet's modal closes | `AFTER_SHEET_MS`, as Home does after its sheet | Step 4 opens TikTok's page. If nothing opens, connect from Accounts (Disconnect, then Connect). |
| U13 | The whole draft path against live TikTok | Unchanged from Phase 4B (never run live) | README 11 f. |
| U14 | That `max_video_post_duration_sec` is always present | 600 when absent | — |
