# TikTok direct posting: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TikTok options sheet on the Post screen whose first control chooses **Send as draft** (the default: today's inbox route, unchanged by one byte) or **Post now** (TikTok's Direct Post API: the caption as the title, who can see it, comments / duet / stitch, the brand disclosure, the consent line), with the server checking every option against a fresh creator-info call before anything is posted.

**Architecture:** The server's TikTok adapter gains a second path taken ONLY when `options.mode === "direct"`: `creator_info/query` → checks → `video/init`; the upload protocol (`tiktok-chunks`), `post-finalize` and `post-status` are the existing ones. A new Edge Function `creator-info` (handler `creatorInfo`, adapter method `creatorInfo?`) gives the phone the creator's name, picture, privacy options and switches. A missing `video.publish` permission is `403 needs_permission` and never flags the account, so an old connection keeps posting drafts. On the phone: one pure module (`src/publish/tiktokDirect.ts`) holds the option shape, the rules and every sentence; the client adapter gains four optional hooks (`captionLimit`, `sendOptions`, `noteFor`, `doneNoteFor`) that the form and the row read; `TikTokOptions.tsx` is the sheet's body; `useCreatorInfo` fetches. No database migration, no new package, no native code.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Jest (`jest-expo`) + RNTL 14 for the app; plain TypeScript with web-standard APIs for `supabase/functions/_shared/` (tested under Node by `npm run test:server`, `.ts` import extensions, no `Deno.*` outside `runtime.ts` / `index.ts`).

**Spec:** `docs/superpowers/specs/2026-10-10-tiktok-direct-post-design.md` (binding: §3 the decisions D1–D22, §4 the API, §5 the shapes, §6 every sentence, §8 the proof, §10 deployment, §11 what is unverified).

**Baseline on `main` (`14e116c`), recorded 2026-10-10:** `npm run typecheck` clean; `npm test` = app **380 suites / 5972 tests**, server **15 suites / 464 tests**, all passing.

## Global Constraints

- **The draft path does not change.** Every edit to existing server or client code is a branch the draft path does not take. The two PROOF files of Task 1 are written and committed BEFORE any other change and are never edited afterwards; a red PROOF means the change is wrong.
- **Only `options.mode === "direct"` (that exact string) reaches the new server code.**
- **Never trust the phone:** in direct mode `prepare` calls `creator_info/query` itself and checks every option before `video/init`. A refusal makes no init call.
- **Tokens stay on the server.** `creator-info` returns the eight `CreatorInfo` fields and nothing else. Nothing logs a token, an upload address or an options object.
- **Post creation is never retried by itself.** `video/init` is called at most once per `post-prepare`. No new retry loop anywhere.
- **`needs_permission` never sets `needsReconnect`.** It is a plain `ApiError` (not a `PlatformError`), status 403.
- App code talks to the server only through `src/publish/api.ts`. Server logic: plain TS in `supabase/functions/_shared/`, `.ts` import extensions, no `Deno.*` there.
- UI: colours only from `const s = useSurfaces()` (never `theme.colors.text` / `accent` / `danger`, never a hex); spacing only from `theme.space`; sizes from `theme.size`, text sizes from `theme.type`; no `fontFamily`; no `textTransform`. **No apostrophe in JSX text and no `*` or `/` in a spacing value** (the spacing guard's blind spots): every sentence with an apostrophe is a constant in `src/publish/tiktokDirect.ts`. Buttons and chips are title style ("Try Again", "Reconnect", "Music Usage Confirmation"); everything else is sentence style ("Send as draft", "Who can see it", "Only me"). One `PrimaryButton` per screen: the sheet has none. Icons only through the kit `Icon`, and only names already in `SF_SYMBOLS` (`checkmark-circle-outline`, `checkbox-outline`, `square-outline`): no new icon name.
- No new animation; no `entering` / `exiting`.
- iPhone only. No Android or web path.
- RNTL v14: `render` / `fireEvent` are async: always `await`.
- A test that fails after your change because it names a **pinned line listed in your task** is updated as the task says. A test that fails for any other reason means a mistake in the change: fix the change.
- Windows: PowerShell, no `&&`, `npx.cmd`. Never run `expo lint`. No broad `sed`. Never `git stash`. `git add` explicit paths only. Do not start or stop a dev server. Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nothing is deployed and nothing is run against TikTok by any task.** Deployment is the owner's, from the README steps of Task 6.

## Task order

`1 → 2 → 3 → 4 → 5`, with `6 ∥ (3, 4)` (Task 6 touches only `AGENTS.md` and `supabase/README.md`; start it once Task 2 is merged). Task 5 (review) runs after 4 and 6.

| Task | Title | Depends on | Parallel-safe with |
|---|---|---|---|
| 1 | The draft PROOF (server + phone), then the server adapter's direct path | — | — |
| 2 | The `creator-info` function, `publishes` through `post-prepare`, `api.ts` | 1 | — |
| 3 | The phone's logic: `tiktokDirect.ts`, the client adapter, the form, the uploader's two sentences | 2 | 6 |
| 4 | The sheet, the creator hook, the screen wiring | 3 | 6 |
| 5 | Independent review and fixes | 4, 6 | — |
| 6 | Docs: AGENTS.md Posting line, README section 11, the deploy checklist | 2 | 3, 4 |

Checks for every task: `npm run typecheck`, `npm test`. Expected totals grow from the baseline; no existing test may disappear.

---

## Task 1: The draft PROOF, then the server adapter's direct path

**Files:**
- Create: `supabase/functions/_shared/__tests__/tiktok.draft.proof.test.ts`
- Create: `src/publish/__tests__/tiktokDraft.proof.test.ts`
- Create: `supabase/functions/_shared/__tests__/tiktok.direct.test.ts`
- Modify: `supabase/functions/_shared/types.ts` (add `TikTokPrivacy`, `CreatorInfo`; `PrepareResult.publishes?`; `ServerAdapter.creatorInfo?`)
- Modify: `supabase/functions/_shared/platforms/tiktok.ts`
- Modify (ONE pinned line): `supabase/functions/_shared/__tests__/tiktok.test.ts`: in "authUrl uses the web flow with comma-separated scopes" the expected `scope` becomes `"user.info.basic,video.upload,video.publish"`. Nothing else in that file.

**Interfaces:**
- Consumes: `ApiError`, `PlatformError` (`../errors.ts`); `AdapterCtx`, `PrepareInput`, `PrepareResult`, `PublishResult`, `ServerAdapter` (`../types.ts`).
- Produces (in `types.ts`):
  ```ts
  export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "FOLLOWER_OF_CREATOR" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  export interface CreatorInfo { nickname: string; username: string | null; avatarUrl: string | null; privacyOptions: TikTokPrivacy[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDurationSec: number }
  // PrepareResult gains:  /** The upload itself publishes: a lost last piece may already be a live post. */ publishes?: boolean
  // ServerAdapter gains:  /** What the account may post right now (TikTok Direct Post). `grant.scopes` is the stored scope string. */
  //                       creatorInfo?(ctx: AdapterCtx, accessToken: string, grant: { scopes: string }): Promise<CreatorInfo>;
  ```
- Produces (in `platforms/tiktok.ts`): `export const DIRECT_SCOPE = "video.publish"`, `export const TIKTOK_PRIVACY: readonly TikTokPrivacy[]` (order: `PUBLIC_TO_EVERYONE`, `FOLLOWER_OF_CREATOR`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY`), `export const TIKTOK_TITLE_MAX = 2200`, `export function scopeList(scopes: string): string[]`, `export function knownToLackDirect(scopes: string): boolean`, `export const NEEDS_PERMISSION: string`, and `tiktok.creatorInfo`. Direct `prepare` returns `{ protocol: "tiktok-chunks", uploadUrl, uploadHeaders: {}, chunkSize, ref: { publishId, direct: true }, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }, publishes: true }`.

### Steps

- [ ] **Step 1: Write the server PROOF** (`tiktok.draft.proof.test.ts`). It must pass against the UNTOUCHED code.

```ts
/**
 * PROOF: the TikTok draft (inbox) path as it was before Direct Post existed. Written against the untouched code and never edited
 * to make a change pass: a red test here means the change broke drafts.
 */
import { postPrepare } from "../handlers/postPrepare.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { saveTokens } from "../tokens.ts";
import type { AdapterCtx } from "../types.ts";
import { fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

type Call = { url: string; init: RequestInit };
function scripted(responses: Response[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" };
const env = { get: (n: string) => ENV[n] };
const ctxOf = (f: typeof fetch): AdapterCtx => ({ fetch: f, env, redirectUri: "https://ref.supabase.co/functions/v1/oauth-callback" });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const err = (code: string, message = "", status = 200) => new Response(JSON.stringify({ data: {}, error: { code, message, log_id: "l" } }), { status });
const URL_UP = "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x";
const inboxOk = () => ok({ data: { publish_id: "v_inbox_file~v2.1", upload_url: URL_UP }, error: { code: "ok", message: "" } });
const SIZE = 25 * 1024 * 1024;
const BODY = { source_info: { source: "FILE_UPLOAD", video_size: SIZE, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 } };
const RESULT = { protocol: "tiktok-chunks", uploadUrl: URL_UP, uploadHeaders: {}, chunkSize: 10 * 1024 * 1024, ref: { publishId: "v_inbox_file~v2.1" } };

test.each([
  [{}], [{ mode: "draft" }], [{ mode: "Direct" }], [{ mode: 1 }], [{ mode: null }], [{ privacy: "SELF_ONLY", allowComment: true }],
])("PROOF: options %j take the inbox route: one call, the same body, the same five keys", async (options) => {
  const s = scripted([inboxOk()]);
  const r = await tiktok.prepare(ctxOf(s.fetch), "at", { ...INPUT, fileSize: SIZE, caption: "A caption that drafts never send", options: options as Record<string, unknown> });
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  expect(s.calls[0].init.method).toBe("POST");
  expect(s.calls[0].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
  expect(JSON.parse(s.calls[0].init.body as string)).toEqual(BODY);
  expect(r).toEqual(RESULT);
  expect(Object.keys(r).sort()).toEqual(["chunkSize", "protocol", "ref", "uploadHeaders", "uploadUrl"]);
});

test.each([
  ["spam_risk_too_many_pending_share", "At most 5", 403, "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first.", "platform_error"],
  ["spam_risk_too_many_posts", "Too many posts", 403, "Too many posts", "platform_error"],
  ["spam_risk_user_banned_from_posting", "Banned", 403, "Banned", "platform_error"],
  ["reached_active_user_cap", "Cap", 403, "Cap", "platform_error"],
  ["unaudited_client_can_only_post_to_private_accounts", "Private only", 403, "Private only", "platform_error"],
  ["privacy_level_option_mismatch", "Mismatch", 400, "Mismatch", "platform_error"],
  ["invalid_param", "chunk_size is invalid", 400, "chunk_size is invalid", "platform_error"],
  ["rate_limit_exceeded", "", 429, "TikTok is busy — wait a minute, then try again.", "platform_unavailable"],
  ["internal_error", "", 500, "TikTok is having trouble — try again.", "platform_unavailable"],
  ["scope_not_authorized", "No scope", 401, "No scope", "platform_error"],
  ["access_token_invalid", "Bad token", 401, "Bad token", "platform_error"],
])("PROOF: a draft init that TikTok answers with %s (inside a 200) keeps its status, words and code", async (code, message, status, said, clipy) => {
  const s = scripted([err(code, message)]);
  await expect(tiktok.prepare(ctxOf(s.fetch), "at", INPUT)).rejects.toMatchObject({ platform: "tiktok", status, reason: code, message: said, code: clipy });
  expect(s.calls).toHaveLength(1);
});

test("PROOF: a draft's status and finalize answer and fail in the same words", async () => {
  const st = (status: string, extra = {}) => ok({ data: { status, ...extra }, error: { code: "ok", message: "" } });
  const ref = { publishId: "p1" };
  const fin = { ref, input: INPUT, clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } };
  const a = scripted([st("PROCESSING_UPLOAD")]);
  expect(await tiktok.finalize(ctxOf(a.fetch), "at", fin)).toEqual({ status: "processing" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
  expect(JSON.parse(a.calls[0].init.body as string)).toEqual({ publish_id: "p1" });
  expect(await tiktok.status(ctxOf(scripted([st("SEND_TO_USER_INBOX")]).fetch), "at", ref)).toEqual({ status: "done", url: null });
  expect(await tiktok.status(ctxOf(scripted([st("PUBLISH_COMPLETE", { publicaly_available_post_id: [7300000000000000000] })]).fetch), "at", ref)).toEqual({ status: "done", url: null });
  for (const reason of ["file_format_check_failed", "spam_risk_text", "spam_risk", "auth_removed", "spam_risk_too_many_posts"]) {
    await expect(tiktok.status(ctxOf(scripted([st("FAILED", { fail_reason: reason })]).fetch), "at", ref))
      .rejects.toMatchObject({ status: 400, code: "platform_error", reason, message: `TikTok couldn't use this video: ${reason}.` });
  }
  await expect(tiktok.status(ctxOf(scripted([st("FAILED", { fail_reason: "internal" })]).fetch), "at", ref)).rejects.toMatchObject({ message: "TikTok had a problem processing the video." });
});

async function connected(responses: Response[]) {
  const s = scripted(responses);
  const deps = fakeDeps({ env, fetch: s.fetch, adapters: { tiktok } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes: "user.info.basic,video.upload" }), { accountId: "o1", displayName: "Mo", avatarUrl: null });
  return { deps, calls: s.calls };
}
const REQUEST = { platform: "tiktok", fileSize: SIZE, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} };

test("PROOF: post-prepare for a draft answers with exactly the same keys and stores the same session", async () => {
  const { deps, calls } = await connected([inboxOk()]);
  const r = await postPrepare(deps, USER, REQUEST);
  expect(r).toEqual({ sessionId: expect.any(String), ...RESULT, ref: undefined });
  expect(Object.keys(r).sort()).toEqual(["chunkSize", "protocol", "sessionId", "uploadHeaders", "uploadUrl"]);
  expect(calls).toHaveLength(1);
  expect(calls[0].init.headers).toEqual({ Authorization: "Bearer access-1", "Content-Type": "application/json; charset=UTF-8" });
  expect(await deps.db.getSession(r.sessionId)).toMatchObject({ platform: "tiktok", status: "uploading", ref: { publishId: "v_inbox_file~v2.1" }, input: { caption: "Beach day", options: {} } });
});

test("PROOF: a draft refused for a missing permission is `reconnect` and flags the account", async () => {
  const { deps } = await connected([err("scope_not_authorized", "No scope", 401)]);
  await expect(postPrepare(deps, USER, REQUEST)).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBe(true);
});
```

Note on `toEqual({ sessionId: …, ...RESULT, ref: undefined })`: `toEqual` treats an `undefined` property as absent, so this says "RESULT without `ref`, plus a session id"; the next line pins the key list exactly.

- [ ] **Step 2: Write the phone PROOF** (`src/publish/__tests__/tiktokDraft.proof.test.ts`). It must pass against the UNTOUCHED code.

```ts
/**
 * PROOF: what the phone does for a TikTok draft, as it was before Direct Post existed. Written against the untouched code and
 * never edited to make a change pass.
 */
import { clientAdapters } from "../adapters";
import type { Prepared } from "../api";
import { IDLE_ROW, runPost, type PostDeps, type RowState } from "../runPost";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const NOTE = "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).";

test("PROOF: with no options the adapter is the draft adapter", () => {
  const tt = clientAdapters.tiktok!;
  expect(tt.captionMax).toBeNull();
  expect(tt.defaultOptions("Beach day")).toEqual({});
  expect(tt.validate(video, "x".repeat(10000), {})).toBeNull();
  expect(tt.validate({ ...video, durationSec: 601 }, "", {})).toBe("TikTok accepts videos up to 10 minutes.");
  expect(tt.validate({ ...video, fileSize: 4 * 1024 ** 3 + 1 }, "", {})).toBe("TikTok accepts videos up to 4 GB.");
  expect(tt.validate({ ...video, mimeType: "video/x-msvideo" }, "", {})).toBe("TikTok accepts MP4, MOV or WebM videos.");
  expect(tt.note(video)).toBe(NOTE);
  expect(tt.doneNote).toBe("Sent to TikTok — open TikTok to finish posting.");
});

test("PROOF: a draft is prepared with options {} and uploaded through the TikTok uploader with nothing new", async () => {
  const prepared: Prepared = { sessionId: "s1", protocol: "tiktok-chunks", uploadUrl: "https://up/x?t=1", uploadHeaders: {}, chunkSize: 4 };
  const reader = { size: 10, read: jest.fn(), close: jest.fn() };
  const deps: PostDeps = {
    api: { prepare: jest.fn(async () => prepared), uploadChunk: jest.fn(), finalize: jest.fn(async () => ({ status: "done" as const, url: null })), status: jest.fn() },
    openReader: jest.fn(() => reader), uploadGoogleResumable: jest.fn(), uploadRelay: jest.fn(), uploadTikTokChunks: jest.fn(async () => {}), uploadMetaWhole: jest.fn(),
    sleep: jest.fn(async () => {}),
  };
  let row: RowState = IDLE_ROW;
  await runPost({ platform: "tiktok", video, caption: "Beach day", options: {} }, deps, (p) => { row = { ...row, ...p }; }, new AbortController().signal);
  expect(deps.api.prepare).toHaveBeenCalledWith({ platform: "tiktok", fileSize: 10, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} });
  const [url, args] = (deps.uploadTikTokChunks as jest.Mock).mock.calls[0];
  expect(url).toBe("https://up/x?t=1");
  expect(Object.keys(args).sort()).toEqual(["chunkSize", "mimeType", "onProgress", "reader", "resume", "signal"]);
  expect(deps.api.finalize).toHaveBeenCalledWith("s1", null);
  expect(row).toMatchObject({ phase: "done", url: null, message: null });
});
```

- [ ] **Step 3: Run both PROOF files against the untouched tree.** `npx.cmd jest -c jest.server.config.js tiktok.draft.proof` and `npx.cmd jest tiktokDraft.proof`. Expected: both PASS. If one fails, the PROOF is wrong (it must describe today's code): fix the PROOF, not the code.

- [ ] **Step 4: Commit the PROOF alone.** `git add supabase/functions/_shared/__tests__/tiktok.draft.proof.test.ts src/publish/__tests__/tiktokDraft.proof.test.ts`, message `test(tiktok): PROOF of the draft path before Direct Post`.

- [ ] **Step 5: Write the failing direct tests** (`tiktok.direct.test.ts`).

```ts
import { ApiError, PlatformError } from "../errors.ts";
import { DIRECT_SCOPE, knownToLackDirect, NEEDS_PERMISSION, scopeList, tiktok, TIKTOK_PRIVACY, TIKTOK_TITLE_MAX } from "../platforms/tiktok.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

type Call = { url: string; init: RequestInit };
function ctx(responses: Response[]): { ctx: AdapterCtx; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as unknown as typeof fetch;
  const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" };
  return { ctx: { fetch: f, env: { get: (n) => ENV[n] }, redirectUri: "https://ref.supabase.co/functions/v1/oauth-callback" }, calls };
}
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok", message: "" } }), { status: 200 });
const err = (code: string, message = "", status = 200) => new Response(JSON.stringify({ data: {}, error: { code, message, log_id: "l" } }), { status });
const CREATOR = { creator_avatar_url: "https://p16.tiktokcdn.com/a.jpeg", creator_username: "sunny", creator_nickname: "Sunny", privacy_level_options: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 300 };
const creator = (over = {}) => ok({ ...CREATOR, ...over });
const INIT = () => ok({ publish_id: "v_pub_file~v2.9", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=9&upload_token=y" });
const OPTS = { mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false };
const input = (over: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => ({ ...INPUT, fileSize: 25 * 1024 * 1024, caption: "  Beach day #sun  ", ...over, options: { ...OPTS, ...options } });
const CREATOR_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";

test("the scope list and the shortcut", () => {
  expect(DIRECT_SCOPE).toBe("video.publish");
  expect(scopeList("user.info.basic,video.upload")).toEqual(["user.info.basic", "video.upload"]);
  expect(scopeList(" user.info.basic video.upload,, video.publish ")).toEqual(["user.info.basic", "video.upload", "video.publish"]);
  expect(knownToLackDirect("user.info.basic,video.upload")).toBe(true);
  expect(knownToLackDirect("user.info.basic,video.upload,video.publish")).toBe(false);
  // Unknown or unreadable: never a verdict.
  expect(knownToLackDirect("")).toBe(false);
  expect(knownToLackDirect("something-else")).toBe(false);
  expect(TIKTOK_PRIVACY).toEqual(["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]);
  expect(TIKTOK_TITLE_MAX).toBe(2200);
});

test("authUrl asks for the direct permission too", () => {
  expect(new URL(tiktok.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "" })).searchParams.get("scope")).toBe("user.info.basic,video.upload,video.publish");
});

describe("creatorInfo", () => {
  test("asks TikTok with no body and maps the answer", async () => {
    const a = ctx([creator()]);
    expect(await tiktok.creatorInfo!(a.ctx, "at", { scopes: "user.info.basic,video.upload,video.publish" })).toEqual({
      nickname: "Sunny", username: "sunny", avatarUrl: "https://p16.tiktokcdn.com/a.jpeg",
      privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 });
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].url).toBe(CREATOR_URL);
    expect(a.calls[0].init.method).toBe("POST");
    expect(a.calls[0].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
    expect(a.calls[0].init.body).toBeUndefined();
  });
  test("keeps only the four known privacy values, in the app's order; odd values fall back", async () => {
    const a = ctx([creator({ privacy_level_options: ["SELF_ONLY", "SOMETHING_NEW", "PUBLIC_TO_EVERYONE"], creator_nickname: "", creator_avatar_url: "http://insecure/a.jpg", max_video_post_duration_sec: "600", comment_disabled: "yes" })]);
    expect(await tiktok.creatorInfo!(a.ctx, "at", { scopes: "" })).toMatchObject({ nickname: "sunny", avatarUrl: null, privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], commentDisabled: false, maxDurationSec: 600 });
    const b = ctx([creator({ creator_nickname: null, creator_username: null })]);
    expect(await tiktok.creatorInfo!(b.ctx, "at", { scopes: "" })).toMatchObject({ nickname: "TikTok account", username: null });
  });
  test("no usable privacy list is a temporary failure, never an empty choice", async () => {
    await expect(tiktok.creatorInfo!(ctx([creator({ privacy_level_options: [] })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 502, code: "platform_unavailable", message: "TikTok did not say who can see the post." });
    await expect(tiktok.creatorInfo!(ctx([creator({ privacy_level_options: "SELF_ONLY" })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 502 });
  });
  test("a stored grant known to lack the permission answers without calling TikTok", async () => {
    const a = ctx([]);
    const e = await tiktok.creatorInfo!(a.ctx, "at", { scopes: "user.info.basic,video.upload" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
    expect(NEEDS_PERMISSION).toBe("Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options.");
    expect(a.calls).toHaveLength(0);
  });
  test.each([["scope_not_authorized", 401], ["scope_not_authorized", 200], ["scope_permission_missed", 400]])("TikTok's %s (HTTP %i) is needs_permission, not an auth error", async (code, status) => {
    const e = await tiktok.creatorInfo!(ctx([err(code, "x", status)]).ctx, "at", { scopes: "" }).catch((x: unknown) => x) as ApiError;
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
  });
  test("an invalid token is still an auth error (reconnect)", async () => {
    const e = await tiktok.creatorInfo!(ctx([err("access_token_invalid", "bad", 401)]).ctx, "at", { scopes: "" }).catch((x: unknown) => x) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(401);
    expect(tiktok.isAuthError!(e)).toBe(true);
  });
  test.each([
    ["spam_risk_too_many_posts", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["spam_risk_user_banned_from_posting", "TikTok has stopped this account from posting for now. Open TikTok to see why."],
    ["reached_active_user_cap", "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options."],
  ])("%s inside a 200 is a plain refusal", async (code, said) => {
    await expect(tiktok.creatorInfo!(ctx([err(code, "raw")]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 403, code: "platform_error", reason: code, message: said });
  });
  test("busy and failing are temporary, in today's words", async () => {
    await expect(tiktok.creatorInfo!(ctx([err("rate_limit_exceeded", "", 429)]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ code: "platform_unavailable", message: "TikTok is busy — wait a minute, then try again." });
    await expect(tiktok.creatorInfo!(ctx([new Response("down", { status: 503 })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ code: "platform_unavailable", message: "TikTok is having trouble — try again." });
  });
});

describe("prepare, direct", () => {
  test("asks the creator FIRST, then opens the post with the caption as its title", async () => {
    const a = ctx([creator(), INIT()]);
    const r = await tiktok.prepare(a.ctx, "at", input());
    expect(a.calls.map((c) => c.url)).toEqual([CREATOR_URL, INIT_URL]);
    expect(a.calls[1].init.method).toBe("POST");
    expect(a.calls[1].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
    expect(JSON.parse(a.calls[1].init.body as string)).toEqual({
      post_info: { title: "Beach day #sun", privacy_level: "SELF_ONLY", disable_duet: true, disable_comment: false, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false },
      source_info: { source: "FILE_UPLOAD", video_size: 25 * 1024 * 1024, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 },
    });
    expect(r).toEqual({ protocol: "tiktok-chunks", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=9&upload_token=y", uploadHeaders: {}, chunkSize: 10 * 1024 * 1024,
      ref: { publishId: "v_pub_file~v2.9", direct: true }, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }, publishes: true });
  });
  test("an empty caption sends no title; the brand toggles pass through", async () => {
    const a = ctx([creator({ privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], duet_disabled: false, stitch_disabled: false }), INIT()]);
    await tiktok.prepare(a.ctx, "at", input({ caption: "   " }, { privacy: "PUBLIC_TO_EVERYONE", allowDuet: true, allowStitch: true, allowComment: false, brandOrganic: true, brandContent: true }));
    expect(JSON.parse(a.calls[1].init.body as string).post_info).toEqual({ privacy_level: "PUBLIC_TO_EVERYONE", disable_duet: false, disable_comment: true, disable_stitch: false, brand_content_toggle: true, brand_organic_toggle: true });
  });
  test.each([
    [{ privacy: undefined }], [{ privacy: "EVERYONE" }], [{ allowComment: "yes" }], [{ allowDuet: undefined }], [{ allowStitch: 1 }], [{ brandOrganic: null }], [{ brandContent: undefined }],
  ])("options of the wrong shape %j are refused before any call", async (bad) => {
    const a = ctx([]);
    await expect(tiktok.prepare(a.ctx, "at", input({}, bad))).rejects.toMatchObject({ status: 400, code: "bad_request", message: "The TikTok options are incomplete." });
    expect(a.calls).toHaveLength(0);
  });
  test("a caption over the limit is refused before any call, never cut", async () => {
    const a = ctx([]);
    await expect(tiktok.prepare(a.ctx, "at", input({ caption: "x".repeat(2201) }))).rejects.toMatchObject({ status: 400, code: "options_refused", message: "TikTok captions can be up to 2200 characters." });
    expect(a.calls).toHaveLength(0);
    const b = ctx([creator(), INIT()]);
    await tiktok.prepare(b.ctx, "at", input({ caption: "x".repeat(2200) }));
    expect(b.calls).toHaveLength(2);
  });
  const PRIVACY_GONE = "TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again.";
  test.each([
    ["a privacy the creator is not offered", {}, { privacy: "PUBLIC_TO_EVERYONE" }, {}, PRIVACY_GONE],
    ["branded content with Only me", {}, { brandContent: true }, {}, "Branded content visibility cannot be set to private."],
    ["comments allowed but turned off", { comment_disabled: true }, {}, {}, "Comments are turned off in your TikTok settings. Open the TikTok options and try again."],
    ["duet allowed but turned off", {}, { allowDuet: true }, {}, "Duet is turned off in your TikTok settings. Open the TikTok options and try again."],
    ["stitch allowed but turned off", {}, { allowStitch: true }, {}, "Stitch is turned off in your TikTok settings. Open the TikTok options and try again."],
    ["a video longer than this creator may post", {}, {}, { durationSec: 301 }, "This TikTok account can post videos up to 5 minutes."],
    ["a video longer than an odd limit", { max_video_post_duration_sec: 90 }, {}, { durationSec: 91 }, "This TikTok account can post videos up to 90 seconds."],
    ["a video longer than one minute", { max_video_post_duration_sec: 60 }, {}, { durationSec: 61 }, "This TikTok account can post videos up to 1 minute."],
  ])("refused against the FRESH creator info: %s — and nothing is opened", async (_n, creatorOver, options, inputOver, said) => {
    const a = ctx([creator(creatorOver)]);
    const e = await tiktok.prepare(a.ctx, "at", input(inputOver, options)).catch((x: unknown) => x) as ApiError;
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 400, code: "options_refused", message: said });
    expect(a.calls.map((c) => c.url)).toEqual([CREATOR_URL]);
  });
  test("exactly at the creator's limit is allowed", async () => {
    const a = ctx([creator(), INIT()]);
    await tiktok.prepare(a.ctx, "at", input({ durationSec: 300 }));
    expect(a.calls).toHaveLength(2);
  });
  test.each([
    ["unaudited_client_can_only_post_to_private_accounts", 403, "platform_error", "TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options."],
    ["privacy_level_option_mismatch", 403, "platform_error", PRIVACY_GONE],
    ["spam_risk_too_many_posts", 403, "platform_error", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["reached_active_user_cap", 403, "platform_error", "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options."],
    ["rate_limit_exceeded", 429, "platform_unavailable", "TikTok is busy — wait a minute, then try again."],
    ["invalid_param", 400, "platform_error", "title is too long"],
  ])("init refused with %s, inside a 200 or with its own status", async (code, status, clipy, said) => {
    for (const http of [200, status]) {
      await expect(tiktok.prepare(ctx([creator(), err(code, "title is too long", http)]).ctx, "at", input())).rejects.toMatchObject({ status, code: clipy, reason: code, message: said });
    }
  });
  test("a missing permission at either call is needs_permission and is never an auth error", async () => {
    for (const responses of [[err("scope_not_authorized", "x", 401)], [creator(), err("scope_not_authorized", "x", 401)]]) {
      const e = await tiktok.prepare(ctx(responses).ctx, "at", input()).catch((x: unknown) => x) as ApiError;
      expect(e).not.toBeInstanceOf(PlatformError);
      expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
    }
  });
  test("no upload address is a failure", async () => {
    await expect(tiktok.prepare(ctx([creator(), ok({})]).ctx, "at", input())).rejects.toMatchObject({ message: "TikTok did not return an upload address." });
  });
});

describe("status, direct", () => {
  const ref = { publishId: "p9", direct: true };
  const st = (status: string, extra = {}) => ok({ status, ...extra });
  test("processing, then done without a link", async () => {
    expect(await tiktok.status(ctx([st("PROCESSING_UPLOAD")]).ctx, "at", ref)).toEqual({ status: "processing" });
    expect(await tiktok.status(ctx([st("PUBLISH_COMPLETE", { publicaly_available_post_id: [] })]).ctx, "at", ref)).toEqual({ status: "done", url: null });
    expect(await tiktok.finalize(ctx([st("PUBLISH_COMPLETE")]).ctx, "at", { ref, input: input(), clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } })).toEqual({ status: "done", url: null });
  });
  test.each([
    ["spam_risk_text", "TikTok refused the caption. Change it and post again."],
    ["spam_risk", "TikTok refused this post."],
    ["spam_risk_too_many_posts", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["spam_risk_user_banned_from_posting", "TikTok has stopped this account from posting for now. Open TikTok to see why."],
    ["auth_removed", "TikTok access was removed while posting. Reconnect TikTok and post again."],
    ["internal", "TikTok had a problem processing the video."],
    ["frame_rate_check_failed", "TikTok couldn't use this video: frame_rate_check_failed."],
  ])("FAILED with %s is final, in plain words", async (reason, said) => {
    await expect(tiktok.status(ctx([st("FAILED", { fail_reason: reason })]).ctx, "at", ref)).rejects.toMatchObject({ status: 400, code: "platform_error", reason, message: said });
  });
});
```

- [ ] **Step 6: Run it.** `npx.cmd jest -c jest.server.config.js tiktok.direct`. Expected: FAIL (the imports `DIRECT_SCOPE`, `knownToLackDirect`, … do not exist).

- [ ] **Step 7: `types.ts`.** Add the two types and the two optional members exactly as in **Produces** above. `PrepareResult` becomes `{ …; wait?: WaitHint; publishes?: boolean }` with the doc comment; `ServerAdapter` gains `creatorInfo?` after `status`.

- [ ] **Step 8: `platforms/tiktok.ts`.** Apply these edits and no others.

Replace the imports and the `SCOPES` constant:

```ts
import { ApiError, PlatformError } from "../errors.ts";
import type { AdapterCtx, CreatorInfo, PrepareInput, PrepareResult, PublishResult, ServerAdapter, TikTokPrivacy, Tokens } from "../types.ts";
import { FORM, formBody } from "./http.ts";

const API = "https://open.tiktokapis.com";
/**
 * `video.upload` sends a draft to the inbox; `video.publish` is Direct Post ("Post now") and creator info. An account connected
 * before `video.publish` was asked for keeps working for drafts. Comma-separated, as TikTok requires.
 */
const SCOPES = "user.info.basic,video.upload,video.publish";
export const DIRECT_SCOPE = "video.publish";
const DRAFT_SCOPE = "video.upload";
/** The stored grant as a list: TikTok separates with commas; white space is accepted too. */
export const scopeList = (scopes: string): string[] => scopes.split(/[\s,]+/).filter(Boolean);
/** True only when the stored grant is readable (it names the draft permission) and does not name the direct one. Anything else: ask TikTok. */
export const knownToLackDirect = (scopes: string): boolean => { const l = scopeList(scopes); return l.includes(DRAFT_SCOPE) && !l.includes(DIRECT_SCOPE); };
/** The order "Who can see it" is offered in. */
export const TIKTOK_PRIVACY: readonly TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
export const TIKTOK_TITLE_MAX = 2200;
/** TikTok's API ceiling, used when a creator's own limit is not sent. */
const API_MAX_DURATION_SEC = 600;
export const NEEDS_PERMISSION = "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options.";
/** Not a PlatformError and not a 401: the account is healthy for drafts, so it must never be flagged for a reconnect. */
const needsPermission = () => new ApiError(403, "needs_permission", NEEDS_PERMISSION);
const refuse = (message: string) => new ApiError(400, "options_refused", message);
```

After the existing `FRIENDLY` table add (the existing `CODE_STATUS` and `FRIENDLY` are NOT edited):

```ts
/** Direct Post only. The draft path keeps `CODE_STATUS` and `FRIENDLY` exactly as they are. */
const DIRECT_STATUS: Record<string, number> = { ...CODE_STATUS, privacy_level_option_mismatch: 403 };
const TOO_MANY = "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok.";
const BANNED = "TikTok has stopped this account from posting for now. Open TikTok to see why.";
const PRIVACY_GONE = "TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again.";
const DIRECT_FRIENDLY: Record<string, string> = {
  ...FRIENDLY,
  unaudited_client_can_only_post_to_private_accounts: "TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options.",
  spam_risk_too_many_posts: TOO_MANY,
  spam_risk_user_banned_from_posting: BANNED,
  reached_active_user_cap: "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options.",
  privacy_level_option_mismatch: PRIVACY_GONE,
};
/** A direct post's final failures in plain words; a reason not listed keeps the draft's sentence. */
const DIRECT_FAILED: Record<string, string> = {
  spam_risk_text: "TikTok refused the caption. Change it and post again.",
  spam_risk: "TikTok refused this post.",
  spam_risk_too_many_posts: TOO_MANY,
  spam_risk_user_banned_from_posting: BANNED,
  auth_removed: "TikTok access was removed while posting. Reconnect TikTok and post again.",
};
/** On a direct call these mean "the grant has no video.publish": the account still posts drafts. */
const DIRECT_SCOPE_CODES = ["scope_not_authorized", "scope_permission_missed"];
```

Give `fail` a fourth parameter with today's table as its default (existing callers are unchanged):

```ts
function fail(status: number, code: string, message: string, friendly: Record<string, string> = FRIENDLY): never {
  const e = new PlatformError("tiktok", status, friendly[code] ?? (message || (code.startsWith("http_5") ? BUSY : code)));
  e.reason = code;
  throw e;
}
```

Give `apiJson` a second parameter, default `false` (existing callers are unchanged; with `false` every expression is today's):

```ts
async function apiJson(res: Response, direct = false): Promise<Record<string, unknown>> {
  const b = await body(res);
  const err = (typeof b.error === "object" && b.error !== null ? b.error : {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : res.ok ? "ok" : `http_${res.status}`;
  if (!res.ok || code !== "ok") {
    if (direct && DIRECT_SCOPE_CODES.includes(code)) throw needsPermission();
    fail(res.ok ? ((direct ? DIRECT_STATUS : CODE_STATUS)[code] ?? 400) : res.status, code, typeof err.message === "string" ? err.message : "", direct ? DIRECT_FRIENDLY : FRIENDLY);
  }
  return (typeof b.data === "object" && b.data !== null ? b.data : {}) as Record<string, unknown>;
}
```

In `fetchStatus` change ONLY the `FAILED` message expression (a `ref` without `direct: true` evaluates exactly today's expression):

```ts
    const plain = ref.direct === true ? DIRECT_FAILED[reason] : undefined;
    const e = new PlatformError("tiktok", 400, plain ?? (reason === "internal" ? "TikTok had a problem processing the video." : `TikTok couldn't use this video: ${reason}.`));
```

Before `export const tiktok` add:

```ts
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** Asked fresh every time (TikTok's avatar address lives 2 hours and the options can change): nothing here is cached. */
async function queryCreator(c: AdapterCtx, accessToken: string): Promise<CreatorInfo> {
  const d = await apiJson(await c.fetch(`${API}/v2/post/publish/creator_info/query/`, { method: "POST", headers: authed(accessToken) }), true);
  const offered = Array.isArray(d.privacy_level_options) ? (d.privacy_level_options as unknown[]) : [];
  const privacyOptions = TIKTOK_PRIVACY.filter((p) => offered.includes(p));
  if (privacyOptions.length === 0) throw new PlatformError("tiktok", 502, "TikTok did not say who can see the post.");
  const max = d.max_video_post_duration_sec;
  const avatar = text(d.creator_avatar_url);
  return {
    nickname: text(d.creator_nickname) ?? text(d.creator_username) ?? "TikTok account", username: text(d.creator_username),
    avatarUrl: avatar && avatar.startsWith("https://") ? avatar : null, privacyOptions,
    commentDisabled: d.comment_disabled === true, duetDisabled: d.duet_disabled === true, stitchDisabled: d.stitch_disabled === true,
    maxDurationSec: typeof max === "number" && Number.isFinite(max) && max > 0 ? max : API_MAX_DURATION_SEC,
  };
}

interface DirectOptions { privacy: TikTokPrivacy; allowComment: boolean; allowDuet: boolean; allowStitch: boolean; brandOrganic: boolean; brandContent: boolean }
const SWITCHES = ["allowComment", "allowDuet", "allowStitch", "brandOrganic", "brandContent"] as const;
function directOptions(o: Record<string, unknown>): DirectOptions {
  if (!TIKTOK_PRIVACY.includes(o.privacy as TikTokPrivacy) || !SWITCHES.every((k) => typeof o[k] === "boolean")) throw new ApiError(400, "bad_request", "The TikTok options are incomplete.");
  return o as unknown as DirectOptions;
}
const lengthWords = (sec: number) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60} ${sec === 60 ? "minute" : "minutes"}` : `${Math.floor(sec)} seconds`);
const turnedOff = (what: string, verb: "are" | "is") => `${what} ${verb} turned off in your TikTok settings. Open the TikTok options and try again.`;

/**
 * Direct Post ("Post now"). The phone is never trusted: the creator is asked again here and every option is checked against that
 * answer before the post is opened. A refusal opens nothing. `video/init` is called once and never repeated.
 */
async function prepareDirect(c: AdapterCtx, accessToken: string, input: PrepareInput): Promise<PrepareResult> {
  const o = directOptions(input.options);
  if (input.caption.length > TIKTOK_TITLE_MAX) throw refuse(`TikTok captions can be up to ${TIKTOK_TITLE_MAX} characters.`);
  const info = await queryCreator(c, accessToken);
  if (!info.privacyOptions.includes(o.privacy)) throw refuse(PRIVACY_GONE);
  if (o.brandContent && o.privacy === "SELF_ONLY") throw refuse("Branded content visibility cannot be set to private.");
  if (o.allowComment && info.commentDisabled) throw refuse(turnedOff("Comments", "are"));
  if (o.allowDuet && info.duetDisabled) throw refuse(turnedOff("Duet", "is"));
  if (o.allowStitch && info.stitchDisabled) throw refuse(turnedOff("Stitch", "is"));
  if (input.durationSec > info.maxDurationSec) throw refuse(`This TikTok account can post videos up to ${lengthWords(info.maxDurationSec)}.`);
  const plan = chunkPlan(input.fileSize);
  const title = input.caption.trim();
  const data = await apiJson(await c.fetch(`${API}/v2/post/publish/video/init/`, {
    method: "POST", headers: authed(accessToken),
    body: JSON.stringify({
      post_info: { ...(title ? { title } : {}), privacy_level: o.privacy, disable_duet: !o.allowDuet, disable_comment: !o.allowComment, disable_stitch: !o.allowStitch, brand_content_toggle: o.brandContent, brand_organic_toggle: o.brandOrganic },
      source_info: { source: "FILE_UPLOAD", video_size: input.fileSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount },
    }),
  }), true);
  if (typeof data.upload_url !== "string" || !data.upload_url || typeof data.publish_id !== "string" || !data.publish_id) throw new PlatformError("tiktok", 502, "TikTok did not return an upload address.");
  // The same pre-signed chunk upload as a draft. Once the last piece is in, TikTok posts by itself: `publishes` tells the phone that a lost last piece may be a live post.
  return { protocol: "tiktok-chunks", uploadUrl: data.upload_url, uploadHeaders: {}, chunkSize: plan.chunkSize, ref: { publishId: data.publish_id, direct: true },
    wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }, publishes: true };
}
```

In the adapter object: the FIRST line of `prepare` becomes the switch, and `creatorInfo` is added after `status`. The rest of `prepare` is untouched.

```ts
  async prepare(c, accessToken, input) {
    // Only this exact value posts directly; everything else is the draft below, unchanged.
    if (input.options.mode === "direct") return prepareDirect(c, accessToken, input);
    const plan = chunkPlan(input.fileSize);
    // … the existing body, not edited …
  },
```

```ts
  async creatorInfo(c, accessToken, grant) {
    if (knownToLackDirect(grant.scopes)) throw needsPermission();
    return queryCreator(c, accessToken);
  },
```

Also update the adapter file's old comment above `SCOPES` (it said Direct Post waits for the audit) — it is replaced by the comment given above.

- [ ] **Step 9: Update the ONE pinned line** in `tiktok.test.ts` (`scope: "user.info.basic,video.upload,video.publish"`).

- [ ] **Step 10: Run.** `npm run test:server` — all green, including `tiktok.draft.proof` unedited. `npm run typecheck`. `npm test`.

- [ ] **Step 11: Commit.** `git add supabase/functions/_shared/types.ts supabase/functions/_shared/platforms/tiktok.ts supabase/functions/_shared/__tests__/tiktok.direct.test.ts supabase/functions/_shared/__tests__/tiktok.test.ts`, message `feat(tiktok): the server's Direct Post path — creator info, checks against it, init, plain errors`.

---

## Task 2: The `creator-info` function, `publishes` through `post-prepare`, `api.ts`

**Files:**
- Create: `supabase/functions/_shared/handlers/creatorInfo.ts`
- Create: `supabase/functions/creator-info/index.ts`
- Create: `supabase/functions/_shared/__tests__/creatorInfo.test.ts`
- Modify: `supabase/functions/_shared/handlers/postPrepare.ts` (`PrepareResponse.publishes?`, one spread)
- Modify: `supabase/functions/_shared/__tests__/post.test.ts` (ADD tests at the end; edit none)
- Modify: `src/publish/api.ts` (`TikTokPrivacy`, `CreatorInfo`, `Prepared.publishes?`, `api.creatorInfo`)
- Modify: `src/publish/__tests__/api.test.ts` (ADD one test)

**Interfaces:**
- Consumes: `CreatorInfo`, `ServerAdapter.creatorInfo?`, `PrepareResult.publishes?` (Task 1); `accessTokenFor`, `withPlatformAuth` (`tokens.ts`); `availableAdapter`, `adapterCtx`, `isPlatformId` (`types.ts`); `serveJson` (`runtime.ts`).
- Produces (server): `export async function creatorInfo(deps: Deps, userId: string, body: unknown): Promise<CreatorInfo>`; the function `creator-info` (`POST`, JSON `{ platform }`, signed-in); `PrepareResponse.publishes?: boolean` (present only when true).
- Produces (phone, in `src/publish/api.ts`):
  ```ts
  export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "FOLLOWER_OF_CREATOR" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  export interface CreatorInfo { nickname: string; username: string | null; avatarUrl: string | null; privacyOptions: TikTokPrivacy[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDurationSec: number }
  // Prepared gains:  /** The upload itself publishes (TikTok Post now): a lost last piece may already be a live post. */ publishes?: boolean;
  // api gains:       creatorInfo: (platform: PlatformId) => call<CreatorInfo>("creator-info", { json: { platform } }),
  ```
  A failure is an `ApiFailure` whose `code` is the server's (`needs_permission`, `reconnect`, `not_connected`, `platform_error`, `platform_unavailable`, `unreachable`, …).

### Steps

- [ ] **Step 1: Write the failing handler test** (`creatorInfo.test.ts`).

```ts
import { ApiError, PlatformError } from "../errors.ts";
import { creatorInfo } from "../handlers/creatorInfo.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { saveTokens } from "../tokens.ts";
import type { CreatorInfo } from "../types.ts";
import { fakeAdapter, fakeDeps, tokens, USER } from "./fakes.ts";

const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "secret" };
const env = { get: (n: string) => ENV[n] };
const INFO: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const profile = { accountId: "o1", displayName: "Mo", avatarUrl: null };
const fakeTikTok = (creator: jest.Mock) => fakeAdapter({ id: "tiktok", secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], creatorInfo: creator, isAuthError: tiktok.isAuthError });
async function connected(creator: jest.Mock, scopes = "user.info.basic,video.upload,video.publish") {
  const deps = fakeDeps({ env, adapters: { tiktok: fakeTikTok(creator), youtube: fakeAdapter() } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes }), profile);
  return deps;
}

test("asks the adapter with the user's token and the stored scopes, and returns its answer as it is", async () => {
  const creator = jest.fn(async () => INFO);
  const deps = await connected(creator);
  expect(await creatorInfo(deps, USER, { platform: "tiktok" })).toEqual(INFO);
  expect(creator).toHaveBeenCalledWith(expect.anything(), "access-1", { scopes: "user.info.basic,video.upload,video.publish" });
});

test.each([[null], [{}], [{ platform: "myspace" }], [{ platform: 5 }]])("an unknown platform %j is a bad request", async (body) => {
  await expect(creatorInfo(await connected(jest.fn()), USER, body)).rejects.toMatchObject({ status: 400, code: "bad_request" });
});

test("a platform without posting details is a bad request; one that is not set up is unavailable; not connected says so", async () => {
  const deps = await connected(jest.fn());
  await expect(creatorInfo(deps, USER, { platform: "youtube" })).rejects.toMatchObject({ status: 400, code: "bad_request", message: "This platform has no posting details." });
  await expect(creatorInfo(fakeDeps({ adapters: { tiktok: fakeTikTok(jest.fn()) } }), USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 409, code: "unavailable" });
  await expect(creatorInfo(fakeDeps({ env, adapters: { tiktok: fakeTikTok(jest.fn()) } }), USER, { platform: "tiktok" })).rejects.toMatchObject({ code: "not_connected" });
});

test("needs_permission passes through and the account is NOT flagged: drafts keep working", async () => {
  const deps = await connected(jest.fn(async () => { throw new ApiError(403, "needs_permission", "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options."); }));
  await expect(creatorInfo(deps, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 403, code: "needs_permission" });
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});

test("an invalid token is reconnect and flags the account; a plain refusal does neither", async () => {
  const bad = Object.assign(new PlatformError("tiktok", 401, "bad"), { reason: "access_token_invalid" });
  const a = await connected(jest.fn(async () => { throw bad; }));
  await expect(creatorInfo(a, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await a.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBe(true);
  const cap = Object.assign(new PlatformError("tiktok", 403, "Cap"), { reason: "reached_active_user_cap" });
  const b = await connected(jest.fn(async () => { throw cap; }));
  await expect(creatorInfo(b, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 403, code: "platform_error", message: "Cap" });
  expect((await b.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});

test("end to end with the real adapter: an old grant is told to reconnect without a call to TikTok", async () => {
  const fetchFake = jest.fn();
  const deps = fakeDeps({ env, fetch: fetchFake as unknown as typeof fetch, adapters: { tiktok } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes: "user.info.basic,video.upload" }), profile);
  await expect(creatorInfo(deps, USER, { platform: "tiktok" })).rejects.toMatchObject({ code: "needs_permission" });
  expect(fetchFake).not.toHaveBeenCalled();
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});
```

- [ ] **Step 2: Run.** `npx.cmd jest -c jest.server.config.js creatorInfo`. Expected: FAIL (no `../handlers/creatorInfo.ts`).

- [ ] **Step 3: The handler** (`handlers/creatorInfo.ts`).

```ts
import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, availableAdapter, isPlatformId, type CreatorInfo, type Deps } from "../types.ts";

/**
 * What the connected account may post right now (TikTok "Post now": its name and picture, who may see a post, which interactions are
 * off, the longest video). Read fresh from the platform on every call and never stored. Nothing is posted by this.
 */
export async function creatorInfo(deps: Deps, userId: string, body: unknown): Promise<CreatorInfo> {
  const platform = (body as { platform?: unknown } | null)?.platform;
  if (!isPlatformId(platform)) throw new ApiError(400, "bad_request", "Unknown platform.");
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const ask = adapter.creatorInfo;
  if (!ask) throw new ApiError(400, "bad_request", "This platform has no posting details.");
  const { accessToken, account } = await accessTokenFor(deps, userId, platform);
  // A missing permission arrives as a plain ApiError (`needs_permission`), which withPlatformAuth passes on without flagging the account.
  return withPlatformAuth(deps, account, () => ask.call(adapter, adapterCtx(deps), accessToken, { scopes: account.scopes }));
}
```

- [ ] **Step 4: The entry point** (`supabase/functions/creator-info/index.ts`), the same three lines as `post-status/index.ts`:

```ts
import { creatorInfo } from "../_shared/handlers/creatorInfo.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => creatorInfo(deps, user, body));
```

`supabase/config.toml` is NOT edited: the function needs a signed-in user like the others.

- [ ] **Step 5: `publishes` through `post-prepare`.** Add to the end of `post.test.ts` (edit nothing above):

```ts
test("prepare passes the adapter's `publishes` through only when it is true", async () => {
  const yes = await connected({ adapters: { youtube: fakeAdapter({ prepare: jest.fn(async () => ({ protocol: "tiktok-chunks" as const, uploadUrl: "https://up.test/x", uploadHeaders: {}, chunkSize: 1, ref: {}, publishes: true })) }) } });
  expect((await postPrepare(yes, USER, body)).publishes).toBe(true);
  expect("publishes" in (await postPrepare(await connected(), USER, body))).toBe(false);
  const no = await connected({ adapters: { youtube: fakeAdapter({ prepare: jest.fn(async () => ({ protocol: "tiktok-chunks" as const, uploadUrl: "https://up.test/x", uploadHeaders: {}, chunkSize: 1, ref: {}, publishes: false })) }) } });
  expect("publishes" in (await postPrepare(no, USER, body))).toBe(false);
});
```

Run it (FAIL), then in `postPrepare.ts`: `PrepareResponse` gains `publishes?: boolean`, and the return's last spread becomes `...(p.wait ? { wait: p.wait } : {}), ...(p.publishes === true ? { publishes: true } : {}) };`. Nothing else in the file changes.

- [ ] **Step 6: `api.ts`.** Add the two exported types and `Prepared.publishes?` exactly as in **Produces**, and the `creatorInfo` member after `oauthStart`. Add to `api.test.ts`:

```ts
test("creatorInfo posts the platform to creator-info; a refusal keeps the server's code", async () => {
  const info = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
  fetchMock.mockResolvedValue(res(200, info));
  expect(await api.creatorInfo("tiktok")).toEqual(info);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://ref.supabase.co/functions/v1/creator-info");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ platform: "tiktok" });
  fetchMock.mockResolvedValue(res(403, { code: "needs_permission", message: "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options." }));
  await expect(api.creatorInfo("tiktok")).rejects.toMatchObject({ code: "needs_permission" });
  await expect(api.creatorInfo("tiktok")).rejects.toBeInstanceOf(ApiFailure);
});
```

- [ ] **Step 7: Run.** `npm run typecheck`, `npm test` (both PROOF files green and unedited).

- [ ] **Step 8: Commit.** `git add supabase/functions/_shared/handlers/creatorInfo.ts supabase/functions/creator-info/index.ts supabase/functions/_shared/__tests__/creatorInfo.test.ts supabase/functions/_shared/handlers/postPrepare.ts supabase/functions/_shared/__tests__/post.test.ts src/publish/api.ts src/publish/__tests__/api.test.ts`, message `feat(tiktok): the creator-info function and its client call`.

---

## Task 3: The phone's logic

**Files:**
- Create: `src/publish/tiktokDirect.ts`
- Create: `src/publish/__tests__/tiktokDirect.test.ts`
- Modify: `src/publish/adapters/types.ts` (four optional hooks)
- Modify: `src/publish/adapters/tiktok.ts`
- Modify: `src/publish/usePostForm.ts`
- Modify: `src/publish/components/PostRow.tsx` (ONE expression: the done note)
- Modify: `src/publish/upload.ts` (`UploadArgs.publishes?`, two sentences)
- Modify: `src/publish/runPost.ts` (ONE expression: the uploader's args)
- Modify (ADD tests only): `src/publish/__tests__/upload.test.ts`, `src/publish/__tests__/runPost.test.ts`
- Modify (pinned lines): `src/publish/__tests__/adapters.test.ts` — in "tiktok: no caption, no options, …" `expect(tt.hasOptions).toBe(false)` becomes `toBe(true)` (rename the test "tiktok as a draft: no caption, its limits, the inbox note and the done note"); `src/publish/__tests__/PostScreen.test.tsx` — in "TikTok is ticked by default with its note and has no options button" the line `expect(screen.queryByRole("button", { name: "TikTok options" })).toBeNull();` becomes `expect(screen.getByRole("button", { name: "TikTok options" })).toBeTruthy();` and the test is renamed "TikTok is ticked by default as a draft, with its note and an options button". No other line of either file.

**Interfaces:**
- Consumes: `CreatorInfo`, `TikTokPrivacy`, `Prepared.publishes` (`src/publish/api.ts`, Task 2).
- Produces (`src/publish/adapters/types.ts`, all optional, added to `ClientAdapter`):
  ```ts
  /** The caption limit for these options (a platform whose limit depends on a choice); when absent, `captionMax`. */
  captionLimit?(options: Record<string, unknown>): number | null;
  /** What is sent to the server for these options; when absent, the options as they are. */
  sendOptions?(options: Record<string, unknown>): Record<string, unknown>;
  /** The standing note for these options; when absent, `note(video)`. */
  noteFor?(video: VideoInfo, options: Record<string, unknown>): string | null;
  /** The done note for these options; when absent, `doneNote`. */
  doneNoteFor?(options: Record<string, unknown>): string | undefined;
  ```
- Produces (`src/publish/tiktokDirect.ts`): everything in Step 3 — `isDirect`, `readDirect`, `DirectOptions`, `sendDirect`, `reconcile`, `directBlocker`, `directNote`, `consentLine`, `labelLine`, `PRIVACY_LABEL`, `TITLE_MAX`, and the sentence constants. Task 4 imports them by these names.
- Produces (`upload.ts`): `UploadArgs.publishes?: boolean`.

### Steps

- [ ] **Step 1: Write the failing test** (`tiktokDirect.test.ts`).

```ts
import { clientAdapters } from "../adapters";
import type { CreatorInfo } from "../api";
import { BRAND_PICK, BRANDED_PRIVATE, CHOOSE_PRIVACY, consentLine, DIRECT_DONE, DIRECT_NOT_READY, directBlocker, directNote, isDirect, labelLine, OPEN_OPTIONS, PRIVACY_LABEL, readDirect, reconcile, sendDirect, TITLE_MAX } from "../tiktokDirect";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const creator: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const ready = { mode: "direct", privacy: "SELF_ONLY", creator };
const tt = clientAdapters.tiktok!;
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";

test("only the exact mode is direct; a read fills every default with OFF and nothing chosen", () => {
  expect(isDirect({})).toBe(false);
  expect(isDirect({ mode: "draft" })).toBe(false);
  expect(isDirect({ mode: "direct" })).toBe(true);
  expect(readDirect({ mode: "direct" })).toEqual({ mode: "direct", privacy: null, allowComment: false, allowDuet: false, allowStitch: false, brand: false, brandOrganic: false, brandContent: false, creator: null });
  expect(readDirect({ mode: "direct", privacy: "EVERYONE", allowComment: "yes", creator: "x" })).toMatchObject({ privacy: null, allowComment: false, creator: null });
  expect(TITLE_MAX).toBe(2200);
  expect(PRIVACY_LABEL).toEqual({ PUBLIC_TO_EVERYONE: "Everyone", FOLLOWER_OF_CREATOR: "Followers", MUTUAL_FOLLOW_FRIENDS: "Friends", SELF_ONLY: "Only me" });
});

test("what is sent: the seven keys, never the creator or the brand switch; the brand boxes count only while the switch is on", () => {
  const o = readDirect({ ...ready, allowComment: true, brand: false, brandOrganic: true, brandContent: true });
  expect(sendDirect(o)).toEqual({ mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false });
  expect(sendDirect(readDirect({ ...ready, privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true }))).toMatchObject({ brandOrganic: true, brandContent: false });
});

test("the blockers, in order", () => {
  const b = (o: Record<string, unknown>, v = video) => directBlocker(v, readDirect({ mode: "direct", ...o }));
  expect(b({})).toBe(OPEN_OPTIONS);
  expect(OPEN_OPTIONS).toBe("Open the TikTok options to finish setting up Post now.");
  expect(b({ creator }, { ...video, durationSec: 301 })).toBe("This TikTok account can post videos up to 5 minutes.");
  expect(b({ creator: { ...creator, maxDurationSec: 90 } }, { ...video, durationSec: 91 })).toBe("This TikTok account can post videos up to 90 seconds.");
  expect(b({ creator: { ...creator, maxDurationSec: 60 } }, { ...video, durationSec: 61 })).toBe("This TikTok account can post videos up to 1 minute.");
  expect(b({ creator })).toBe(CHOOSE_PRIVACY);
  expect(CHOOSE_PRIVACY).toBe("Choose who can see it in the TikTok options.");
  expect(b({ creator, privacy: "PUBLIC_TO_EVERYONE" })).toBe(CHOOSE_PRIVACY); // no longer offered
  expect(b({ ...ready, brand: true })).toBe(BRAND_PICK);
  expect(BRAND_PICK).toBe("You need to indicate if your content promotes yourself, a third party, or both.");
  expect(b({ ...ready, brand: true, brandContent: true })).toBe(BRANDED_PRIVATE);
  expect(BRANDED_PRIVATE).toBe("Branded content visibility cannot be set to private.");
  expect(b({ ...ready, brand: true, brandOrganic: true })).toBeNull();
  expect(b({ ...ready, privacy: "FOLLOWER_OF_CREATOR", brand: true, brandContent: true })).toBeNull();
  // The boxes do not count while the switch is off.
  expect(b({ ...ready, brand: false, brandContent: true })).toBeNull();
  expect(b(ready)).toBeNull();
});

test("fresh creator info never changes a choice silently, except to drop what is no longer possible", () => {
  const had = readDirect({ mode: "direct", privacy: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: true, allowStitch: true });
  expect(reconcile(had, creator)).toEqual({ creator, privacy: null, allowDuet: false, allowStitch: false });
  expect(reconcile(readDirect(ready), creator)).toEqual({ creator });
  expect(reconcile(readDirect({ ...ready, allowComment: true }), { ...creator, commentDisabled: true })).toEqual({ creator: { ...creator, commentDisabled: true }, allowComment: false });
});

test("the consent, the label line and the notes", () => {
  expect(consentLine(readDirect(ready))).toBe(MUSIC);
  expect(consentLine(readDirect({ ...ready, brand: true, brandOrganic: true }))).toBe(MUSIC);
  expect(consentLine(readDirect({ ...ready, brand: true, brandContent: true }))).toBe(BRANDED);
  expect(consentLine(readDirect({ ...ready, brand: false, brandContent: true }))).toBe(MUSIC);
  expect(labelLine(readDirect(ready))).toBeNull();
  expect(labelLine(readDirect({ ...ready, brand: true }))).toBeNull();
  expect(labelLine(readDirect({ ...ready, brand: true, brandOrganic: true }))).toBe("Your video will be labeled as 'Promotional content'.");
  expect(labelLine(readDirect({ ...ready, brand: true, brandOrganic: true, brandContent: true }))).toBe("Your video will be labeled as 'Paid partnership'.");
  expect(directNote(video, readDirect(ready))).toBe(`Posting to Sunny. Who can see it: Only me. ${MUSIC} It may take a few minutes to appear.`);
  expect(directNote(video, readDirect({ mode: "direct" }))).toBe(DIRECT_NOT_READY);
  expect(DIRECT_NOT_READY).toBe("Post now publishes to your TikTok profile.");
  expect(DIRECT_DONE).toBe("Posted to TikTok. It may take a few minutes to appear.");
});

test("the adapter in direct mode: options, the caption limit, what is sent, the notes; the video rules still come first", () => {
  expect(tt.hasOptions).toBe(true);
  expect(tt.captionLimit!({})).toBeNull();
  expect(tt.captionLimit!({ mode: "direct" })).toBe(2200);
  expect(tt.sendOptions!({})).toEqual({});
  expect(tt.sendOptions!({ mode: "draft", privacy: "SELF_ONLY", creator })).toEqual({});
  expect(tt.sendOptions!(ready)).toEqual({ mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false });
  expect(tt.validate(video, "", ready)).toBeNull();
  expect(tt.validate(video, "", { mode: "direct" })).toBe(OPEN_OPTIONS);
  expect(tt.validate({ ...video, durationSec: 601 }, "", ready)).toBe("TikTok accepts videos up to 10 minutes.");
  expect(tt.noteFor!(video, {})).toBe(tt.note(video));
  expect(tt.noteFor!(video, ready)).toBe(directNote(video, readDirect(ready)));
  expect(tt.doneNoteFor!({})).toBe("Sent to TikTok — open TikTok to finish posting.");
  expect(tt.doneNoteFor!(ready)).toBe(DIRECT_DONE);
});
```

- [ ] **Step 2: Run.** `npx.cmd jest tiktokDirect.test`. Expected: FAIL (no module).

- [ ] **Step 3: `src/publish/tiktokDirect.ts`.**

```ts
import type { VideoInfo } from "./adapters/types";
import type { CreatorInfo, TikTokPrivacy } from "./api";

/**
 * TikTok "Post now" (Direct Post) on the phone: the shape of its options, its rules and every sentence. Pure — nothing here talks to
 * the server. The server checks all of it again against TikTok's own answer; this only keeps the user from pressing Post in vain.
 */
export const TITLE_MAX = 2200;
/** The order "Who can see it" is offered in (the server sends the creator's options in this order too). */
export const PRIVACY_ORDER: readonly TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
export const PRIVACY_LABEL: Record<TikTokPrivacy, string> = { PUBLIC_TO_EVERYONE: "Everyone", FOLLOWER_OF_CREATOR: "Followers", MUTUAL_FOLLOW_FRIENDS: "Friends", SELF_ONLY: "Only me" };

export const HOW_TO_SEND = "How to send";
export const SEND_MODES = [{ value: "draft", label: "Send as draft" }, { value: "direct", label: "Post now" }] as const;
export const DRAFT_EXPLAINED = "Clipy sends the video to your TikTok inbox. You add the caption and post it in TikTok.";
export const CHECKING = "Checking your TikTok account";
export const WHO_CAN_SEE = "Who can see it";
export const ALLOW = { comment: "Allow comments", duet: "Allow duet", stitch: "Allow stitch" } as const;
export const TURNED_OFF = "Turned off in your TikTok settings.";
export const BRAND_SWITCH = "Promotes a brand or product";
export const YOUR_BRAND = "Your brand";
export const BRANDED_CONTENT = "Branded content";
/** TikTok's own wording for the three brand rules. */
export const BRAND_PICK = "You need to indicate if your content promotes yourself, a third party, or both.";
export const BRANDED_PRIVATE = "Branded content visibility cannot be set to private.";
const LABEL_PROMO = "Your video will be labeled as 'Promotional content'.";
const LABEL_PAID = "Your video will be labeled as 'Paid partnership'.";
const CONSENT_MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const CONSENT_BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
export const TAKES_MINUTES = "It may take a few minutes to appear.";
/** UNVERIFIED addresses (spec §11 U8): tap both on the first live run. */
export const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";
export const NEEDS_PERMISSION_HERE = "To post directly, TikTok needs one more permission. Reconnect TikTok and allow everything it asks for.";
export const OPEN_OPTIONS = "Open the TikTok options to finish setting up Post now.";
export const CHOOSE_PRIVACY = "Choose who can see it in the TikTok options.";
export const DIRECT_NOT_READY = "Post now publishes to your TikTok profile.";
export const DIRECT_DONE = "Posted to TikTok. It may take a few minutes to appear.";

export interface DirectOptions {
  mode: "direct";
  /** Nothing is chosen until the user chooses: TikTok allows no default. */
  privacy: TikTokPrivacy | null;
  allowComment: boolean; allowDuet: boolean; allowStitch: boolean;
  /** The "Promotes a brand or product" switch; the two boxes count only while it is on. */
  brand: boolean; brandOrganic: boolean; brandContent: boolean;
  /** What TikTok said about the account when the sheet last showed Post now. Never sent to the server. */
  creator: CreatorInfo | null;
}

export const isDirect = (o: Record<string, unknown>): boolean => o.mode === "direct";
const flag = (v: unknown) => v === true;
const isCreator = (v: unknown): v is CreatorInfo => typeof v === "object" && v !== null && Array.isArray((v as CreatorInfo).privacyOptions) && typeof (v as CreatorInfo).nickname === "string";

/** The options as Post now reads them: anything missing or of the wrong kind is OFF / not chosen. */
export function readDirect(o: Record<string, unknown>): DirectOptions {
  return {
    mode: "direct", privacy: PRIVACY_ORDER.includes(o.privacy as TikTokPrivacy) ? (o.privacy as TikTokPrivacy) : null,
    allowComment: flag(o.allowComment), allowDuet: flag(o.allowDuet), allowStitch: flag(o.allowStitch),
    brand: flag(o.brand), brandOrganic: flag(o.brandOrganic), brandContent: flag(o.brandContent),
    creator: isCreator(o.creator) ? o.creator : null,
  };
}
/** Branded content (a paid partnership) is declared: the switch is on AND its box is ticked. */
export const isBranded = (o: DirectOptions) => o.brand && o.brandContent;

/** What goes to the server: the seven keys the server reads. The creator and the brand switch stay on the phone. */
export function sendDirect(o: DirectOptions): Record<string, unknown> {
  return { mode: "direct", privacy: o.privacy, allowComment: o.allowComment, allowDuet: o.allowDuet, allowStitch: o.allowStitch, brandOrganic: o.brand && o.brandOrganic, brandContent: isBranded(o) };
}

/** The patch for a fresh creator answer: it is kept, and only what is no longer possible is dropped (never anything switched ON). */
export function reconcile(o: DirectOptions, creator: CreatorInfo): Record<string, unknown> {
  return {
    creator,
    ...(o.privacy !== null && !creator.privacyOptions.includes(o.privacy) ? { privacy: null } : {}),
    ...(o.allowComment && creator.commentDisabled ? { allowComment: false } : {}),
    ...(o.allowDuet && creator.duetDisabled ? { allowDuet: false } : {}),
    ...(o.allowStitch && creator.stitchDisabled ? { allowStitch: false } : {}),
  };
}

/** "5 minutes", "1 minute", "90 seconds" — the same words as the server's refusal. */
export const lengthWords = (sec: number) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60} ${sec === 60 ? "minute" : "minutes"}` : `${Math.floor(sec)} seconds`);

/** Why Post now cannot be sent yet, or null. */
export function directBlocker(video: VideoInfo, o: DirectOptions): string | null {
  if (!o.creator) return OPEN_OPTIONS;
  if (video.durationSec > o.creator.maxDurationSec) return `This TikTok account can post videos up to ${lengthWords(o.creator.maxDurationSec)}.`;
  if (o.privacy === null || !o.creator.privacyOptions.includes(o.privacy)) return CHOOSE_PRIVACY;
  if (o.brand && !o.brandOrganic && !o.brandContent) return BRAND_PICK;
  if (isBranded(o) && o.privacy === "SELF_ONLY") return BRANDED_PRIVATE;
  return null;
}

export const consentLine = (o: DirectOptions): string => (isBranded(o) ? CONSENT_BRANDED : CONSENT_MUSIC);
/** How TikTok will label the post, or null when nothing is declared. */
export const labelLine = (o: DirectOptions): string | null => (!o.brand ? null : o.brandContent ? LABEL_PAID : o.brandOrganic ? LABEL_PROMO : null);

/** The TikTok row's standing note for Post now: the consent is read on the screen that has the Post button. */
export function directNote(video: VideoInfo, o: DirectOptions): string {
  if (!o.creator || o.privacy === null || directBlocker(video, o) !== null) return DIRECT_NOT_READY;
  return `Posting to ${o.creator.nickname}. ${WHO_CAN_SEE}: ${PRIVACY_LABEL[o.privacy]}. ${consentLine(o)} ${TAKES_MINUTES}`;
}
```

- [ ] **Step 4: `adapters/types.ts`.** Add the four optional members from **Produces** to `ClientAdapter` (after `coverOptions`). Nothing else.

- [ ] **Step 5: `adapters/tiktok.ts`.** The whole file becomes:

```ts
import { DIRECT_DONE, directBlocker, directNote, isDirect, readDirect, sendDirect, TITLE_MAX } from "../tiktokDirect";
import type { ClientAdapter } from "./types";

const MAX_DURATION_SEC = 600;
const MAX_BYTES = 4 * 1024 ** 3;
const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const DRAFT_NOTE = "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).";
const DRAFT_DONE = "Sent to TikTok — open TikTok to finish posting.";

/**
 * TikTok has two ways to send, chosen in its options. "Send as draft" (the default — the options are `{}`) puts the video in the
 * user's TikTok inbox: no caption, nothing else sent, no link when it is done. "Post now" (`mode: "direct"`) is TikTok's Direct Post:
 * the caption is the title and the rules live in tiktokDirect.ts. Whatever the options hold, a draft sends `{}`.
 */
export const tiktok: ClientAdapter = {
  id: "tiktok",
  captionMax: null,
  captionLimit: (options) => (isDirect(options) ? TITLE_MAX : null),
  hasOptions: true,
  defaultOptions: () => ({}),
  sendOptions: (options) => (isDirect(options) ? sendDirect(readDirect(options)) : {}),
  validate(video, _caption, options) {
    if (video.durationSec > MAX_DURATION_SEC) return "TikTok accepts videos up to 10 minutes.";
    if (video.fileSize > MAX_BYTES) return "TikTok accepts videos up to 4 GB.";
    if (!TYPES.includes(video.mimeType)) return "TikTok accepts MP4, MOV or WebM videos.";
    return isDirect(options) ? directBlocker(video, readDirect(options)) : null;
  },
  note: () => DRAFT_NOTE,
  noteFor: (video, options) => (isDirect(options) ? directNote(video, readDirect(options)) : DRAFT_NOTE),
  doneNote: DRAFT_DONE,
  doneNoteFor: (options) => (isDirect(options) ? DIRECT_DONE : DRAFT_DONE),
};
```

- [ ] **Step 6: `usePostForm.ts`.** Four edits; a platform without the new hooks goes through exactly today's values.

1. In the `base` map, compute the limit once per platform:
   ```ts
   const limit = adapter ? (adapter.captionLimit ? adapter.captionLimit(opts) : adapter.captionMax) : null;
   return { status, adapter, reason, on, opts, limit, error: on && adapter ? adapter.validate(video, caption, opts) : null };
   ```
2. Replace the three lines that read `captionMax` from `tickedAdapters`:
   ```ts
   const tickedOn = base.filter((b) => b.on && b.adapter);
   const limits = tickedOn.flatMap((b) => (b.limit === null ? [] : [b.limit]));
   const captionMax = limits.length ? Math.min(...limits) : null;
   const overLimit = captionMax !== null && caption.length > captionMax;
   const anyTicked = tickedOn.length > 0;
   const captionless = tickedOn.filter((b) => b.limit === null).map((b) => b.adapter!.id);
   ```
   (keep the three existing doc comments on `captionMax`, `anyTicked`, `captionless`; delete `tickedAdapters`).
3. In the `views` map destructure `limit` too; `const tooLong = overLimit && limit !== null;` and `note: on && adapter ? (adapter.noteFor ? adapter.noteFor(video, opts) : adapter.note(video)) : null,`.
4. `jobFor`:
   ```ts
   const jobFor = (v: PlatformView): Job => {
     const sent = v.adapter?.sendOptions ? v.adapter.sendOptions(v.options) : v.options;
     return { platform: v.status.id, caption, options: coverMs !== null && v.adapter?.coverOptions ? { ...sent, ...v.adapter.coverOptions(coverMs) } : sent };
   };
   ```

- [ ] **Step 7: `PostRow.tsx`.** ONE expression — the done text:

```ts
    const doneText = url ? null : row.message ?? (view.adapter?.doneNoteFor ? view.adapter.doneNoteFor(view.options) : view.adapter?.doneNote) ?? null;
```

- [ ] **Step 8: The uploader's two sentences.** Add to the END of `upload.test.ts` (use the file's own `args` / `E` helpers and its way of scripting `fetch`; read the two existing tests "a 416 on the last chunk says TikTok may already have the video; earlier it lost track" and the one expecting "The connection dropped. Post again to restart the TikTok upload." and copy their set-up exactly, adding `publishes: true` to the args):

```ts
describe("TikTok, an upload that publishes (Post now)", () => {
  test("a 416 on the last chunk says to check the profile; before the last chunk nothing changes", async () => {
    // set-up as in "a 416 on the last chunk …": the LAST chunk answers 416
    await expect(uploadTikTokChunks("https://up/x", args({ publishes: true }))).rejects.toEqual(E("TikTok may already have this video — check your TikTok profile before posting again."));
    // set-up as in the same test's second half: an EARLIER chunk answers 416
    await expect(uploadTikTokChunks("https://up/x", args({ publishes: true }))).rejects.toEqual(E("TikTok lost track of the upload. Post again."));
  });
  test("the last chunk lost after every retry says to check the profile; an earlier chunk lost says what it always said", async () => {
    // set-up as in the "connection dropped" test, with the failures on the LAST chunk
    await expect(uploadTikTokChunks("https://up/x", args({ publishes: true }))).rejects.toEqual(E("The connection dropped at the end of the upload. Check your TikTok profile before posting again."));
    // the same failures on the FIRST of two chunks
    await expect(uploadTikTokChunks("https://up/x", args({ publishes: true }))).rejects.toEqual(E("The connection dropped. Post again to restart the TikTok upload."));
  });
});
```

Each `// set-up` comment is replaced by the real mock lines copied from the named existing test (they are four or five lines each); both tests must fail before Step 9 and the file's existing tests are not edited.

In `upload.ts`:

```ts
export interface UploadArgs { reader: ChunkReader; mimeType: string; chunkSize: number; onProgress(fraction: number): void; signal: AbortSignal; resume?: boolean; sleep?(ms: number): Promise<void>;
  /** The upload itself publishes (TikTok Post now): when the LAST piece's fate is unknown the video may already be posted, so the user is told to check, never to post again. */
  publishes?: boolean }
```

`putTikTokChunk` gains a last parameter `unsure: boolean` and its final line becomes:

```ts
  throw new UploadError(unsure ? "The connection dropped at the end of the upload. Check your TikTok profile before posting again." : "The connection dropped. Post again to restart the TikTok upload.", false);
```

In `uploadTikTokChunks`: `const unsure = last && a.publishes === true;`, pass it as the new argument, and the 416 line becomes:

```ts
    else if (s === 416) throw last ? new UploadError(a.publishes === true ? "TikTok may already have this video — check your TikTok profile before posting again." : "TikTok may already have this video — check your TikTok inbox before posting again.", false) : again("TikTok lost track of the upload.");
```

- [ ] **Step 9: `runPost.ts`.** ONE expression (the key is added only when the server said so, so a draft's args are today's — the phone PROOF pins the key list):

```ts
        const args = { reader, mimeType: job.video.mimeType, chunkSize: p.chunkSize, onProgress, signal, resume: !!resumeFrom, ...(p.publishes === true ? { publishes: true } : {}) };
```

Add to the `describe("tiktok-chunks", …)` block of `runPost.test.ts` (at its end; edit nothing else):

```ts
  test("a plan that publishes tells the uploader so; the row ends done with no link", async () => {
    const direct = { ...tt, publishes: true, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false } };
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => direct), finalize: jest.fn(async () => ({ status: "done" as const, url: null })) } }), t = track();
    await runPost({ ...job, platform: "tiktok" }, d, t.update, signal());
    expect((d.uploadTikTokChunks as jest.Mock).mock.calls[0][1]).toMatchObject({ publishes: true });
    expect(t.row()).toMatchObject({ phase: "done", url: null, message: null });
  });
```

- [ ] **Step 10: The form, on the screen.** Add a new file `src/publish/__tests__/PostScreen.tiktokDirect.test.tsx`. Copy the mock header and the helpers of `PostScreen.test.tsx` (its lines 1–66: the `jest.mock` calls, `acct`, `accounts`, `rows`, `TT_ON`, `post`, `usePostReturns`, `beforeEach`) verbatim, and add `jest.mock("../useCreatorInfo", () => ({ useCreatorInfo: jest.fn(() => ({ state: { status: "idle" }, load: jest.fn() })) }));` (Task 4 creates that module; until then use `{ virtual: true }` as the third argument and REMOVE it in Task 4). The form's options are set through the adapter's defaults for these tests:

```tsx
import { clientAdapters } from "../adapters";
const creator = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
/** These tests start the TikTok row in a chosen state by replacing its defaults (the sheet that sets them is Task 4's). */
const startWith = (options: Record<string, unknown>) => jest.spyOn(clientAdapters.tiktok!, "defaultOptions").mockReturnValue(options);
afterEach(() => jest.restoreAllMocks());

describe("TikTok, Post now", () => {
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("ready: the caption is counted against 2200, the caption line is gone, the note carries the consent, and Post sends the seven keys", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", allowComment: true, creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny #beach");
    expect(screen.getByText("12 / 2200")).toBeTruthy();
    expect(screen.queryByText(/doesn't receive this caption/)).toBeNull();
    expect(screen.getByText(`Posting to Sunny. Who can see it: Only me. ${MUSIC} It may take a few minutes to appear.`)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "TikTok" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "Sunny #beach", options: { mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false } }]);
  });

  test("nothing chosen yet: the row says what is missing, is not ticked, Post is disabled, and a tap on the row opens its options", async () => {
    startWith({ mode: "direct", creator });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByText("Choose who can see it in the TikTok options.")).toBeTruthy();
    expect(screen.getByText("Post now publishes to your TikTok profile.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "TikTok" }));
    expect(screen.getByText("TikTok options")).toBeTruthy();
  });

  test("a caption over 2200 holds TikTok back and never YouTube under its own limit", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(2201));
    expect(screen.getByText("2201 / 2200")).toBeTruthy();
    expect(screen.getAllByText("Captions can be up to 2200 characters.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  test("done: a direct post says it is posted; a draft still says it was sent", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    usePostReturns(post({ rows: rows({}, { phase: "done", progress: 1, url: null }) }));
    await render(<PostScreen />);
    expect(screen.getByText("Posted to TikTok. It may take a few minutes to appear.")).toBeTruthy();
    expect(screen.queryByText("Sent to TikTok — open TikTok to finish posting.")).toBeNull();
  });

  test("back to a draft after choosing things: Post sends options {} and the caption line is back", async () => {
    startWith({ mode: "draft", privacy: "SELF_ONLY", allowComment: true, creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByText("TikTok doesn't receive this caption — you'll write it in TikTok.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: {} }]);
  });
});
```

Note the third test: with both platforms ticked the smallest limit (2200) is the form's limit and holds back every platform that takes the caption — that is the form's existing rule ("the caption limit is the smallest one among the ticked platforms"), unchanged.

- [ ] **Step 11: Run.** `npm run typecheck`, `npm test`. Both PROOF files green and unedited; `PostScreen.test.tsx` green with its one changed line.

- [ ] **Step 12: Commit.** `git add` each file of this task's list by path, message `feat(tiktok): Post now on the phone — rules and sentences, the adapter's hooks, the form, the uploader's check-first sentences`.

---

## Task 4: The sheet, the creator hook, the screen wiring

**Files:**
- Create: `src/publish/useCreatorInfo.ts`
- Create: `src/publish/components/TikTokOptions.tsx`
- Create: `src/publish/__tests__/useCreatorInfo.test.ts`
- Create: `src/publish/__tests__/TikTokOptions.test.tsx`
- Modify: `src/publish/components/PostOptionsSheet.tsx`
- Modify: `src/publish/components/PostScreenBody.tsx`
- Modify: `src/publish/__tests__/PostScreen.tiktokDirect.test.tsx` (remove `{ virtual: true }`; ADD the wiring tests of Step 7)

**Interfaces:**
- Consumes: `api.creatorInfo`, `ApiFailure`, `CreatorInfo`, `TikTokPrivacy` (`src/publish/api.ts`); every export of `src/publish/tiktokDirect.ts` (Task 3); `useAccounts().connect(platform)`; `AFTER_SHEET_MS` (`src/projects/ProjectActionsSheet.tsx`); the kit: `Sheet`, `Segmented`, `Body`, `Spinner`, `QuietButton`, `PressableScale`, `Icon`, `useSurfaces`, `DISABLED_OPACITY` (`src/ui/buttonStyle`).
- Produces:
  ```ts
  // src/publish/useCreatorInfo.ts
  export type CreatorState = { status: "idle" } | { status: "loading" } | { status: "ready"; info: CreatorInfo } | { status: "needsPermission" } | { status: "error"; message: string };
  export function useCreatorInfo(platform: PlatformId, ask?: (platform: PlatformId) => Promise<CreatorInfo>): { state: CreatorState; load: () => void };
  // src/publish/components/TikTokOptions.tsx
  export function TikTokOptions(props: { options: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; creator: CreatorState; onLoad: () => void; onReconnect: () => void }): React.ReactElement;
  // PostOptionsSheet gains ONE optional prop:
  tiktok?: { creator: CreatorState; onLoad: () => void; onReconnect: () => void };
  ```

### Steps

- [ ] **Step 1: The hook's failing test** (`useCreatorInfo.test.ts`).

```ts
import { act, renderHook } from "@testing-library/react-native";
import { ApiFailure, type CreatorInfo } from "../api";
import { useCreatorInfo } from "../useCreatorInfo";

const INFO: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test("idle until asked; loading, then ready", async () => {
  const d = deferred<CreatorInfo>();
  const ask = jest.fn(() => d.promise);
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  expect(h.result.current.state).toEqual({ status: "idle" });
  expect(ask).not.toHaveBeenCalled();
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "loading" });
  expect(ask).toHaveBeenCalledWith("tiktok");
  await act(async () => { d.resolve(INFO); });
  expect(h.result.current.state).toEqual({ status: "ready", info: INFO });
});

test("a missing permission is its own state; any other failure keeps the server's sentence", async () => {
  const ask = jest.fn().mockRejectedValueOnce(new ApiFailure("needs_permission", "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options."))
    .mockRejectedValueOnce(new ApiFailure("platform_unavailable", "TikTok is busy — wait a minute, then try again.")).mockRejectedValueOnce("odd");
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "needsPermission" });
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "error", message: "TikTok is busy — wait a minute, then try again." });
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "error", message: "Something went wrong." });
});

test("the newest request wins, and nothing is set after unmount", async () => {
  const first = deferred<CreatorInfo>(), second = deferred<CreatorInfo>();
  const ask = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  await act(async () => { h.result.current.load(); });
  await act(async () => { h.result.current.load(); });
  await act(async () => { second.resolve({ ...INFO, nickname: "Second" }); });
  await act(async () => { first.resolve(INFO); });
  expect(h.result.current.state).toEqual({ status: "ready", info: { ...INFO, nickname: "Second" } });
  const late = deferred<CreatorInfo>();
  ask.mockReturnValueOnce(late.promise);
  await act(async () => { h.result.current.load(); });
  await h.unmount();
  await act(async () => { late.resolve(INFO); }); // must not warn or throw
});
```

- [ ] **Step 2: `useCreatorInfo.ts`.**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure, type CreatorInfo } from "./api";
import type { PlatformId } from "./platforms";

export type CreatorState = { status: "idle" } | { status: "loading" } | { status: "ready"; info: CreatorInfo } | { status: "needsPermission" } | { status: "error"; message: string };

/**
 * What the connected account may post right now, asked from the server only when `load()` is called (the TikTok sheet showing
 * "Post now") — never on its own, never cached: every load is a fresh question and the newest one wins.
 */
export function useCreatorInfo(platform: PlatformId, ask: (platform: PlatformId) => Promise<CreatorInfo> = api.creatorInfo) {
  const [state, setState] = useState<CreatorState>({ status: "idle" });
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(() => {
    const id = ++request.current;
    const live = () => mounted.current && id === request.current;
    setState({ status: "loading" });
    ask(platform).then(
      (info) => { if (live()) setState({ status: "ready", info }); },
      (e: unknown) => {
        if (!live()) return;
        if (e instanceof ApiFailure && e.code === "needs_permission") setState({ status: "needsPermission" });
        else setState({ status: "error", message: e instanceof Error && e.message ? e.message : "Something went wrong." });
      },
    );
  }, [platform, ask]);
  return { state, load };
}
```

- [ ] **Step 3: The sheet body's failing test** (`TikTokOptions.test.tsx`).

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import type { CreatorInfo } from "../api";
import { TikTokOptions } from "../components/TikTokOptions";
import type { CreatorState } from "../useCreatorInfo";
import { hasSurface, leftovers, wear } from "@/src/ui/testing/appearance";

const info: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: "https://p16.tiktokcdn.com/a.jpeg", privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const ready: CreatorState = { status: "ready", info };
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
function setup(options: Record<string, unknown> = {}, creator: CreatorState = { status: "idle" }) {
  const p = { options, creator, onChange: jest.fn(), onLoad: jest.fn(), onReconnect: jest.fn() };
  return { p, view: render(<TikTokOptions {...p} />) };
}
const direct = (over: Record<string, unknown> = {}) => ({ mode: "direct", creator: info, ...over });

test("a draft: the first control with Send as draft picked, its one explanation, and nothing asked from TikTok", async () => {
  const { p, view } = setup();
  await view;
  expect(screen.getByText("How to send")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send as draft" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Post now" })).not.toBeSelected();
  expect(screen.getByText("Clipy sends the video to your TikTok inbox. You add the caption and post it in TikTok.")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
  expect(p.onLoad).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
  expect(p.onChange).toHaveBeenCalledWith({ mode: "direct" });
  await fireEvent.press(screen.getByRole("button", { name: "Send as draft" }));
  expect(p.onChange).toHaveBeenLastCalledWith({ mode: "draft" });
});

test("Post now asks for the creator once when it is shown, and shows a spinner meanwhile", async () => {
  const { p, view } = setup({ mode: "direct" }, { status: "loading" });
  await view;
  expect(p.onLoad).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Checking your TikTok account")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
});

test("a fresh answer is written into the options, dropping only what is no longer possible", async () => {
  const { p, view } = setup({ mode: "direct", privacy: "PUBLIC_TO_EVERYONE", allowDuet: true }, ready);
  await view;
  expect(p.onChange).toHaveBeenCalledWith({ creator: info, privacy: null, allowDuet: false });
});

test("ready: the account, only the offered choices with NOTHING picked, three switches off, the brand switch off, the consent and the wait", async () => {
  await setup(direct(), ready).view;
  expect(screen.getByText("Posting to Sunny")).toBeTruthy();
  expect(screen.getByTestId("tiktok-avatar").props.source).toEqual({ uri: "https://p16.tiktokcdn.com/a.jpeg" });
  expect(screen.getByText("Who can see it")).toBeTruthy();
  expect(screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["Followers", "Friends", "Only me"]);
  for (const r of screen.getAllByRole("radio")) expect(r).not.toBeChecked();
  expect(screen.queryByRole("radio", { name: "Everyone" })).toBeNull();
  for (const name of ["Allow comments", "Allow duet", "Allow stitch", "Promotes a brand or product"]) expect(screen.getByRole("switch", { name }).props.value).toBe(false);
  expect(screen.getByRole("switch", { name: "Allow comments" })).toBeEnabled();
  expect(screen.getByRole("switch", { name: "Allow duet" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Allow stitch" })).toBeDisabled();
  expect(screen.getAllByText("Turned off in your TikTok settings.")).toHaveLength(2);
  expect(screen.queryByRole("checkbox", { name: "Your brand" })).toBeNull();
  expect(screen.getByText(MUSIC)).toBeTruthy();
  expect(screen.getByText("It may take a few minutes to appear.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Music Usage Confirmation" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Branded Content Policy" })).toBeNull();
});

test("choosing and switching change one key each", async () => {
  const { p, view } = setup(direct(), ready);
  await view;
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
  expect(p.onChange).toHaveBeenLastCalledWith({ privacy: "SELF_ONLY" });
  await fireEvent(screen.getByRole("switch", { name: "Allow comments" }), "valueChange", true);
  expect(p.onChange).toHaveBeenLastCalledWith({ allowComment: true });
  await fireEvent(screen.getByRole("switch", { name: "Promotes a brand or product" }), "valueChange", true);
  expect(p.onChange).toHaveBeenLastCalledWith({ brand: true });
});

test("the picked choice is checked and says so by more than colour", async () => {
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR" }), ready).view;
  expect(screen.getByRole("radio", { name: "Followers" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Only me" })).not.toBeChecked();
  expect(screen.getByTestId("tiktok-picked-FOLLOWER_OF_CREATOR")).toBeTruthy();
  expect(screen.queryByTestId("tiktok-picked-SELF_ONLY")).toBeNull();
});

test("the brand switch on: two boxes, at least one needed, and how TikTok will label it", async () => {
  const a = setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true }), ready);
  await a.view;
  expect(screen.getByRole("checkbox", { name: "Your brand" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Branded content" })).not.toBeChecked();
  expect(screen.getByText("You need to indicate if your content promotes yourself, a third party, or both.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Your brand" }));
  expect(a.p.onChange).toHaveBeenLastCalledWith({ brandOrganic: true });
  await fireEvent.press(screen.getByRole("checkbox", { name: "Branded content" }));
  expect(a.p.onChange).toHaveBeenLastCalledWith({ brandContent: true });
  await (await a.view).unmount();
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true }), ready).view;
  expect(screen.getByText("Your video will be labeled as 'Promotional content'.")).toBeTruthy();
  expect(screen.getByText(MUSIC)).toBeTruthy();
});

test("branded content: the paid label, the longer consent with its second link, and Only me cannot be picked", async () => {
  const { p, view } = setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true, brandContent: true }), ready);
  await view;
  expect(screen.getByText("Your video will be labeled as 'Paid partnership'.")).toBeTruthy();
  expect(screen.getByText(BRANDED)).toBeTruthy();
  expect(screen.queryByText(MUSIC)).toBeNull();
  expect(screen.getByRole("button", { name: "Branded Content Policy" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Only me" })).toBeDisabled();
  expect(screen.getByText("Branded content visibility cannot be set to private.")).toBeTruthy();
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
  expect(p.onChange).not.toHaveBeenCalled();
});

test("Only me picked: the Branded content box cannot be ticked, and says why", async () => {
  const { p, view } = setup(direct({ privacy: "SELF_ONLY", brand: true }), ready);
  await view;
  expect(screen.getByRole("checkbox", { name: "Branded content" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Your brand" })).toBeEnabled();
  expect(screen.getByText("Branded content visibility cannot be set to private.")).toBeTruthy();
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Branded content" }));
  expect(p.onChange).not.toHaveBeenCalled();
});

test("the links open TikTok's pages", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandContent: true }), ready).view;
  await fireEvent.press(screen.getByRole("button", { name: "Music Usage Confirmation" }));
  expect(open).toHaveBeenLastCalledWith("https://www.tiktok.com/legal/page/global/music-usage-confirmation/en");
  await fireEvent.press(screen.getByRole("button", { name: "Branded Content Policy" }));
  expect(open).toHaveBeenLastCalledWith("https://www.tiktok.com/legal/page/global/bc-policy/en");
  open.mockRestore();
});

test("no permission: one plain sentence and Reconnect; a failure: the server's sentence and Try Again", async () => {
  const a = setup({ mode: "direct" }, { status: "needsPermission" });
  await a.view;
  expect(screen.getByText("To post directly, TikTok needs one more permission. Reconnect TikTok and allow everything it asks for.")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
  expect(a.p.onReconnect).toHaveBeenCalledTimes(1);
  await (await a.view).unmount();
  const b = setup({ mode: "direct" }, { status: "error", message: "TikTok is busy — wait a minute, then try again." });
  await b.view;
  expect(screen.getByText("TikTok is busy — wait a minute, then try again.")).toBeTruthy();
  b.p.onLoad.mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
  expect(b.p.onLoad).toHaveBeenCalledTimes(1);
});

describe("in light", () => {
  afterEach(() => wear("dark"));
  test("the whole Post now body is cream: no navy surface, no white or bright-gold ink", async () => {
    wear("light");
    await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true, brandContent: true }), ready).view;
    expect(leftovers()).toEqual([]);
    expect(hasSurface).toBeDefined();
  });
});
```

(If `wear` / `leftovers` need the tree inside a kit `Screen` to resolve the tone, wrap the render as `PostScreen.test.tsx`'s "in light" block does; read that block first and follow it. Drop the `hasSurface` import if it is unused.)

- [ ] **Step 4: `TikTokOptions.tsx`.**

```tsx
import { useEffect } from "react";
import { Image, Linking, ScrollView, Switch, useWindowDimensions, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { Icon } from "@/src/ui/Icon";
import { PressableScale } from "@/src/ui/PressableScale";
import { QuietButton } from "@/src/ui/QuietButton";
import { Segmented } from "@/src/ui/Segmented";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { useSurfaces } from "@/src/ui/tone";
import type { TikTokPrivacy } from "../api";
import { ALLOW, BRAND_PICK, BRAND_SWITCH, BRANDED_CONTENT, BRANDED_PRIVATE, BRANDED_URL, CHECKING, consentLine, DRAFT_EXPLAINED, HOW_TO_SEND, isBranded, isDirect, labelLine, MUSIC_URL, NEEDS_PERMISSION_HERE, PRIVACY_LABEL, PRIVACY_ORDER, readDirect, reconcile, SEND_MODES, TAKES_MINUTES, TURNED_OFF, WHO_CAN_SEE, YOUR_BRAND } from "../tiktokDirect";
import type { CreatorState } from "../useCreatorInfo";

type Props = { options: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; creator: CreatorState; onLoad: () => void; onReconnect: () => void };

const ROW = theme.size.touch;
const small = { fontSize: theme.type.small } as const;
/** The sheet's body may be taller than a small phone: it scrolls inside this share of the window. */
const BODY_SHARE = 0.68;
const open = (url: string) => { Linking.openURL(url).catch(() => useToast.getState().show("Couldn't open the link.")); };

/** One choice of "Who can see it": a radio row; the picked one is semibold with a check (never colour alone). */
function ChoiceRow({ value, picked, disabled, onPress }: { value: TikTokPrivacy; picked: boolean; disabled: boolean; onPress: () => void }) {
  const s = useSurfaces();
  return (
    <PressableScale accessibilityRole="radio" accessibilityLabel={PRIVACY_LABEL[value]} accessibilityState={{ checked: picked, disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md, opacity: disabled ? DISABLED_OPACITY : 1 }}>
      <Body weight={picked ? "semi" : "regular"}>{PRIVACY_LABEL[value]}</Body>
      {picked ? <Icon testID={`tiktok-picked-${value}`} name="checkmark-circle-outline" size={theme.size.icon.md} color={s.accentInk} /> : null}
    </PressableScale>
  );
}

/** A labelled switch; `off` = the creator has it disabled in TikTok: greyed out, inert, and it says why. */
function SwitchRow({ label, value, off, onChange }: { label: string; value: boolean; off?: boolean; onChange: (next: boolean) => void }) {
  const s = useSurfaces();
  return (
    <View style={{ opacity: off ? DISABLED_OPACITY : 1 }}>
      <View style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md }}>
        <Body style={{ flex: 1 }}>{label}</Body>
        <Switch accessibilityLabel={label} value={value && !off} disabled={!!off} onValueChange={onChange} trackColor={{ true: s.accentInk }} />
      </View>
      {off ? <Body muted style={small}>{TURNED_OFF}</Body> : null}
    </View>
  );
}

/** A tick box, drawn as the Post screen's platform rows draw theirs. */
function TickRow({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled?: boolean; onPress: () => void }) {
  const s = useSurfaces();
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", gap: theme.space.md, opacity: disabled ? DISABLED_OPACITY : 1 }}>
      <Icon name={checked ? "checkbox-outline" : "square-outline"} size={theme.size.icon.lg} color={checked ? s.accentInk : s.text} />
      <Body>{label}</Body>
    </PressableScale>
  );
}

/**
 * The TikTok options: "How to send" first. A draft needs nothing else. "Post now" asks the server what the account may post each time
 * it is shown (`onLoad`), then offers ONLY what TikTok returned, with nothing chosen and every switch off until the user decides —
 * TikTok's rules for apps that post directly. Every change is one `onChange` patch; nothing is sent to TikTok from here.
 */
export function TikTokOptions({ options, onChange, creator, onLoad, onReconnect }: Props) {
  const { height } = useWindowDimensions();
  const direct = isDirect(options);
  const o = readDirect(options);
  // Asked when Post now is first shown and each time the user switches to it. Only `direct` starts it.
  useEffect(() => { if (direct) onLoad(); }, [direct]);
  // A fresh answer is kept in the options (the Post screen validates against it) and drops only what is no longer possible.
  useEffect(() => { if (direct && creator.status === "ready") onChange(reconcile(readDirect(options), creator.info)); }, [creator]);

  const info = creator.status === "ready" ? creator.info : null;
  const branded = isBranded(o);
  const label = labelLine(o);
  return (
    <ScrollView style={{ maxHeight: Math.round(height * BODY_SHARE) }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg }}>
      <View style={{ gap: theme.space.sm }}>
        <Body muted style={small}>{HOW_TO_SEND}</Body>
        <Segmented options={SEND_MODES} value={direct ? "direct" : "draft"} onChange={(mode) => onChange({ mode })} testID="tiktok-mode" />
      </View>
      {!direct ? <Body muted>{DRAFT_EXPLAINED}</Body> : null}
      {direct && (creator.status === "loading" || creator.status === "idle") ? <Spinner label={CHECKING} /> : null}
      {direct && creator.status === "needsPermission" ? (
        <View style={{ gap: theme.space.sm, alignItems: "flex-start" }}>
          <Body>{NEEDS_PERMISSION_HERE}</Body>
          <QuietButton title="Reconnect" accessibilityLabel="Reconnect TikTok" onPress={onReconnect} />
        </View>
      ) : null}
      {direct && creator.status === "error" ? (
        <View style={{ gap: theme.space.sm, alignItems: "flex-start" }}>
          <Body>{creator.message}</Body>
          <QuietButton title="Try Again" onPress={onLoad} />
        </View>
      ) : null}
      {direct && info ? (<>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
          {info.avatarUrl ? <Image testID="tiktok-avatar" source={{ uri: info.avatarUrl }} style={{ width: theme.size.avatar, height: theme.size.avatar, borderRadius: theme.radius.pill }} /> : null}
          <Body weight="semi" numberOfLines={1} style={{ flex: 1 }}>{`Posting to ${info.nickname}`}</Body>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={WHO_CAN_SEE}>
          <Body muted style={small}>{WHO_CAN_SEE}</Body>
          {PRIVACY_ORDER.filter((p) => info.privacyOptions.includes(p)).map((p) => (
            <ChoiceRow key={p} value={p} picked={o.privacy === p} disabled={p === "SELF_ONLY" && branded} onPress={() => onChange({ privacy: p })} />
          ))}
          {branded && info.privacyOptions.includes("SELF_ONLY") ? <Body muted style={small}>{BRANDED_PRIVATE}</Body> : null}
        </View>
        <View>
          <SwitchRow label={ALLOW.comment} value={o.allowComment} off={info.commentDisabled} onChange={(v) => onChange({ allowComment: v })} />
          <SwitchRow label={ALLOW.duet} value={o.allowDuet} off={info.duetDisabled} onChange={(v) => onChange({ allowDuet: v })} />
          <SwitchRow label={ALLOW.stitch} value={o.allowStitch} off={info.stitchDisabled} onChange={(v) => onChange({ allowStitch: v })} />
        </View>
        <View>
          <SwitchRow label={BRAND_SWITCH} value={o.brand} onChange={(v) => onChange({ brand: v })} />
          {o.brand ? (<>
            <TickRow label={YOUR_BRAND} checked={o.brandOrganic} onPress={() => onChange({ brandOrganic: !o.brandOrganic })} />
            <TickRow label={BRANDED_CONTENT} checked={o.brandContent} disabled={o.privacy === "SELF_ONLY" && !o.brandContent} onPress={() => onChange({ brandContent: !o.brandContent })} />
            {o.privacy === "SELF_ONLY" && !o.brandContent ? <Body muted style={small}>{BRANDED_PRIVATE}</Body> : null}
            {!o.brandOrganic && !o.brandContent ? <Body muted style={small}>{BRAND_PICK}</Body> : null}
            {label ? <Body muted style={small}>{label}</Body> : null}
          </>) : null}
        </View>
        <View style={{ gap: theme.space.xs, alignItems: "flex-start" }}>
          <Body muted style={small}>{consentLine(o)}</Body>
          <QuietButton compact title="Music Usage Confirmation" onPress={() => open(MUSIC_URL)} />
          {branded ? <QuietButton compact title="Branded Content Policy" onPress={() => open(BRANDED_URL)} /> : null}
          <Body muted style={small}>{TAKES_MINUTES}</Body>
        </View>
      </>) : null}
    </ScrollView>
  );
}
```

Two things to get right while making the tests pass: (1) when both "Only me" is picked and "Branded content" is ticked (a state the sheet cannot produce, but the options could hold) the sentence `BRANDED_PRIVATE` must be on screen exactly once — the two conditions above are exclusive (`branded` vs `!o.brandContent`), keep them so; (2) `getAllByText("Turned off in your TikTok settings.")` expects one line per disabled switch. If `Body` does not forward `accessibilityRole="radiogroup"` on a `View` in this React Native version's types, drop that role and keep the label; the rows' own `radio` role is what the tests read.

- [ ] **Step 5: `PostOptionsSheet.tsx`.** Add the optional prop and one branch; YouTube's body is untouched.

```tsx
import type { CreatorState } from "../useCreatorInfo";
import { TikTokOptions } from "./TikTokOptions";

type Props = { platform: PlatformId | null; options: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; onClose: () => void;
  /** What the TikTok body needs besides its options: the creator's state, how to ask for it, and the reconnect offer. */
  tiktok?: { creator: CreatorState; onLoad: () => void; onReconnect: () => void } };
```

and after the YouTube branch's closing `) : null}`:

```tsx
      {platform === "tiktok" && tiktok ? <TikTokOptions options={options} onChange={onChange} creator={tiktok.creator} onLoad={tiktok.onLoad} onReconnect={tiktok.onReconnect} /> : null}
```

- [ ] **Step 6: `PostScreenBody.tsx`.** Add the imports `AFTER_SHEET_MS` (`@/src/projects/ProjectActionsSheet`) and `useCreatorInfo` (`../useCreatorInfo`); after `useLeaveGuard(busy, cancel);` add:

```tsx
  const creator = useCreatorInfo("tiktok");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  /**
   * "Post now" without TikTok's posting permission: the existing connect flow, started from here because Accounts offers no Reconnect
   * for a healthy account. The sheet closes first (iOS presents the sign-in browser only once the modal is gone), and opens again
   * when the user is back, which asks TikTok afresh.
   */
  const reconnectTikTok = useCallback(() => {
    setOptionsFor(null);
    setTimeout(() => {
      if (!mounted.current) return;
      accounts.connect("tiktok").then(() => { if (mounted.current) setOptionsFor("tiktok"); }, () => {});
    }, AFTER_SHEET_MS);
  }, [accounts.connect]);
```

and pass `tiktok={{ creator: creator.state, onLoad: creator.load, onReconnect: reconnectTikTok }}` to `<PostOptionsSheet …>`. Nothing else in the file changes (the one gold button stays the screen's Post).

- [ ] **Step 7: The wiring tests.** In `PostScreen.tiktokDirect.test.tsx` remove `{ virtual: true }`, import `useCreatorInfo` from `"../useCreatorInfo"` (the mocked one), and add:

```tsx
describe("TikTok options on the Post screen", () => {
  const creatorMock = (state: unknown, load = jest.fn()) => { (useCreatorInfo as jest.Mock).mockReturnValue({ state, load }); return load; };
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("opening the options of a draft asks TikTok nothing; choosing Post now asks once", async () => {
    const load = creatorMock({ status: "idle" });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    expect(screen.getByText("TikTok options")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send as draft" })).toBeSelected();
    expect(load).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("Post now from the sheet to Post: choose who can see it, close, Post sends the direct job", async () => {
    creatorMock({ status: "ready", info: creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled(); // nothing chosen yet
    await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: { mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false } }]);
  });

  test("Reconnect closes the sheet, starts the existing connect flow for TikTok and opens the sheet again", async () => {
    jest.useFakeTimers();
    try {
      creatorMock({ status: "needsPermission" });
      const a = accounts({}, TT_ON); (a.connect as jest.Mock).mockResolvedValue(undefined);
      (useAccounts as jest.Mock).mockReturnValue(a);
      startWith({ mode: "direct" });
      await render(<PostScreen />);
      await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
      await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
      expect(screen.queryByText("TikTok options")).toBeNull();
      expect(a.connect).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(350); });
      expect(a.connect).toHaveBeenCalledWith("tiktok");
      await act(async () => {});
      expect(screen.getByText("TikTok options")).toBeTruthy();
      expect(router.push).not.toHaveBeenCalledWith("/accounts");
    } finally { jest.useRealTimers(); }
  });
});
```

- [ ] **Step 8: Run.** `npm run typecheck`, `npm test`. The guards must be green without touching them: `noHexLiterals`, `spacingScale` (no new entry in its allow-table), `casing.guard`, `outlineIcons`, `sfSymbols.map`, `systemFont.guard`, `palette.guard`. Both PROOF files green and unedited.

- [ ] **Step 9: Commit.** `git add` each file of this task's list by path, message `feat(tiktok): the options sheet — Send as draft or Post now, who can see it, the switches, the brand disclosure, the consent, reconnect`.

---

## Task 5: Independent review and fixes

**Files:** none of its own; fixes go into the files of Tasks 1–4 and 6, each with a test first.

**Interfaces:** Consumes the spec and the diff `main...HEAD`. Produces a short findings list (Critical / Important / Minor) in the final message and one commit per fixed finding.

The reviewer is given the spec, this plan's Global Constraints and `git diff main...HEAD` — not the implementers' reports — and checks, reading the code:

- [ ] **The draft path.** `git diff main...HEAD -- supabase/functions/_shared/platforms/tiktok.ts`: with `direct = false` / no `ref.direct` every expression on the draft path evaluates as before (`CODE_STATUS` and `FRIENDLY` unedited; `fail` and `apiJson` defaults). `git log --follow` on the two PROOF files shows ONE commit each, earlier than every other commit of the branch, and `git diff <that commit>..HEAD -- <the two files>` is empty.
- [ ] **Only the exact mode switches.** Search the server for every read of `options.mode` and `ref.direct`.
- [ ] **Never trust the phone.** In `prepareDirect` every check sits between `queryCreator` and the init `fetch`; no path reaches init after a failed check; the options object is never spread into the request.
- [ ] **`needs_permission` cannot flag an account.** It is an `ApiError`, not a `PlatformError`; `withPlatformAuth` only catches `PlatformError`. Confirm with the handler test and by reading `tokens.ts`.
- [ ] **No second post.** `video/init` is called once per prepare, in no loop; `runPost` / `usePost` gained no retry; the two last-chunk sentences for `publishes` say to check first; a retry after them is the user's own press.
- [ ] **Nothing before Post.** The only call the sheet causes is `creator-info` (a read). `api.prepare` is reached only from `usePost.start` / `retry`.
- [ ] **Secrets.** `creator-info` returns exactly the eight fields; no `console.*` prints a token, an upload address, a creator answer or an options object; `avatarUrl` is `https://` or null.
- [ ] **TikTok's UX rules (spec §2, §6):** nothing pre-selected in "Who can see it"; the three switches and the brand switch start OFF on a fresh sheet AND after switching draft → Post now → draft → Post now; a disabled interaction cannot be switched on and is never sent as allowed; the consent line matches the branded state everywhere it is drawn (sheet and row note); "Only me" and "Branded content" exclude each other without changing a choice silently.
- [ ] **Every sentence** of spec §6 appears in the code exactly once as a constant, spelled as in the spec, and server and phone agree on the shared ones (the length sentence, `BRANDED_PRIVATE`).
- [ ] **House rules:** colours only from `useSurfaces()` in the two new UI files; spacing from `theme.space`; no apostrophe in JSX text; title style only on buttons; no new icon name; no new animation; the sheet has no `PrimaryButton`.
- [ ] **Run** `npm run typecheck` and `npm test`; record the totals (they must be above the baseline: app 380 / 5972, server 15 / 464; no suite removed).

Each Critical or Important finding: write the failing test, fix, re-run everything, commit `fix(tiktok): <what>`.

---

## Task 6: Docs

**Files:**
- Modify: `AGENTS.md` (the Posting bullet only)
- Modify: `supabase/README.md` (section 3's function count; section 11)

**Interfaces:** Consumes the spec (§6 sentences, §10 deployment, §11 unverified). Produces no code. The site's privacy text needs no change (spec §9).

### Steps

- [ ] **Step 1: `AGENTS.md`.** Append to the END of the existing "Posting:" bullet (same paragraph, nothing above it edited):

> TikTok has two ways to send, chosen in its options sheet (`TikTokOptions.tsx`): **Send as draft** — the default, the inbox route, whose requests and words are pinned by two PROOF files (`supabase/functions/_shared/__tests__/tiktok.draft.proof.test.ts`, `src/publish/__tests__/tiktokDraft.proof.test.ts`: never edited to make a change pass; a draft always sends `options: {}`) — and **Post now** (Direct Post), reached on the server ONLY by `options.mode === "direct"`. The phone's rules and every sentence of Post now live in `src/publish/tiktokDirect.ts` (pure); the adapter's optional hooks `captionLimit` / `sendOptions` / `noteFor` / `doneNoteFor` are how a platform's options change what the form counts, sends and says. The phone is never trusted: `prepareDirect` (platforms/tiktok.ts) asks TikTok's creator info again and checks every option against it before `video/init`, which is called once and never repeated; a refusal opens nothing. The sheet reads the creator through the `creator-info` function (`useCreatorInfo`, asked only while the sheet shows Post now, never cached). A grant without `video.publish` is `needs_permission` — a plain `ApiError`, never a `PlatformError` and never `needsReconnect`, because that account still posts drafts; the sheet then offers Reconnect (the existing `useAccounts().connect`). A direct post's upload publishes by itself (`publishes: true` in the plan), so a lost LAST chunk says "check your TikTok profile before posting again", never "Post again". "Who can see it" has NO default and offers only what TikTok returned; the three Allow switches and the brand switch start off (TikTok's rules for direct posting — never pre-select any of them).

- [ ] **Step 2: `supabase/README.md`, section 3.** "Upload the server code (all seven functions):" becomes "(all eight functions)".

- [ ] **Step 3: `supabase/README.md`, section 11.** Keep a–f as they are except the lines named here, and add g–i.

  - The section's first paragraph becomes: "Clipy can send a video to TikTok in two ways. **Send as draft** (the default) puts it in your TikTok inbox: you open TikTok, add the caption and post it there. **Post now** posts it straight to your profile with the caption you typed in Clipy. You choose in the TikTok row's **Options**."
  - Step a.7 becomes: "Open **Content Posting API**. Make sure uploading drafts (the **video.upload** permission) is available. For **Post now**, also turn on **Direct Post** and add the **video.publish** permission (step g)."
  - In f, item 2: "There is no options button for TikTok" becomes "TikTok has an **Options** button; leave it on **Send as draft** for this checklist".
  - Add:

```markdown
### g. Post now: switch it on (once)

Do these in this order. Step 1 must be done before step 2, or connecting TikTok stops working.

1. In the TikTok developer site, with **Sandbox** selected at the top: open **Content Posting API** and turn on **Direct Post**. Under **Scopes**, add **video.publish**. Click **Apply changes**. *(Names may differ slightly.)*
2. In PowerShell, in the project folder:

   ```powershell
   npx.cmd supabase functions deploy
   ```

3. In the TikTok app on your phone: **Settings and privacy → Privacy → Private account** — switch it **on**. Until TikTok has reviewed Clipy, it only lets Clipy post to a private account.
4. In Clipy: **Post a video** → pick a clip → on the TikTok row tap **Options** → **Post now**. It says TikTok needs one more permission: tap **Reconnect** and allow everything TikTok asks for. The options open again and show "Posting to" with your TikTok name.

### h. Post now: what to expect

- **Nothing is chosen for you.** You pick who can see the post each time, and comments, duet and stitch stay off until you switch them on. That is TikTok's rule for apps that post directly.
- **Until TikTok reviews Clipy, every post is private.** Choose **Only me**. Your TikTok account must be private while you post, at most 5 accounts can post through Clipy in a day, and TikTok allows about 15 direct posts a day per account. To show a post to others later: make your account public in TikTok, then change that post to **Everyone** in TikTok.
- **The caption is sent** (up to 2200 characters). Drafts still take none.
- **No link back.** The row ends with "Posted to TikTok. It may take a few minutes to appear."
- **An account connected before this keeps working for drafts** without reconnecting.
- **None of this has run against live TikTok yet.** If a step fails, tell the developer what you saw.

| What you see | Why | What to do |
| --- | --- | --- |
| Connecting TikTok fails with an error about a **scope** or permission | Step g.1 was skipped, so TikTok does not offer **video.publish** | Do step g.1, wait a few minutes, connect again. |
| **To post directly, TikTok needs one more permission.** | TikTok was connected before Post now existed, or a permission was unticked | Tap **Reconnect** and allow everything. |
| **TikTok only lets Clipy post to private accounts for now.** | Your TikTok account is public | Do step g.3, or choose **Send as draft**. |
| **Clipy has reached TikTok's daily limit of accounts that can post.** | More than 5 accounts posted through Clipy today | Try tomorrow, or choose **Send as draft**. |
| **TikTok says this account has posted too much today.** | TikTok's daily limit for your account | Try tomorrow, or post from TikTok. |
| **TikTok no longer offers that choice of who can see it.** | You changed your account between opening the options and posting | Open the TikTok options and choose again. |
| A row ends with **check your TikTok profile before posting again** | The connection dropped at the very end, so the post may already be there | Look at your TikTok profile first. Post again only if it is not there. |

### i. First live run: Post now

After g, on your iPhone:

1. TikTok **Options** → **Post now**: "Posting to" your name and picture; under **Who can see it** only the choices TikTok gives a private account (**Followers**, **Friends**, **Only me**), none ticked; **Allow duet** and **Allow stitch** greyed out (TikTok switches them off for a private account); **Post** on the screen is disabled.
2. Choose **Only me**, close the options: the TikTok row reads "Posting to … Who can see it: Only me. By posting, you agree to TikTok's Music Usage Confirmation. It may take a few minutes to appear." Type a caption. **Post**.
3. Preparing → Uploading % → Publishing → **Done** with "Posted to TikTok. It may take a few minutes to appear." The video is on your profile, visible only to you, with your caption.
4. Tap the two links at the bottom of the options (**Music Usage Confirmation**; **Branded Content Policy** appears after switching on **Promotes a brand or product** and ticking **Branded content** with a choice other than Only me). Both must open the right TikTok page — tell the developer if one does not.
5. Switch on **Promotes a brand or product** and tick nothing: Post is disabled and the row says what is missing. Tick **Your brand**: Post is enabled again.
6. With **Only me** chosen, **Branded content** cannot be ticked; with **Branded content** ticked, **Only me** cannot be chosen.
7. Make your TikTok account public, then Post now again: Clipy says "TikTok only lets Clipy post to private accounts for now. …" and nothing is posted.
8. Switch back to **Send as draft** and post: it arrives in the TikTok inbox exactly as before.
9. On a phone that has NOT reconnected (or before step g.4): a draft still posts; Post now offers Reconnect.

Tell the developer what happened at each step, and especially: what step 1 showed, how long step 3 took, and any message that is not in the table above.
```

- [ ] **Step 4: Check.** `npm run typecheck`, `npm test` (docs only: totals unchanged by this task).

- [ ] **Step 5: Commit.** `git add AGENTS.md supabase/README.md`, message `docs(tiktok): Post now — the Posting line, the setup and first-run steps`.

---

## Deploy checklist (the owner / controller, after Task 5; nothing here is done by a task)

1. TikTok developer portal, Sandbox: Content Posting API → **Direct Post** on; scope **video.publish** added; Apply changes. **Before step 2.**
2. `npx.cmd supabase functions deploy` (eight functions; `creator-info` is new; `post-prepare` and `oauth-start` changed). No `db push`: there is no migration. No new secret.
3. TikTok app: account set to private.
4. Phone: TikTok Options → Post now → Reconnect.
5. README 11 i, steps 1–9; report against the UNVERIFIED table (spec §11): U1 (does a sandbox app post at all), U2 (does Post now load after reconnecting — the stored `scope` format), U3 (creator info with no body), U5 / U6 (the upload ends, how long until done), U8 (the two links), U12 (the sign-in page opens from the sheet).
