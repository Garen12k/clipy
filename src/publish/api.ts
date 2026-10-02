import type { PlatformId } from "./platforms";
import { backendKey, backendUrl, getSupabase } from "./supabase";

export class ApiFailure extends Error { constructor(public code: string, message: string) { super(message); } }
export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }
export type UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks" | "meta-rupload";
/**
 * What `post-prepare` returns. For `meta-rupload` the headers hold a Meta token: this object lives in memory only, for this post —
 * never log it, store it or put it in a message.
 */
export interface Prepared {
  sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number;
  /** How long to keep polling after finalize, how many seconds apart, and whether running out of time means "tap Resume" rather than "done". */
  wait?: { maxSeconds: number; intervalSeconds?: number; resumeOnTimeout: boolean };
}
export type PublishResult = { status: "done"; url: string | null } | { status: "processing" };

const UNREACHABLE = "Clipy's server is asleep or unreachable. Open the Supabase dashboard to wake it, then try again.";

type Init = { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; json?: unknown; bytes?: Uint8Array; headers?: Record<string, string>; signal?: AbortSignal };

async function call<T>(name: string, init: Init = {}): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) throw new ApiFailure("not_configured", "Posting isn't set up yet.");
  let session: { access_token: string } | null = null;
  let sessionError = false;
  try {
    const r = await supabase.auth.getSession();
    session = r.data.session;
    sessionError = !!r.error;
  } catch {
    sessionError = true;
  }
  if (!session) {
    if (sessionError) throw new ApiFailure("unreachable", UNREACHABLE);
    throw new ApiFailure("signed_out", "Sign in to Clipy first.");
  }
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/functions/v1/${name}${qs}`, {
      method: init.method ?? (init.json !== undefined || init.bytes ? "POST" : "GET"),
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: backendKey()!, ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
      // React Native's fetch accepts typed arrays at runtime, but its BodyInit type does not list them.
      body: (init.bytes ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined)) as BodyInit | undefined,
      signal: init.signal,
    });
  } catch {
    throw new ApiFailure("unreachable", UNREACHABLE);
  }
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!res.ok) throw new ApiFailure(body?.code ?? "internal", body?.message ?? "Something went wrong.");
  if (body === null) throw new ApiFailure("internal", "Something went wrong.");
  return body as T;
}

export const api = {
  accounts: async () => (await call<{ platforms: PlatformStatus[] }>("accounts")).platforms,
  disconnect: async (platform: PlatformId) => { await call("accounts", { method: "DELETE", query: { platform } }); },
  oauthStart: async (platform: PlatformId, returnUrl: string) => (await call<{ authUrl: string }>("oauth-start", { json: { platform, returnUrl } })).authUrl,
  prepare: (body: { platform: PlatformId; fileSize: number; durationSec: number; mimeType: string; caption: string; options: Record<string, unknown> }) => call<Prepared>("post-prepare", { json: body }),
  uploadChunk: (sessionId: string, offset: number, total: number, bytes: Uint8Array, signal?: AbortSignal) =>
    call<{ nextOffset: number }>("post-upload", { bytes, signal, headers: { "Content-Type": "application/octet-stream", "x-session-id": sessionId, "x-offset": String(offset), "x-total": String(total) } }),
  finalize: (sessionId: string, clientResult: string | null) => call<PublishResult>("post-finalize", { json: { sessionId, clientResult } }),
  status: (sessionId: string) => call<PublishResult>("post-status", { json: { sessionId } }),
};
