# X API research for direct video posting (fetched 2026-10-02)

Method note: pages were fetched via WebFetch (summarised by a small model), so wording is paraphrased. Items marked UNVERIFIED were not found in the docs I could reach; confirm them before building.

## 1. OAuth 2.0 Authorization Code + PKCE (confidential client)
Source: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
- Authorize URL: `https://x.com/i/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...&scope=...&state=...&code_challenge=...&code_challenge_method=S256`
- Params: response_type=code, client_id (from Developer Console), redirect_uri (exact match), state (random, up to 500 chars), code_challenge, code_challenge_method (`S256` or `plain`; use S256), scope (space separated, URL-encoded %20).
- Token endpoint: `POST https://api.x.com/2/oauth2/token`, `Content-Type: application/x-www-form-urlencoded`. Confidential clients may use `Authorization: Basic base64(client_id:client_secret)` (or credentials in the body). Body for the code exchange: code, grant_type=authorization_code, redirect_uri, code_verifier (docs page did not show the full example in my fetch; this is standard and consistent with the PKCE requirements it lists).
- Authorization code expires after 30 seconds (same page), so exchange it immediately on the server.
- Access token valid 2 hours by default (same page). `offline.access` scope yields a refresh token.
- Refresh: POST same token endpoint, form body `grant_type=refresh_token`, `refresh_token=...`, (`client_id` for public clients; Basic auth for confidential). Source: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/user-access-token and the authorization-code page.
- Refresh-token rotation and refresh-token lifetime: UNVERIFIED (docs I fetched do not say). Safest: always store the new refresh_token returned on each refresh, serialise refreshes per user.
- Revoke: the docs describe a revoke step (logout) but I could not retrieve the endpoint page (https://docs.x.com/x-api/users/revoke-oauth2-token returned 404). UNVERIFIED: believed to be `POST https://api.x.com/2/oauth2/revoke` with `token`, `client_id`, `token_type_hint`. Users can also revoke in X Settings > Connected apps.
- Callback URLs: exact match, max 10 per app, https for production, `http://127.0.0.1` allowed for local dev, javascript/data/file protocols prohibited. Source: https://docs.x.com/resources/fundamentals/developer-apps . Custom app schemes not confirmed; use an https server callback (Supabase function) which then bounces to the app.
- App type: confidential clients = "Web App, Automated App or Bot" (get a Client Secret); public = Native App / Single Page App. Source: authorization-code page.

## 2. Scopes
Source: https://docs.x.com/x-api/posts/creation-of-a-post , https://docs.x.com/x-api/media/initialize-media-upload , authorization-code page
- Create post: `tweet.write` (plus `tweet.read`, `users.read` per X convention). Media upload: `media.write` ("Upload media"). Refresh tokens: `offline.access`.
- Request: `tweet.read tweet.write users.read media.write offline.access`.
- `GET https://api.x.com/2/users/me?user.fields=profile_image_url` with Bearer user token; rate limit 75/15min per user (https://docs.x.com/x-api/fundamentals/rate-limits). Response shape `{data:{id,name,username,profile_image_url}}` is standard v2 (not shown on pages I fetched).

## 3. Media upload v2 (chunked)
Source: https://docs.x.com/x-api/media/quickstart/media-upload-chunked ; https://docs.x.com/x-api/media/initialize-media-upload
- Auth: `Authorization: Bearer <USER ACCESS TOKEN>`; init endpoint accepts OAuth2 user token with `media.write` scope (also OAuth 1.0a user token). OAuth 2.0 user bearer: YES.
- INIT: `POST https://api.x.com/2/media/upload/initialize`, JSON `{"media_type":"video/mp4","total_bytes":N,"media_category":"tweet_video"}`. Optional: additional_owners, shared. total_bytes max 17,179,869,184. Response `{"data":{"id":"...","media_key":"13_...","expires_after_secs":86400}}`.
- APPEND: `POST https://api.x.com/2/media/upload/{id}/append`, multipart/form-data fields `segment_index` (0-based int) and `media` (binary). Keep each segment <= 5 MB (server max 8 MB).
- FINALIZE: `POST https://api.x.com/2/media/upload/{id}/finalize`, no body. Response `{"data":{"id":..., "processing_info":{"state":"pending","check_after_secs":1}}}` (id/media_key presumably also present).
- STATUS: `GET https://api.x.com/2/media/upload?command=STATUS&media_id={id}`. States pending -> in_progress -> succeeded | failed; poll after `check_after_secs`. (progress_percent: UNVERIFIED on v2 page.)
- Docs explicitly say do NOT send command=INIT/APPEND/FINALIZE to `POST /2/media/upload` (old protocol).
- Supported video types: MP4, WebM, MP2T, QuickTime (initialize page). Categories: tweet_video, amplify_video, tweet_gif, tweet_image, dm_*, subtitles.

## 4. Create post
Source: https://docs.x.com/x-api/posts/creation-of-a-post
- `POST https://api.x.com/2/tweets`, Bearer user token, JSON `{"text":"...","media":{"media_ids":["<id>"]}}`. media_ids 1-4 (max 1 video). Response 201 `{"data":{"id":"...","text":"...","edit_history_post_ids":[...]}}`.
- Public URL `https://x.com/<username>/status/<id>` : standard format, not stated on fetched pages; username from /2/users/me.

## 5. Video requirements
Source: https://docs.x.com/x-api/media/quickstart/media-upload-chunked ; creation-of-a-post page
- tweet_video: default users 20 min / 8 GB; Premium/verified 125 min / 16 GB. (Your 140 s / 512 MB figures are now for `dm_video`, not posts: dm_video 140 s/512 MB default, 10 min/1 GB premium.)
- Upload may succeed but attaching to a post returns 403 if duration exceeds the account's entitlement.
- Codec/resolution/fps/bitrate: NOT in fetched docs (they point to a "Best practices" page I could not locate). UNVERIFIED; H.264 MP4 AAC is the safe choice.

## 6. Pricing / tiers TODAY
Source: https://docs.x.com/x-api/getting-started/pricing
- Pay-per-usage; the page mentions NO Free/Basic/Pro tiers and no free tier. No minimum purchase stated. Credits are bought up front, with spending limits and auto-recharge.
- Post: Create $0.015/request; Post create with URL $0.200/request; summoned $0.010. Reads $0.005/post, user read $0.010/resource, owned reads $0.001. Media Metadata $0.005/request. Media upload (initialize/append/finalize) pricing: not listed on the page (UNVERIFIED; could be unbilled or unlisted).
- So a single personal user cannot post for free per the docs; expect roughly $0.015 per post (or $0.20 if the text contains a URL, so avoid links in captions). Check the console for any promo credit or free allowance.

## 7. Errors and rate limits
Sources: https://docs.x.com/x-api/fundamentals/response-codes-and-errors ; https://docs.x.com/x-api/fundamentals/rate-limits
- Errors: problem-style JSON with `title`, `detail`, `type` (URI like .../invalid-request), `status`; partial errors may appear in an `errors` array on 200. 403 for duration over entitlement. Exact `client-not-enrolled` / `unsupported-authentication` text: UNVERIFIED on fetched pages.
- 429 with headers `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` (unix seconds).
- POST /2/tweets: 100/15min per user, 10,000/24h per app. Media initialize/append/finalize: 1,875/15min per user each, 180,000/24h per app each. Legacy POST /2/media/upload: 500/15min user. Rate limits are independent of billing.

## 8. Developer portal clicks
Source: https://docs.x.com/resources/fundamentals/developer-apps
1. Go to console.x.com, log in as the X account.
2. Create App; give name, description, use case. Add credits/billing for pay-per-use.
3. In the app, open User authentication settings: choose OAuth 2.0; App type "Web App, Automated App or Bot" (confidential); App permissions "Read and write" (docs describe the permission tiers; exact UI labels may differ); Callback URI = the Supabase function URL (exact, https); Website URL (required by the form historically; docs page did not confirm).
4. Save, then copy Client ID and generate Client Secret; shown once, store immediately.

## Surprises / risks
- No free tier any more; pay-per-use only ($0.015/post, $0.20 with URL).
- tweet_video limits are 20 min / 8 GB (not 140 s / 512 MB) for normal users.
- 5 MB chunks recommended (8 MB max); Supabase function body size is fine per chunk, but one function call per chunk.
- Auth code expires in 30 s; exchange on the server immediately.
- Revoke endpoint, refresh-token rotation/lifetime and video codec specs could not be confirmed; verify before coding.
- Media upload billing not documented; check usage after a test post.
