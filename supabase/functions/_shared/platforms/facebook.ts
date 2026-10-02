import { PlatformError } from "../errors.ts";
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
const FAILED = ["error", "expired", "upload_failed"];
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function reelStatus(c: AdapterCtx, token: string, ref: Record<string, unknown>): Promise<PublishResult> {
  // Asking again cannot repair a missing reference: final, so the phone starts afresh.
  if (typeof ref.videoId !== "string" || !ref.videoId) throw new PlatformError("facebook", 502, "Facebook upload reference is missing.", "platform_error");
  const b = await graph<ReelStatus>(c, "facebook", `/${encodeURIComponent(ref.videoId)}`, { token, params: { fields: "status" } });
  const s = b.status ?? {};
  const videoStatus = typeof s.video_status === "string" ? s.video_status : "";
  const publishStatus = s.publishing_phase?.publish_status;
  // A phase in error is final: fail now rather than poll until the wait runs out.
  const failedPhase = (["uploading_phase", "processing_phase", "publishing_phase"] as const).find((p) => s[p]?.status === "error");
  if (FAILED.includes(videoStatus) || publishStatus === "error" || failedPhase) {
    const detail = text(s.processing_phase?.error?.message) ?? text(s.publishing_phase?.error?.message) ?? text(s.uploading_phase?.errors?.[0]?.message);
    const e = new PlatformError("facebook", 400, detail ? `Facebook couldn't process this video. ${detail}` : "Facebook couldn't process this video.");
    e.reason = FAILED.includes(videoStatus) ? videoStatus : failedPhase ? `${failedPhase}_error` : "publish_error";
    throw e;
  }
  // The Reels guide documents no permalink field; this is the public Reel address by id. UNVERIFIED until a live post.
  if (videoStatus === "ready" || publishStatus === "published") return { status: "done", url: `https://www.facebook.com/reel/${encodeURIComponent(ref.videoId)}` };
  return { status: "processing" };
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
    return { protocol: "meta-rupload", uploadUrl, uploadHeaders, chunkSize: input.fileSize, ref: { videoId, pageId }, wait: { maxSeconds: 300, resumeOnTimeout: false } };
  },
  async finalize(c, token, { ref, input }) {
    if (typeof ref.videoId !== "string" || !ref.videoId || typeof ref.pageId !== "string" || !ref.pageId) throw new PlatformError("facebook", 502, "Facebook upload reference is missing.", "platform_error");
    await graph(c, "facebook", `/${encodeURIComponent(ref.pageId)}/video_reels`, {
      method: "POST", token, params: { video_id: ref.videoId, upload_phase: "finish", video_state: "PUBLISHED", description: input.caption },
    });
    return reelStatus(c, token, ref);
  },
  status: (c, token, ref) => reelStatus(c, token, ref),
  isAuthError: metaIsAuthError,
};
