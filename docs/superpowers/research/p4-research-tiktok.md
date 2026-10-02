# TikTok Login Kit + Content Posting API research (fetched 2026-10-02)

Method: each fact comes from a WebFetch of the cited developers.tiktok.com page. Page text is summarised by a small model, so exact wording and numbers deserve a re-check in the live docs before shipping. "NOT DOCUMENTED" means the fetched page did not say it, not that it is false. Items marked (3rd party) are from search snippets, not official pages.

## 1. Login Kit OAuth 2 (web flow)

Source: https://developers.tiktok.com/doc/login-kit-web

- Authorize URL: `https://www.tiktok.com/v2/auth/authorize/` (GET, browser).
- Params: `client_key`, `response_type=code` (always), `scope` (comma-separated, e.g. `user.info.basic,video.publish`), `redirect_uri`, `state`, optional `disable_auto_auth` (0 = skip the auth page if a session is valid, 1 = always show it).
- Success redirect carries `code`, `scopes`, `state`. Error redirect carries `error` and `error_description`.
- Redirect URI rules: max 10 URIs, each under 512 characters, absolute and starting with `https`, static (no query parameters), no `#` fragment. They are registered in the developer portal (https://developers.tiktok.com/doc/getting-started-create-an-app). The "exact match" rule is not stated as such. The error text "Redirect_uri is not matched" appears in the token docs (https://developers.tiktok.com/doc/oauth-user-access-token-management).
- PKCE for web: NOT DOCUMENTED on the web page. The token page says `code_verifier` is "Required for mobile and desktop app only" (https://developers.tiktok.com/doc/oauth-user-access-token-management).
- PKCE for desktop: required. `code_challenge` = SHA256 of the verifier, `code_challenge_method=S256` (only supported method). The verifier is 43-128 characters from `A-Z a-z 0-9 - . _ ~` (https://developers.tiktok.com/doc/login-kit-desktop).

Token endpoint, code exchange: `POST https://open.tiktokapis.com/v2/oauth/token/` (https://developers.tiktok.com/doc/oauth-user-access-token-management)
- Header: `Content-Type: application/x-www-form-urlencoded`.
- Body: `client_key`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`, `code_verifier` (mobile/desktop only).
- Response: `access_token`, `expires_in` (valid 24 hours), `refresh_token` (valid 365 days), `refresh_expires_in`, `open_id`, `scope`, `token_type` ("Bearer").

Refresh: same URL. Body: `client_key`, `client_secret`, `grant_type=refresh_token`, `refresh_token`. The response has the same shape. The returned refresh_token MAY DIFFER, so always store the newly returned one.

Revoke: `POST https://open.tiktokapis.com/v2/oauth/revoke/` with `client_key`, `client_secret`, `token` (the access token). Success returns an empty body.

Token-endpoint error shape (note: different from the API shape in section 7): `{"error":"invalid_request","error_description":"...","log_id":"..."}`. The docs list no other error codes.

## 2. Scopes

Source: https://developers.tiktok.com/doc/tiktok-api-scopes
- `user.info.basic`: "Read a user's profile info (open id, avatar, display name ...)". Added by default with Login Kit (https://developers.tiktok.com/doc/scopes-overview).
- `video.publish`: "Directly post content to a user's TikTok profile." Used by Direct Post, creator info query and Get Post Status.
- `video.upload`: "Share content to creator's account as a draft to further edit and post in TikTok." Used by Upload (inbox), Share Video and Get Post Status.
- Products to add: Login Kit, plus Content Posting API with the Direct Post configuration enabled (https://developers.tiktok.com/doc/content-posting-api-get-started). The app must be approved for `video.publish` and the user must authorize it. The upload guide also lists Share Kit and Green Screen Kit as alternatives (https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content).

User info: `GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name` with `Authorization: Bearer <access_token>` (https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info).
- `user.info.basic` covers `open_id`, `union_id`, `avatar_url`, `avatar_url_100`, `avatar_large_url`, `display_name`.
- `username` needs `user.info.profile`. Counts need `user.info.stats`.
- Response: `{"data":{"user":{...}},"error":{"code","message","log_id"}}`.
- Alternative: creator_info/query returns `creator_nickname`, `creator_username` and `creator_avatar_url` (2-hour TTL), and needs only `video.publish`.

## 3. Direct Post

Base: `https://open.tiktokapis.com`. All calls use `Authorization: Bearer <access_token>` and `Content-Type: application/json; charset=UTF-8`.

### 3a. Creator info
Source: https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
- `POST /v2/post/publish/creator_info/query/` with no body. Scope `video.publish`. Rate limit 20 requests/min per token.
- `data` fields:
  - `creator_avatar_url`
  - `creator_username`
  - `creator_nickname`
  - `privacy_level_options`: list. Public accounts get PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY. Private accounts get FOLLOWER_OF_CREATOR, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY.
  - `comment_disabled`
  - `duet_disabled`
  - `stitch_disabled`
  - `max_video_post_duration_sec`
- The guidelines say to retrieve the latest creator info when rendering the post page (https://developers.tiktok.com/doc/content-sharing-guidelines). The get-started page lists it as step 1 before init (https://developers.tiktok.com/doc/content-posting-api-get-started).
- Errors come back as HTTP 200 with a code: `spam_risk_too_many_posts`, `spam_risk_user_banned_from_posting`, `reached_active_user_cap`. HTTP 401: `access_token_invalid`, `scope_not_authorized`. HTTP 429: `rate_limit_exceeded`.
- The get-started example shows `max_video_post_duration_sec: 300`.

### 3b. Init
Source: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- `POST /v2/post/publish/video/init/`. Scope `video.publish`. Rate limit 6 requests/min per token.
- `post_info`:
  - `privacy_level` (required): PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY
  - `title` (max 2200 UTF-16 runes; hashtags and mentions are parsed from it)
  - `disable_duet`, `disable_stitch`, `disable_comment`
  - `video_cover_timestamp_ms` (defaults to the first frame if invalid)
  - `brand_content_toggle` (paid partnership)
  - `brand_organic_toggle` (own business)
  - `is_aigc`
- `source_info`: `source` ("FILE_UPLOAD" or "PULL_FROM_URL"), `video_size`, `chunk_size`, `total_chunk_count` (all for FILE_UPLOAD), `video_url` (PULL_FROM_URL, needs a verified domain).
- Example body:
```json
{"post_info":{"title":"...","privacy_level":"SELF_ONLY","disable_duet":false,"disable_comment":false,"disable_stitch":false,"video_cover_timestamp_ms":1000},
 "source_info":{"source":"FILE_UPLOAD","video_size":50000123,"chunk_size":50000123,"total_chunk_count":1}}
```
- Response: `{"data":{"publish_id":"<=64 chars","upload_url":"<=256 chars"},"error":{"code":"ok","message":"","log_id":""}}`.

### 3c. Chunks and upload
Source: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- Chunk size: minimum 5 MB, except that the final chunk may be larger. Maximum 64 MB per chunk, final chunk up to 128 MB. 1 to 1000 chunks. Chunks must be uploaded sequentially.
- `total_chunk_count` = floor(`video_size` / `chunk_size`). The last chunk therefore absorbs the remainder and can be larger than `chunk_size`. A file under 5 MB is uploaded as a single chunk (this is my inference; the page does not say it explicitly).
- Upload: `PUT <upload_url>` (use it exactly as returned, with its query string) with body = raw bytes of the chunk. Headers: `Content-Type` (video/mp4 | video/quicktime | video/webm), `Content-Length` (bytes in this chunk), `Content-Range: bytes FIRST-LAST/TOTAL`.
- Responses: 206 means the chunk was accepted and more are expected. 201 means all chunks are in and posting begins. 400 means malformed headers or a size mismatch. 416 means the range does not match progress. 403 means the URL has expired.
- The `upload_url` is valid for 1 hour (https://developers.tiktok.com/doc/content-posting-api-reference-direct-post).
- Whether an Authorization header is needed on the PUT: NOT DOCUMENTED. The upload header table lists only Content-Type, Content-Length and Content-Range, so the URL appears to be pre-signed.
- This means the phone can upload directly, and the server never needs to see the bytes.

### 3d. Status
Source: https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
- `POST /v2/post/publish/status/fetch/` with body `{"publish_id":"..."}`. Scope `video.upload` or `video.publish`. Rate limit 30 requests/min per token.
- `status`: PROCESSING_UPLOAD | PROCESSING_DOWNLOAD | SEND_TO_USER_INBOX | PUBLISH_COMPLETE | FAILED.
- Other `data` fields: `fail_reason`, `publicaly_available_post_id` (list<int64>, spelled this way in the docs, "only after moderation approval"), `uploaded_bytes`, `downloaded_bytes`.
- `fail_reason` values:
  - `file_format_check_failed`
  - `duration_check_failed`
  - `frame_rate_check_failed`
  - `picture_size_check_failed`
  - `video_pull_failed`
  - `photo_pull_failed`
  - `publish_cancelled`
  - `auth_removed`
  - `spam_risk_too_many_posts`
  - `spam_risk_user_banned_from_posting`
  - `spam_risk_text`
  - `spam_risk`
  - `internal`
- Status error codes: `invalid_publish_id`, `token_not_authorized_for_specified_publish_id`, `access_token_invalid`, `scope_not_authorized`, `rate_limit_exceeded`, `internal_error`.
- The public post id only appears after moderation, so keep polling. A public URL is NOT documented: you can only build one yourself, `https://www.tiktok.com/@<username>/video/<id>`, which is unverified.

## 4. Upload to inbox (drafts)
Sources: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video and https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content
- `POST /v2/post/publish/inbox/video/init/`. Scope `video.upload`. Body has `source_info` only (`source`, `video_size`, `chunk_size`, `total_chunk_count` / `video_url`) and no `post_info`. Response is `publish_id` and `upload_url` (valid 1 hour). Rate limit 6 requests/min.
- The user must tap the inbox notification in TikTok to edit and finish the post. The status after upload is SEND_TO_USER_INBOX.
- Cap: error `spam_risk_too_many_pending_share` means at most 5 pending shares per 24 hours.
- When it is required: when you only have `video.upload`, or when you do not want or cannot get the Direct Post audit. It is a good fallback while the app is unaudited.

## 5. Unaudited restrictions and audit
- "All content posted by unaudited clients will be restricted to private viewing mode." An audit is needed to lift this (https://developers.tiktok.com/doc/content-posting-api-get-started).
- Official guidelines: "Unaudited API Clients can allow up to 5 users to post in a 24 hour window. All user accounts using the API client to post must be set to private at the time of posting." SELF_ONLY only. Typical cap is about 15 posts per day per creator (https://developers.tiktok.com/doc/content-sharing-guidelines).
- Error when blocked: `unaudited_client_can_only_post_to_private_accounts` (403).
- Sandbox (https://developers.tiktok.com/doc/add-a-sandbox):
  - Max 5 sandboxes per app, up to 10 target users per sandbox.
  - A target user has to log in to TikTok and accept the terms; it can take up to an hour to show.
  - "Sandbox mode does not offer access to Content Posting API for public videos". Private posting in sandbox is allowed.
  - Sandbox settings can be imported into a Draft in Production mode.
- App review: takes "several days to two weeks". Incomplete or test apps are not encouraged (https://developers.tiktok.com/doc/getting-started-faq).
- Review submission: 1-5 demo videos, max 50 MB each, showing the end-to-end flow (https://developers.tiktok.com/doc/getting-started-create-an-app).
- URL properties (domain or URL prefix) must be verified before submission (same page).
- Content Sharing Guidelines UX rules (https://developers.tiktok.com/doc/content-sharing-guidelines):
  - Show the creator nickname so the user knows which account receives the post.
  - Privacy dropdown: the user must pick manually, NO default value, and it must use only `privacy_level_options`.
  - Comment, Duet and Stitch toggles: none ticked by default. Grey them out if the creator disabled them (`*_disabled`).
  - Title and hashtags are editable and not forced.
  - Commercial content toggle is off by default. When on, show "Your brand" (labelled "Promotional content") and "Branded Content" ("Paid partnership"). Disable Post until at least one is selected. SELF_ONLY is not allowed for branded content.
  - Consent text: "By posting, you agree to TikTok's Music Usage Confirmation." For branded content: "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation."
  - Show a content preview.
  - Send nothing to TikTok until the user has explicitly consented.
  - Tell the user it may take a few minutes to process.
  - No promotional watermark or logo on the content.
  - Poll status.

## 6. Media requirements
Source: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- Formats MP4, MOV and WebM. Codecs H.264, H.265, VP8, VP9 (upload guide: MP4 + H.264, https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content).
- Frame rate 23-60 fps. Resolution 360-4096 px per side. Duration up to 10 minutes via the API, but the per-creator `max_video_post_duration_sec` governs. Max size 4 GB.

## 7. Errors
Source: https://developers.tiktok.com/doc/tiktok-api-v2-error-handling
- Shape: `error: {code, message, log_id}`. `code == "ok"` means success.
- Common codes: `access_token_invalid` (401), `scope_not_authorized` (401), `invalid_params` (400), `scope_permission_missed` (400), `invalid_file_upload` (400), `rate_limit_exceeded` (429), `internal_error` (500).
- Direct post (https://developers.tiktok.com/doc/content-posting-api-reference-direct-post): `invalid_param` (400), `spam_risk_too_many_posts` (403), `spam_risk_user_banned_from_posting` (403), `reached_active_user_cap` (403), `unaudited_client_can_only_post_to_private_accounts` (403), `url_ownership_unverified` (403), `privacy_level_option_mismatch` (403).
- Note that `invalid_param` (direct-post page) and `invalid_params` (general page) are spelled differently.

## 8. Portal clicks (non-technical)
Sources: https://developers.tiktok.com/doc/getting-started-create-an-app and https://developers.tiktok.com/doc/add-a-sandbox. The exact UI labels may have changed.
1. Go to developers.tiktok.com and log in with the TikTok account. Register as a developer if prompted.
2. Profile icon, then "Manage apps", then "Connect an app". Choose the owner (personal or organization) and confirm.
3. Fill in the app icon (1024x1024 JPG/PNG, under 5 MB), app name, description and category. Choose the platform (a "Web" platform entry is probably needed for a server-side redirect; unverified). Fill in the URLs for terms of service and privacy policy if requested.
4. "Add products": add "Login Kit" and "Content Posting API". Open Content Posting API and turn on "Direct Post".
5. Under Login Kit, add the redirect URI (https, static), for example the Supabase Edge Function URL.
6. Under the Credentials section, copy the Client key and Client secret. The secret goes on the server only.
7. Toggle the top of the app page to Sandbox, click "Create Sandbox", give it a name, add the products and click "Apply changes". Under Sandbox settings, "Add account" for target users: log in with your own TikTok account and agree to the terms. Wait up to an hour.
8. For public posting: use "URL properties" to verify the domain, write the product explanations, upload 1-5 demo videos and click "Submit for review". It takes days to two weeks.

## Surprises and risks
- Unaudited means private-only AND the posting TikTok account itself must be set private. A personal public account gets blocked (`unaudited_client_can_only_post_to_private_accounts`). Public posting requires a passed audit.
- Whether an audit will be approved for a personal single-user app is not addressed in the docs. The "incomplete or test apps are not approved" guidance is a real risk. Inbox upload (`video.upload`) may be a lower-friction fallback.
- Web flow PKCE is not documented, but the code exchange does not need `code_verifier` for web. For an iPhone app that uses a server redirect, the flow is "web", so `client_secret` stays on the server.
- Refresh tokens rotate, so you must persist the new one each time (race condition risk with concurrent refreshes). Access tokens last only 24 hours.
- `upload_url` expires in 1 hour, and chunks must go in sequence, so retrying after a timeout may need a fresh init (6 init requests/min).
- Two different error shapes exist: the OAuth endpoint returns flat `error` / `error_description`, while the API returns the nested `error.code`.
- The public post id is only available after moderation, and no URL is documented.
- The Direct Post guidelines require the privacy picker with no default plus the consent text, so a one-tap "post" button is not compliant. The app needs a per-post screen.
