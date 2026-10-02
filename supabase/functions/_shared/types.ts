import type { PlatformError } from "./errors.ts";

export const PLATFORM_IDS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export interface Env { get(name: string): string | undefined }
export interface Tokens { accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string }
export interface Profile { accountId: string; displayName: string; avatarUrl: string | null }
export interface PrepareInput { fileSize: number; durationSec: number; mimeType: string; caption: string; options: Record<string, unknown> }
export type UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks";
export interface PrepareResult { protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number; ref: Record<string, unknown> }
export type PublishResult = { status: "done"; url: string | null } | { status: "processing" };
export interface AdapterCtx { fetch: typeof fetch; env: Env; redirectUri: string }
export interface ServerAdapter {
  id: PlatformId;
  secrets: readonly string[];
  authUrl(ctx: AdapterCtx, p: { state: string; codeChallenge: string }): string;
  exchange(ctx: AdapterCtx, p: { code: string; codeVerifier: string }): Promise<Tokens>;
  /** A null refreshToken in the result means "keep the old one". */
  refresh(ctx: AdapterCtx, refreshToken: string): Promise<Tokens>;
  revoke(ctx: AdapterCtx, tokens: { accessToken: string; refreshToken: string | null }): Promise<void>;
  profile(ctx: AdapterCtx, accessToken: string): Promise<Profile>;
  prepare(ctx: AdapterCtx, accessToken: string, input: PrepareInput): Promise<PrepareResult>;
  relayChunk?(ctx: AdapterCtx, accessToken: string, ref: Record<string, unknown>, chunk: { offset: number; total: number; body: Uint8Array }): Promise<{ nextOffset: number; ref?: Record<string, unknown> }>;
  finalize(ctx: AdapterCtx, accessToken: string, s: { ref: Record<string, unknown>; input: PrepareInput; clientResult: string | null; account: Profile }): Promise<PublishResult>;
  status(ctx: AdapterCtx, accessToken: string, ref: Record<string, unknown>): Promise<PublishResult>;
  /** True when a platform error (besides a 401) means the grant itself is not enough, e.g. a permission was not given: the account must be reconnected. */
  isAuthError?(e: PlatformError): boolean;
}
export interface AccountRow { userId: string; platform: PlatformId; accountId: string; displayName: string; avatarUrl: string | null; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: string | null; scopes: string; meta: Record<string, unknown> }
export interface OAuthStateRow { state: string; userId: string; platform: PlatformId; codeVerifier: string; returnUrl: string; expiresAt: string }
/** `publishing` = a finalize call is in flight. If the function process dies mid-finalize the session stays `publishing`; the app's Retry opens a fresh session. */
export type SessionStatus = "uploading" | "publishing" | "processing" | "done" | "failed";
export interface PostSessionRow { id: string; userId: string; platform: PlatformId; ref: Record<string, unknown>; input: PrepareInput; status: SessionStatus; url: string | null; error: string | null }
export interface Db {
  getAccount(userId: string, platform: PlatformId): Promise<AccountRow | null>;
  listAccounts(userId: string): Promise<AccountRow[]>;
  upsertAccount(row: AccountRow): Promise<void>;
  deleteAccount(userId: string, platform: PlatformId): Promise<void>;
  putState(row: OAuthStateRow): Promise<void>;
  /** Returns the row and deletes it (single use). */
  takeState(state: string): Promise<OAuthStateRow | null>;
  createSession(row: Omit<PostSessionRow, "id">): Promise<string>;
  getSession(id: string): Promise<PostSessionRow | null>;
  updateSession(id: string, patch: Partial<Pick<PostSessionRow, "ref" | "status" | "url" | "error">>): Promise<void>;
  /** Atomically moves a session from one status to another; false when it was not in `from`. */
  claimSession(id: string, from: SessionStatus, to: SessionStatus, patch?: { url?: string | null; error?: string | null }): Promise<boolean>;
}
export interface Deps {
  db: Db; env: Env; fetch: typeof fetch; now(): Date; key(): Promise<CryptoKey>;
  adapters: Partial<Record<PlatformId, ServerAdapter>>;
  /** The public HTTPS URL of the oauth-callback function, registered on every platform. */
  callbackUrl: string;
}

export function isPlatformId(v: unknown): v is PlatformId { return (PLATFORM_IDS as readonly unknown[]).includes(v); }
export function adapterCtx(deps: Deps): AdapterCtx { return { fetch: deps.fetch, env: deps.env, redirectUri: deps.callbackUrl }; }
export function availableAdapter(deps: Deps, platform: PlatformId): ServerAdapter | null {
  const a = deps.adapters[platform];
  return a && a.secrets.every((s) => !!deps.env.get(s)) ? a : null;
}
