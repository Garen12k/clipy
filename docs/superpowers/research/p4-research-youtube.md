# YouTube direct posting research (fetched 2026-10-02)

Legend: [V] = stated in a fetched official page (URL given). [U] = unverified / inferred / not on a fetched page. Note: WebFetch summarises pages with a small model, so exact wording should be spot-checked before you rely on any single line.

## 1. OAuth 2.0 (server-side web flow, PKCE)

Source: https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps and https://developers.google.com/identity/protocols/oauth2/web-server

- Authorize endpoint [V]: `https://accounts.google.com/o/oauth2/v2/auth`
  - Required: `client_id`, `redirect_uri`, `response_type=code`, `scope` (space-delimited).
  - Recommended: `access_type=offline` (needed to receive a refresh_token), `state` (random, server must validate on return), `include_granted_scopes=true` (incremental auth).
  - Optional: `login_hint`, `prompt` (`none` | `consent` | `select_account`), `enable_granular_consent` (default true).
- PKCE [mixed]: the web-server pages above do NOT mention PKCE or `code_challenge` at all [V: absent]. Google's native/iOS page documents the parameters: `code_verifier` 43-128 chars from [A-Za-z0-9-._~]; `code_challenge` = base64url(no padding) SHA256(verifier); `code_challenge_method=S256` (https://developers.google.com/identity/protocols/oauth2/native-app). Using PKCE on a Web-application client with a client_secret is therefore [U] from official docs (secondary sources say Google accepts `code_challenge`/`code_verifier` there). Harmless to send; keep `state` + secret as the real protection. Test it once.
- Token exchange [V]: `POST https://oauth2.googleapis.com/token`, `Content-Type: application/x-www-form-urlencoded`, body `code, client_id, client_secret, redirect_uri, grant_type=authorization_code` (+ `code_verifier` if PKCE used [U]).
  - Response: `{"access_token":"...","expires_in":3920,"refresh_token":"...","scope":"https://www.googleapis.com/auth/youtube.upload","token_type":"Bearer"}`. `refresh_token_expires_in` only appears for time-based grants.
  - refresh_token is only returned on first consent (with `access_type=offline`); `prompt=consent` forces a new one [prompt=consent behaviour: parameter exists [V]; "forces new refresh token" is common knowledge [U]].
- Refresh [V]: `POST https://oauth2.googleapis.com/token` body `grant_type=refresh_token, client_id, client_secret, refresh_token`.
- Revoke [V]: `POST https://oauth2.googleapis.com/revoke`, form body `token=<access or refresh token>`; success = 200 OK.
- Access token lifetime: given in `expires_in` (example 3920 s; docs give no fixed number) [V]. Typically ~1 h [U].
- Refresh-token death conditions [V] https://developers.google.com/identity/protocols/oauth2: user revoked; unused 6 months; password change when Gmail scopes included; over max live tokens (100 per account per OAuth client; oldest silently invalidated); time-based access expired; admin-restricted service. Consent screen in "Testing" => refresh token expires in 7 days (unless only name/email/profile scopes).
- `invalid_grant` [V]: token expired/invalidated -> re-authenticate and re-consent.
- Client type [V]: "Web application" (Clients page > Create client > Web application, add authorized redirect URIs). Web server apps are the ones that can keep a secret. https://developers.google.com/identity/protocols/oauth2/web-server
- Redirect URI rules [V]: exact match to registered URI; HTTPS required (localhost exempt); no raw IPs; host must be on public suffix list TLD and not googleusercontent.com; no URL shorteners; no userinfo; no `..`; no open redirects; no fragment; no wildcards. A `https://<ref>.supabase.co/functions/v1/<fn>` URI fits these rules [inferred; supabase.co is a public-suffix domain].
- Mobile return: your function redirects to your app's custom scheme/universal link after exchange (that is your own redirect, not registered with Google) [U].

## 2. Scopes and channel info

- Scopes list [V] https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps: `youtube.upload` ("Manage YouTube videos"), `youtube.readonly` ("View YouTube account"), `youtube`, `youtube.force-ssl`, `youtubepartner`, etc. All under `https://www.googleapis.com/auth/`.
- videos.insert accepts `youtube.upload`, `youtube`, `youtubepartner`, `youtube.force-ssl` [V] https://developers.google.com/youtube/v3/docs/videos/insert
- channels.list with `mine=true` needs authorization; the fetched page did not name the scope [V partially] https://developers.google.com/youtube/v3/docs/channels/list. `youtube.upload` alone is NOT documented as sufficient for channels.list; `youtube.readonly` is the least-privilege read scope [U - test; if only `youtube.upload` is requested, channels.list may return 403]. Request both `youtube.upload youtube.readonly`.
- Call: `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true` with `Authorization: Bearer`. Cost 1 unit [V]. Fields: `items[0].snippet.title`, `items[0].snippet.thumbnails.default|medium|high.url` (88/240/800 px, HTTPS) [V] https://developers.google.com/youtube/v3/docs/channels. Use `fields=items(id,snippet(title,thumbnails/default/url))` to shrink [U].
- User with Google account but no channel: error `youtubeSignupRequired` 401 [V] https://developers.google.com/youtube/v3/docs/errors

## 3. Resumable upload

Source: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol and https://developers.google.com/youtube/v3/docs/videos/insert

- Initiate [V]: `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
  - Headers: `Authorization: Bearer <access>`, `Content-Type: application/json; charset=UTF-8`, `Content-Length: <metadata bytes>`, `X-Upload-Content-Length: <video bytes>`, `X-Upload-Content-Type: video/*` (e.g. video/mp4).
  - Body: video resource, e.g. `{"snippet":{"title":"...","description":"...","categoryId":"22"},"status":{"privacyStatus":"private","selfDeclaredMadeForKids":false}}`
  - Optional query: `notifySubscribers` (default true) [V].
  - Response: `200 OK` with `Location:` header = session URI [V].
- Does the session URI need Authorization when PUT by another client? 
  - YouTube doc [V]: the guide lists `Authorization` as a header for the upload/resume requests ("The authorization token for the request"). So the OFFICIAL YouTube page does NOT say it is optional. 
  - Cloud Storage's equivalent docs [V, different product] state the session URI "acts as an authentication token ... can be used by anyone" https://docs.cloud.google.com/storage/docs/resumable-uploads
  - For YouTube specifically: NOT verified by official docs. Community experience is that the Google upload-server session URI (contains `upload_id`) works without Authorization, but treat as [U] and run a 5-minute test (curl PUT with no header). Fallback: have the phone upload with a short-lived access token passed from the server (access tokens are only ~1 h and scoped), which is explicitly supported by the docs.
- Chunked PUT [V]: `PUT <session URI>`, `Content-Length`, `Content-Range: bytes 0-524287/2000000`. Chunk size must be a multiple of 256 KB (262144 bytes), except the last chunk; all but last the same size. Single-request upload also allowed (whole file).
- Intermediate response [V]: `308 Resume Incomplete` with `Range: bytes=0-524287` of what is stored (Range may be absent if nothing received [U]).
- Status query [V]: empty `PUT` with `Content-Length: 0` and `Content-Range: bytes */<total>` -> 308 + Range, or 200/201 if complete.
- Final [V]: `201 Created` (docs; some clients see 200) with the video resource body: `{"kind":"youtube#video","id":"<videoId>","snippet":{...},"status":{...}}` (shape [U] beyond `id`; guide just says "video resource").
- Retry [V]: 500/502/503/504 -> exponential backoff & resume; other 4xx permanent; expired session -> 404 (start a new session).
- Session lifetime: doc only says it "eventually expires"; no number [V]. (GCS says 1 week; do not assume that for YouTube.)

## 4. Metadata, Shorts, URLs

Source: https://developers.google.com/youtube/v3/docs/videos
- `snippet.title`: max 100 characters, `<` and `>` not allowed [V].
- `snippet.description`: max 5000 bytes, no `<` `>` [V].
- `snippet.categoryId`: string (default not stated in fetched pages); "22" (People & Blogs) is the usual default used in Google samples [U]. 
- `status.privacyStatus`: `private`, `public`, `unlisted` [V].
- `status.selfDeclaredMadeForKids`: boolean, settable on insert [V]. Also `status.containsSyntheticMedia` (added 2024-10-30) [V] https://developers.google.com/youtube/v3/revision_history. Provide both explicitly to avoid UI prompts [U].
- Shorts rules [V] https://support.google.com/youtube/answer/15424877 : square or vertical aspect ratio, up to 3 minutes (since 15 Oct 2024; Official Artist Channels since 8 Dec 2025). Older ones stay as before. Shorts help mentions max 1080p [V weak] https://support.google.com/youtube/answer/10059070
- `#Shorts` hashtag: not mentioned as required on either help page [V: absent]. Classification is automatic by duration+aspect ratio. Adding `#Shorts` in title/description is harmless but unnecessary [U].
- There is no API field for "is Short"; videos.insert is the same call [U-by-absence].
- URLs [U, not on fetched pages; widely used]: `https://youtube.com/shorts/<id>`, `https://youtu.be/<id>`, `https://www.youtube.com/watch?v=<id>`.

## 5. Restrictions for unverified projects / what a single user can do

- Private lock [V] https://developers.google.com/youtube/v3/docs/videos/insert : "All videos uploaded via the videos.insert endpoint from unverified API projects created after 28 July 2020 will be restricted to private viewing mode" until the project passes an audit. Secondary sources (not official) say this holds even if `privacyStatus: public` is sent and that locked videos can't be appealed, only re-uploaded: https://www.upload-post.com/youtube-api/ , https://clipember.com/guides/youtube-upload-comes-out-private
- Audit path [V]: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits and form https://support.google.com/youtube/contact/yt_api_form ("Audit and Quota Extension Form"). Official pages fetched say nothing about timing or about personal/test-user exemptions.
- Consent screen "Testing" [V] https://support.google.com/cloud/answer/15549945 : up to 100 test users, authorization/refresh token expires after 7 days. 
- Sensitive scopes [V] https://support.google.com/cloud/answer/7454865 : unverified app screen; cap of 100 new users; "if your app is experimental or a test build, you don't need to go through verification unless you decide to launch it to the public". `youtube.upload` being "sensitive" is [U] (page fetched doesn't classify it; widely known as sensitive).
- What one personal user can do: (a) Testing mode, own account as test user: works, but refresh token dies every 7 days -> re-link weekly. (b) Publish consent screen to "In production" without verification: shows "unverified app" warning, 100 user cap; the refresh-token 7-day expiry applies to Testing status only [V per oauth2 page] so this is the usual way to avoid weekly re-login [common practice, U that it still works in 2026]. (c) Either way, the API-project private lock [V] means uploads arrive PRIVATE until audit. The owner can flip them to public manually in YouTube Studio/app (manual flip not documented in fetched pages [U]). Whether a brand-new project created in 2026 is treated as "unverified" for the lock: yes per the doc sentence (created after 2020, unaudited).
- Not found: any official statement exempting a project only used by its owner. Treat as no exemption.

## 6. Quota and errors

- Default quota [V] https://developers.google.com/youtube/v3/determine_quota_cost and https://developers.google.com/youtube/v3/getting-started : 10,000 units/day for other endpoints, plus separate buckets of 100 `videos.insert` calls/day and 100 `search.list` calls/day. Since 2026-06-01 (granular buckets) `videos.insert` costs 1 per call against its own 100/day bucket [V] https://developers.google.com/youtube/v3/revision_history . Earlier (Dec 2025) cost dropped from ~1600 to ~100 units [V same page]; older pre-June-2026 knowledge (1600 units) is obsolete. channels.list = 1 unit [V].
- Error JSON shape: standard Google API: `{"error":{"code":403,"message":"...","errors":[{"message":"...","domain":"youtube.quota","reason":"quotaExceeded"}]}}` [U exact shape; the errors page https://developers.google.com/youtube/v3/docs/errors lists only code+reason].
  - `quotaExceeded` 403 [V]; `uploadLimitExceeded` 400 = channel's daily upload cap, separate from API quota [V]; `forbidden` 403 [V]; `youtubeSignupRequired` 401 [V]; `badRequest` 400 invalid metadata, `mediaBodyRequired` 400 [V videos.insert page].
  - Token endpoint errors: `{"error":"invalid_grant","error_description":"Token has been expired or revoked."}` [U exact text; `invalid_grant` meaning V].

## 7. Console click path (for a non-technical user)

Official sources fetched give only the outline: create project, enable YouTube Data API v3 from API Library, configure OAuth consent (Audience External; Testing; test users), create client of type Web application with redirect URIs: https://developers.google.com/youtube/v3/getting-started , https://support.google.com/cloud/answer/15549945 , https://developers.google.com/identity/protocols/oauth2/web-server. Exact menu labels below are [U] (Google renamed to "Google Auth platform" with Branding / Audience / Clients / Data Access pages; verify on screen):
1. Go to https://console.cloud.google.com, sign in with the Google account that owns the YouTube channel. Top bar project picker > New project > name "Clipy" > Create.
2. Menu > APIs & Services > Library > search "YouTube Data API v3" > Enable.
3. Menu > APIs & Services > OAuth consent screen (Google Auth platform) > Get started: app name "Clipy", support email = yours; Audience = External; contact email; accept policy; Create.
4. Audience page: keep Publishing status "Testing" (or press Publish app to avoid the 7-day expiry; see section 5). Under Test users > Add users > add your own Google email > Save.
5. Data Access page > Add or remove scopes > tick `.../auth/youtube.upload` and `.../auth/youtube.readonly` > Save (optional; scopes are also requested in the URL).
6. Clients page (or APIs & Services > Credentials > Create credentials > OAuth client ID) > Application type "Web application" > name "Clipy server" > Authorized redirect URIs > Add URI: the full Supabase function URL, e.g. `https://<project-ref>.supabase.co/functions/v1/youtube-oauth-callback` > Create.
7. Copy Client ID and Client secret from the dialog (secret may only be shown once; can download JSON) and give them to the developer to store as Supabase secrets (never in the app).
8. First sign-in will show "Google hasn't verified this app": Advanced > "Go to Clipy (unsafe)" > allow.

## Surprises / risks
- videos.insert from an unaudited project: uploads are locked PRIVATE (official doc). Direct "public" posting for a personal app is therefore not achievable without passing the YouTube API compliance audit.
- Testing status => refresh token expires every 7 days; fix by publishing the consent screen (unverified, 100-user cap) or accept weekly relink.
- Official YouTube resumable doc lists Authorization on upload PUTs; "session URI works without a token" is only documented for Cloud Storage, not YouTube. Must test; fallback is passing a short-lived access token to the phone.
- Shorts limit is now 3 min (since 2024-10-15), square or vertical; no #Shorts needed per Help pages.
- Quota model changed 2026-06-01: videos.insert has its own bucket of 100 uploads/day, 1 per call (old 1600-unit figure obsolete).
- PKCE is not documented for Google web-server flow (only for native); using it with a client_secret is unverified, test it.
- Session lifetime for YouTube is undocumented ("eventually expires"), 404 when expired; do not assume a week.
