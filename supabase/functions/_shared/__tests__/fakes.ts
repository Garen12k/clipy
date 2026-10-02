import { importKey } from "../crypto.ts";
import { memoryDb } from "../memoryDb.ts";
import type { Deps, PrepareInput, ServerAdapter, Tokens } from "../types.ts";

export const TEST_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
export const USER = "11111111-1111-1111-1111-111111111111";
export const INPUT: PrepareInput = { fileSize: 20_000_000, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} };

export function tokens(over: Partial<Tokens> = {}): Tokens {
  return { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: "2026-10-02T11:00:00.000Z", scopes: "upload", ...over };
}

/** A scriptable adapter: every method is a jest.fn with a sensible default. */
export function fakeAdapter(over: Partial<ServerAdapter> = {}): ServerAdapter {
  return {
    id: "youtube", secrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    authUrl: jest.fn((_c, p) => `https://platform.test/auth?state=${p.state}`),
    exchange: jest.fn(async () => tokens()),
    refresh: jest.fn(async () => tokens({ accessToken: "access-2", refreshToken: null, expiresAt: "2026-10-02T12:00:00.000Z" })),
    revoke: jest.fn(async () => {}),
    profile: jest.fn(async () => ({ accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img.test/a.jpg" })),
    prepare: jest.fn(async () => ({ protocol: "google-resumable" as const, uploadUrl: "https://upload.test/session", uploadHeaders: {}, chunkSize: 8388608, ref: { k: 1 } })),
    finalize: jest.fn(async () => ({ status: "done" as const, url: "https://youtu.be/abc123XYZ_-" })),
    status: jest.fn(async () => ({ status: "done" as const, url: null })),
    ...over,
  };
}

export function fakeDeps(over: Partial<Deps> = {}): Deps {
  const env = new Map<string, string>([["YOUTUBE_CLIENT_ID", "cid"], ["YOUTUBE_CLIENT_SECRET", "secret"]]);
  return {
    db: memoryDb(), env: { get: (n) => env.get(n) }, fetch: jest.fn() as unknown as typeof fetch,
    now: () => new Date("2026-10-02T10:00:00.000Z"), key: () => importKey(TEST_KEY),
    adapters: { youtube: fakeAdapter() }, callbackUrl: "https://ref.supabase.co/functions/v1/oauth-callback",
    ...over,
  };
}
