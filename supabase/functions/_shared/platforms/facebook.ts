import { isTemporaryStatus, PlatformError } from "../errors.ts";
import type { AdapterCtx, PublishResult, ServerAdapter } from "../types.ts";
import { exchangeForPages, graph, META_SECRETS, metaAuthUrl, metaIsAuthError, ruploadTarget } from "./meta.ts";

/** Page Reels permissions (https://developers.facebook.com/docs/video-api/guides/reels-publishing). */
const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const NO_ADDRESS = "Facebook did not return an upload address.";

type ReelStatus = {
  status?: {
    video_status?: unknown;
    uploading_phase?: { status?: unknown; errors?: Array<{ message?: unknown }> };
    processing_phase?: { status?: unknown; error?: { message?: unknown } };
    publishing_phase?: { status?: unknown; publish_status?: unknown; error?: { message?: unknown } };
  };
};
type Status = NonNullable<ReelStatus["status"]>;
const FAILED = ["error", "expired", "upload_failed"];
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const NO_REF = "Facebook upload reference is missing.";
const isAuth = (e: PlatformError) => e.status === 401 || metaIsAuthError(e);
/** Same status and message, but temporary (503, `platform_unavailable`): the phone keeps the upload and asks again. */
function temporary(e: PlatformError): PlatformError {
  const t = new PlatformError("facebook", 503, e.message);
  t.reason = e.reason;
  return t;
}

/**
 * Once `finish` has been accepted the Reel exists (or will) on Facebook, so only Meta's own failure report may end the post as
 * failed — anything else would let the app's Retry upload a second Reel. Meta's own report is an error/expired/upload_failed
 * `video_status`, or a phase whose `status` is "error". A Graph error from the status read itself is never that verdict: auth
 * errors stay auth errors (Reconnect), and every other one becomes temporary (Meta's words, 503), so the phone asks again.
 */
async function readReel(c: AdapterCtx, token: string, videoId: string): Promise<Status> {
  try {
    const b = await graph<ReelStatus>(c, "facebook", `/${encodeURIComponent(videoId)}`, { token, params: { fields: "status" } });
    return b.status ?? {};
  } catch (e) {
    if (!(e instanceof PlatformError) || isAuth(e) || isTemporaryStatus(e.status)) throw e;
    throw temporary(e);
  }
}

/** Meta's own failure report as a final error (400), or null when the status reports none. */
function failureOf(s: Status): PlatformError | null {
  const videoStatus = typeof s.video_status === "string" ? s.video_status : "";
  const publishStatus = s.publishing_phase?.publish_status;
  // A phase in error is final: fail now rather than poll until the wait runs out.
  const failedPhase = (["uploading_phase", "processing_phase", "publishing_phase"] as const).find((p) => s[p]?.status === "error");
  if (!FAILED.includes(videoStatus) && publishStatus !== "error" && !failedPhase) return null;
  const detail = text(s.processing_phase?.error?.message) ?? text(s.publishing_phase?.error?.message) ?? text(s.uploading_phase?.errors?.[0]?.message);
  const e = new PlatformError("facebook", 400, detail ? `Facebook couldn't process this video. ${detail}` : "Facebook couldn't process this video.");
  e.reason = FAILED.includes(videoStatus) ? videoStatus : failedPhase ? `${failedPhase}_error` : "publish_error";
  return e;
}

// The Reels guide documents no permalink field; this is the public Reel address by id. UNVERIFIED until a live post.
const done = (videoId: string): PublishResult => ({ status: "done", url: `https://www.facebook.com/reel/${encodeURIComponent(videoId)}` });

function verdict(s: Status, videoId: string): PublishResult {
  const failure = failureOf(s);
  if (failure) throw failure;
  if (s.video_status === "ready" || s.publishing_phase?.publish_status === "published") return done(videoId);
  return { status: "processing" };
}

async function reelStatus(c: AdapterCtx, token: string, ref: Record<string, unknown>): Promise<PublishResult> {
  // Asking again cannot repair a missing reference: final, so the phone starts afresh.
  if (typeof ref.videoId !== "string" || !ref.videoId) throw new PlatformError("facebook", 502, NO_REF, "platform_error");
  return verdict(await readReel(c, token, ref.videoId), ref.videoId);
}

/**
 * `finish` failed (not an auth error). As with Instagram's publish, a refused `finish` is never final on its own: an earlier
 * `finish` may have been accepted with its answer lost (a request the phone gave up on, then Resume), and that is
 * indistinguishable from a refusal — Meta even reports publishing as "not_started" while an accepted Reel is still processing.
 * So look once: Meta's own failure report is final; a published or ready Reel is done; everything else (not_started,
 * processing, nothing either way, or the look failed) is temporary with the finish error's words, so the phone offers Resume
 * (check again), never "upload again".
 */
async function afterRefusedFinish(c: AdapterCtx, token: string, videoId: string, finishError: PlatformError): Promise<PublishResult> {
  let s: Status;
  try { s = await readReel(c, token, videoId); } catch (e) {
    if (e instanceof PlatformError && isAuth(e)) throw e;
    throw temporary(finishError);
  }
  const failure = failureOf(s);
  if (failure) throw failure;
  if (s.publishing_phase?.publish_status === "published" || s.video_status === "ready") return done(videoId);
  throw temporary(finishError);
}

export const facebook: ServerAdapter = {
  id: "facebook",
  secrets: META_SECRETS,

  authUrl: (c, { state }) => metaAuthUrl(c, state, SCOPES),
  async exchange(c, { code }) {
    const pages = await exchangeForPages(c, "facebook", code);
    const page = pages.find((p) => p.tasks.includes("CREATE_CONTENT"));
    if (!page) throw new PlatformError("facebook", 400, "No Facebook Page you can post to was found. Create a Page (or pick it in the Facebook dialog) and connect again.");
    // A Page token from a long-lived user token does not expire, so there is nothing to refresh.
    return { accessToken: page.accessToken, refreshToken: null, expiresAt: null, scopes: SCOPES.join(",") };
  },
  async refresh() { throw new PlatformError("facebook", 401, "Reconnect Facebook in Accounts."); },
  // A Page token cannot withdraw the user's grant; the README says how to remove the app in Facebook settings.
  async revoke() {},
  async profile(c, token) {
    // With a Page token, "me" is the Page.
    const b = await graph<{ id?: unknown; name?: unknown; picture?: { data?: { url?: unknown } } }>(c, "facebook", "/me", { token, params: { fields: "id,name,picture{url}" } });
    const id = text(b.id);
    if (!id) throw new PlatformError("facebook", 502, "Facebook did not return the Page.");
    return { accountId: id, displayName: text(b.name) ?? "Facebook Page", avatarUrl: text(b.picture?.data?.url) };
  },
  async prepare(c, token, input) {
    const me = await graph<{ id?: unknown }>(c, "facebook", "/me", { token, params: { fields: "id" } });
    const pageId = text(me.id);
    if (!pageId) throw new PlatformError("facebook", 502, "Facebook did not return the Page.");
    const r = await graph<{ video_id?: unknown; upload_url?: unknown }>(c, "facebook", `/${encodeURIComponent(pageId)}/video_reels`, { method: "POST", token, params: { upload_phase: "start" } });
    const videoId = text(r.video_id);
    if (!videoId || !text(r.upload_url)) throw new PlatformError("facebook", 502, NO_ADDRESS);
    // The headers carry the Page token: only ever for Meta's own upload host, and only the checked (canonical) address is used from here on.
    const { uploadUrl, uploadHeaders } = ruploadTarget(token, input.fileSize, r.upload_url, "facebook");
    // One request carries the whole file (the only form Meta documents), so the chunk is the file.
    return { protocol: "meta-rupload", uploadUrl, uploadHeaders, chunkSize: input.fileSize, ref: { videoId, pageId }, wait: { maxSeconds: 300, intervalSeconds: 10, resumeOnTimeout: false } };
  },
  async finalize(c, token, { ref, input }) {
    if (typeof ref.videoId !== "string" || !ref.videoId || typeof ref.pageId !== "string" || !ref.pageId) throw new PlatformError("facebook", 502, NO_REF, "platform_error");
    const videoId = ref.videoId;
    try {
      await graph(c, "facebook", `/${encodeURIComponent(ref.pageId)}/video_reels`, {
        method: "POST", token, params: { video_id: videoId, upload_phase: "finish", video_state: "PUBLISHED", description: input.caption },
      });
    } catch (e) {
      if (!(e instanceof PlatformError) || isAuth(e)) throw e;
      return afterRefusedFinish(c, token, videoId, e);
    }
    // `finish` was accepted: the Reel is on its way. A status read that fails (other than auth) is not a verdict on the video,
    // so answer "processing" and let the session's polling read it again; finish is never sent twice from here.
    let s: Status;
    try { s = await readReel(c, token, videoId); } catch (e) {
      if (e instanceof PlatformError && isAuth(e)) throw e;
      return { status: "processing" };
    }
    return verdict(s, videoId);
  },
  status: (c, token, ref) => reelStatus(c, token, ref),
  isAuthError: metaIsAuthError,
};
