# Meta direct posting research (as of 2026-10-02)

Method: WebFetch of developers.facebook.com pages (a small model summarises each page, so quotes are paraphrased).
Items marked [UNVERIFIED] could not be confirmed from an official page.
Items marked [CONFLICT] had contradictory sources.

## 0. Graph API version
- Latest is v26.0 (released 2026-07-29, expiry TBD). v25.0 released 2026-02-18, expires 2028-07-29. v24.0 expires 2028-02-18.
  https://developers.facebook.com/docs/graph-api/changelog/versions
- Doc examples still use v25.0 (reels page, content publishing). Use v25.0 or v26.0 and pin it in one constant.
- The FB Login for Business dialog doc shows `https://www.facebook.com/v26.0/dialog/oauth`.
  https://developers.facebook.com/docs/facebook-login/facebook-login-for-business

## 1. Two ways to publish to Instagram
Comparison page: https://developers.facebook.com/docs/instagram-platform/overview
- Instagram Login:
  - Host `graph.instagram.com`, Instagram User access token.
  - Scopes `instagram_business_basic`, `instagram_business_content_publish` (plus comments/messages scopes).
  - No Facebook Page required.
- Facebook Login:
  - Host `graph.facebook.com`, Facebook User or Page token.
  - Permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` (plus manage_comments/insights/messages).
  - A linked Facebook Page is mandatory.
  - Extra features (hashtag search, product tagging, partnership ads) exist only here.
- Content-publishing permissions (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing):
  - IG Login: `instagram_business_basic`, `instagram_business_content_publish`.
  - FB Login: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`.
  - FB Login also needs `ads_management` and `ads_read` if the user's Page role is via Business Manager.
  - `business_management` is NOT listed for publishing.
- Account type: Instagram Business or Creator (professional).
  - A Facebook Page connected to it is required for FB Login.
    https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
  - The IG Login get-started page needs a Business-type app and a professional account.
    https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- Page Publishing Authorization (PPA) must be completed if the Page requires it.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- FB Login get-started now says to implement "Facebook Login for Business" (config_id based), a Business-type app, and user token via that flow.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started

### CRITICAL: resumable upload is Facebook-Login-only
- Three official pages state the resumable upload "is available only for apps that have implemented Facebook Login for Business":
  - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
  - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing
  - https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads.md
- With Instagram Login the only documented route is `video_url`, a public URL that Meta cURLs. That means hosting the video somewhere.
- [CONFLICT] The IG User Media reference does not state the login restriction.
  https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- Third-party blogs also claim IG Login supports it. The official content-publishing pages say otherwise.
- Treat IG Login + resumable as unsupported unless a live test proves otherwise.

## 2. OAuth
### Instagram Login (Business Login for Instagram)
Source: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- Authorize: `https://www.instagram.com/oauth/authorize`
  - Params: `client_id` (Instagram App ID), `redirect_uri`, `response_type=code`, `scope` (comma or space separated), optional `state`, `force_reauth`, `enable_fb_login`.
- Redirect returns `?code=...#_`. Strip the `#_`. The code is valid 1 hour and single use.
- Code exchange: `POST https://api.instagram.com/oauth/access_token` with form fields `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`, `code`.
  - The response contains `access_token`, `user_id`, `permissions`. The page summary wrapped it in `data:[{...}]`; the exact wrapper is [UNVERIFIED]. Parse defensively.
  - Short-lived token lives 1 hour.
    https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- Long-lived exchange: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...&access_token=<short>`.
  - Returns flat `{access_token, token_type:"bearer", expires_in:~5184000}`, i.e. 60 days.
    https://developers.facebook.com/docs/instagram-platform/reference/access_token
  - Must be done server-side because it carries the secret.
- Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<long>`.
  - The token must be at least 24h old and unexpired, and the user must have granted `instagram_business_basic`.
  - A token unused for 60 days expires permanently.
  - Same response shape as the exchange.
- Profile: `GET https://graph.instagram.com/{version}/me?fields=user_id,username,name,account_type,profile_picture_url,...&access_token=...`.
  The `id`/`user_id` is the IG user id.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- A Dashboard "Generate token" button gives a 60-day token with no OAuth. This is handy for a one-person app, but you must still refresh it.

### Facebook Login
- Dialog: `https://www.facebook.com/v25.0/dialog/oauth?client_id&redirect_uri&state[&scope][&response_type=code]`.
  https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
- Code exchange: `GET https://graph.facebook.com/v25.0/oauth/access_token?client_id&redirect_uri&client_secret&code` returns `{access_token, token_type, expires_in}`.
- Facebook Login for Business uses `config_id` instead of `scope`, and `response_type=code` plus `override_default_response_type=true` for system-user tokens.
  Requires a Business-type app. Works in development with role users.
  https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- Long-lived user token: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token=<short>`.
  - Returns `{access_token, token_type, expires_in:~5183944}` (~60 days). Server only.
  - Page tokens fetched with a long-lived user token via `GET /{user-id}/accounts` are non-expiring.
  - The response lists `name`, `id`, `access_token`, `tasks`, `category`.
  https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
- IG user id: `GET /me/accounts?fields=instagram_business_account`.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
- Username and profile picture come from `GET /{ig-user-id}?fields=username,profile_picture_url`. [UNVERIFIED on a specific page; the fields are listed for IG Login /me.]
- Page name comes from the `/me/accounts` field `name`. The Page picture is `/{page-id}/picture` or `?fields=picture`. [UNVERIFIED on a fetched page.]
- `/me/accounts` returns app-scoped Pages the user holds a role on. A `tasks` list including CREATE_CONTENT is required for posting.

## 3. Instagram Reels publishing
Pages: https://developers.facebook.com/docs/instagram-platform/content-publishing/ and https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- Create container: `POST /{ig-user-id}/media` with `media_type=REELS`.
  - Either `video_url=<public URL>` or `upload_type=resumable`.
  - Optional: `caption`, `share_to_feed`, `cover_url`, `thumb_offset`, `audio_name`, `collaborators`, `location_id`, `user_tags`, `trial_params`, `is_ai_generated`.
- Resumable container response: `{"id":"<container>","uri":"https://rupload.facebook.com/ig-api-upload/v25.0/<container>"}`.
- Upload: `POST https://rupload.facebook.com/ig-api-upload/{version}/{container-id}`.
  - Headers: `Authorization: OAuth <ACCESS_TOKEN>`, `offset: 0`, `file_size: <bytes>`. Body is the raw bytes (`--data-binary`).
  - Alternative: a `file_url: <public url>` header and no body.
  - Success: `{"success":true,"message":"Upload successful."}`.
  - Failure: includes `debug_info` and `retriable`.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing
- Resume: the docs say "The API allows you resume a local file upload operation after a network interruption" by sending the offset matching bytes already transferred.
  Query the upload status to read `uploading_phase` (bytes transferred) and `processing_phase`.
  https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads.md
- The exact status endpoint for IG upload progress is [UNVERIFIED]; by analogy it is `GET /{container-id}?fields=status`.
- The docs show a single POST with the whole file and an offset for resume. Multi-chunk semantics (each request sending a slice) are NOT documented for IG. The FB Reels doc is the same. Plan to relay the full body from offset, or test slicing empirically.
- Max size: the reference lists Reels max file size 300 MB. Other pages give no limit.
- Status: `GET /{container-id}?fields=status_code` returns `IN_PROGRESS|FINISHED|ERROR|EXPIRED|PUBLISHED`.
  - Docs recommend polling once a minute, for at most 5 minutes.
  - EXPIRED means not published within 24h.
- Publish: `POST /{ig-user-id}/media_publish?creation_id=<container>` returns `{"id":"<ig-media-id>"}`.
- Published Reels report `media_type=VIDEO`; check `media_product_type=REELS`.
- Permalink: `GET /{media-id}?fields=permalink` (field listed on the ig-media reference).
  https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media
- Rate limit [CONFLICT]:
  - The content-publishing page says 100 API-published posts per 24h moving window.
  - The `content_publishing_limit` reference example shows `quota_total: 50`, `quota_duration: 86400`.
  - Query `GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config` for the real number.
  - Reference: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit

## 4. Facebook Page Reels
Source: https://developers.facebook.com/docs/video-api/guides/reels-publishing
1. `POST https://graph.facebook.com/v25.0/{page-id}/video_reels` with `upload_phase=start` and the Page access token. Returns `{"video_id":"...","upload_url":"https://rupload.facebook.com/video-upload/<video-id>"}`.
2. `POST https://rupload.facebook.com/video-upload/v25.0/{video-id}` with headers `Authorization: OAuth <page token>`, `offset: 0`, `file_size: <bytes>` and the binary body. Response `{"success":true}`.
   - Alternative: a `file_url` header with a public URL. Meta fbcdn URLs are rejected.
3. Resume: `GET /v25.0/{video-id}?fields=status`. Read `status.uploading_phase.bytes_transfered`, then POST again with `offset=<that value>`.
4. Finish: `POST /{page-id}/video_reels?video_id=...&upload_phase=finish&video_state=PUBLISHED&description=...&title=...`. Returns `{"success":true}`.
   - `video_state` is `DRAFT`, `SCHEDULED` or `PUBLISHED`.
   - Scheduling uses `scheduled_publish_time`, 10 minutes to 29 days ahead.
   - Optional `place`.
5. Poll: `GET /{video-id}?fields=status`.
   - `status.video_status` is `uploading|processing|ready|error|expired`.
   - `status.publishing_phase.publish_status` is `published` etc., with `publish_time`.
6. Permalink: not shown in this page. [UNVERIFIED] Likely `GET /{video-id}?fields=permalink_url`; the list endpoint `GET /{page-id}/video_reels` returns `id`, `updated_time`, `description`.
- Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, plus a Page token with the CREATE_CONTENT task. `publish_video` is not mentioned on the Reels page.
- Rate limit: 30 API-published Reels per Page per 24h.
- The guide says "only publish Reels to Facebook Pages".
- Fallback classic video: the Page-posts doc says `publish_video` is required "if you are publishing a video to the Page".
  https://developers.facebook.com/docs/pages-api/posts
  - The classic chunked `/{page-id}/videos` on graph-video.facebook.com (start/transfer/finish) is NOT confirmed by my fetch. [UNVERIFIED]
  - The fetched resumable guide described the generic App Uploads API (`/{app-id}/uploads`, `upload:<session>`) instead.
    https://developers.facebook.com/docs/video-api/guides/publishing

## 5. Media requirements
- IG Reels (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/):
  - Duration 3 s to 15 min.
  - Max file 300 MB.
  - Aspect ratio 0.01:1 to 10:1 (9:16 recommended).
  - Codec HEVC or H264.
  - 23-60 fps.
  - Audio AAC, max 48 kHz, 1-2 channels, 128 kbps.
  - Video bitrate VBR, max 25 Mbps.
  - Container (MP4/MOV) is not stated in the fetched text.
- FB Reels (https://developers.facebook.com/docs/video-api/guides/reels-publishing):
  - .mp4 recommended.
  - 9:16, 1080x1920 recommended, minimum 540x960.
  - 3-90 s.
  - 24-60 fps.
  - H.264/H.265 (VP9, AV1 also listed).
  - AAC-LC stereo, 48 kHz, 128 kbps+.
  - 4:2:0, closed GOP of 2-5 s, progressive.
  - Errors: 1363040 aspect ratio, 1363127 resolution, 1363128 duration, 1363129 fps.
- The FB Reels maximum duration is only 90 s, while IG is up to 15 min. Cap the editor's export at 90 s for FB.

## 6. Access levels
- Standard Access is automatic for Business, Consumer and Gaming apps.
  It lets you request permissions from users who hold a role (admin, developer, tester) on the app.
  Advanced Access is for any user, and needs Business Verification and possibly App Review.
  https://developers.facebook.com/docs/graph-api/overview/access-levels
- Instagram: "Standard Access suffices for personal account management without additional review". Advanced is needed only for accounts you don't own or manage.
  https://developers.facebook.com/docs/instagram-platform/overview
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- Dev mode: role users only, permissions with standard or advanced level, no review. No time limit or inactivity rule appears in the app-modes doc.
  https://developers.facebook.com/docs/development/build-and-test/app-modes
- Meta's Live-mode blog says dev-mode apps cannot manage assets (Pages etc.) not owned by their own business, and cannot access data of non-associated users.
  https://developers.facebook.com/blog/post/2019/09/23/live-mode-for-production-use/
- Answer: a single person with a role on the app can publish to their own IG account indefinitely under Standard Access. Nothing found imposes an expiry.
- Facebook caveat: secondary sources say posts made by an app in Development mode are visible only to Page admins and app roles, not the public. [UNVERIFIED in official docs]
  e.g. https://github.com/verbb/social-poster/issues/32
  The reliable fix is Live mode. Standard Access works for role users in Live mode too. Test early.
- Business Verification and App Review are not needed for the own-account scenario per the docs above.

## 7. Errors
Source: https://developers.facebook.com/docs/graph-api/guides/error-handling
- Shape: `{"error":{"message","type","code","error_subcode","error_user_title","error_user_msg","fbtrace_id"}}`.
- 190: access token expired or invalid. Subcodes: 458 app not installed, 460 password changed, 463 expired, 467 invalid or revoked.
- 10: permission denied. 200-299: permission issues.
- 4: app rate limit. 17: user rate limit. 1 and 2: unknown error or service issue, retry.
- 368: policy violation. 100: missing or invalid param.
- 9007 (media not ready) and 2207xxx IG publish codes: [UNVERIFIED]. No official page fetched listed them.
  Handle by polling `status_code` and treat 2207xxx as a failed publish with the message passed to the user.

## 8. Dashboard click path (partly UNVERIFIED)
Official create-app pages returned only a header or stub to my fetch tool, so this is NOT confirmed against current docs.
The flow below is what the docs index describes plus general knowledge:
- Index: https://developers.facebook.com/documentation/instagram-platform/llms.txt
- Create-app page: https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app.md
1. Convert the Instagram account to Professional (Business or Creator) in the Instagram app (Settings > Account type and tools).
2. For Facebook Login (recommended, see below): create a Facebook Page, then link the IG account to it in the Instagram app (Edit profile > Page) or in Page settings > Linked accounts.
3. Go to developers.facebook.com/apps > Create app. Pick the "Manage messaging and content on Instagram" use case (the wording may vary). App type must be Business.
4. Add the Instagram product and choose "API setup with Facebook login" (or "with Instagram login").
5. Add Facebook Login for Business, create a Configuration and note the Configuration ID. Add the OAuth redirect URI (the Supabase Edge Function URL) under the Login settings.
6. App settings > Basic: copy App ID and App Secret. For Instagram Login, the Instagram app ID and secret are shown on its API setup page, and are different from the main App ID.
7. App roles: add yourself as Administrator (already so). Instagram Login additionally needs the IG account added as an "Instagram Tester", accepted at instagram.com under Settings > Apps and websites > Tester invites.
8. Leave the app in Development mode (or flip it to Live for FB post visibility).

## 9. Upload hosts and tokens
- Every documented upload request to `rupload.facebook.com` carries `Authorization: OAuth <token>`.
  Examples: IG upload (content-publishing pages above) and FB Reels (reels-publishing page).
- The only token-less alternatives are `file_url` headers pointing to a public URL, which means hosting the video.
- The `upload_url` returned by `video_reels start` omits the version and is a plain URL with no signature. There is no documented pre-signed URL.
- So the phone cannot upload with only a pre-signed URL. Either the phone holds the token, or the server relays the bytes.
- Option: have the server hand the phone a short-lived Page or user token. This is not recommended, but a personal app could.
  Otherwise the server relays chunks. Chunk semantics are undocumented, so test them.

## Surprises and risks
- Resumable (no-hosting) IG upload is documented only for Facebook Login for Business. Instagram Login documents only `video_url`.
- IG docs disagree on the daily post quota (100 vs 50). Check `content_publishing_limit` at runtime.
- FB Reels max is 90 s and 30 per day. IG Reels is up to 15 min.
- FB posts from Development-mode apps may not be public. Check with a test post.
- Chunking is not documented, only full-body-from-offset resume. The relay design must assume that.
- The Instagram Login short-lived response shape (flat or in `data[]`) is unclear. Parse both.

## Recommendation (Instagram part)
- Use Instagram API with Facebook Login for Business. Reasons:
  - It is the only route with official resumable upload, so no video hosting.
  - One Facebook login also yields the Page token for the Facebook Reels part.
  - Page tokens from a long-lived user token don't expire.
- Cost: you need a Facebook Page linked to the IG account, plus the `config_id` setup.
- Instagram Login is simpler (no Page) but forces hosting the video at a public URL (e.g. temporary Supabase Storage with a signed URL). That conflicts with the goal of not hosting.
- Fallback: if Facebook Login proves too heavy, use Instagram Login + a short-lived signed storage URL, deleted after the container reaches FINISHED.
- Before building, run one real test: dev-mode app, one Reel to IG via resumable upload, and one Reel to the Page.
