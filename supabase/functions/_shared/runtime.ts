// Deno-only glue shared by every function's index.ts. Not unit-tested (no Deno here); keep it tiny.
// Auth and the admin client come from @supabase/server, as https://supabase.com/docs/guides/functions/auth shows today.
import { createSupabaseContext } from "npm:@supabase/server@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readCapped } from "./body.ts";
import { importKey } from "./crypto.ts";
import { ApiError, json, toResponse } from "./errors.ts";
import { adapters } from "./platforms/registry.ts";
import { supabaseDb } from "./supabaseDb.ts";
import type { Deps } from "./types.ts";

/** JSON bodies here are a few hundred bytes; anything bigger is not ours. */
const MAX_JSON_BYTES = 64 * 1024;

function makeDeps(admin: SupabaseClient): Deps {
  let key: Promise<CryptoKey> | null = null;
  return {
    db: supabaseDb(admin), env: { get: (n: string) => Deno.env.get(n) }, fetch, now: () => new Date(), adapters,
    key: () => (key ??= importKey(Deno.env.get("TOKEN_ENC_KEY") ?? "")),
    callbackUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`,
  };
}

/**
 * Verifies the caller and builds the admin client in one step.
 * `user`: the Authorization header must carry a valid Supabase session JWT — this check is authoritative
 * (the platform's verify_jwt is only a first gate and can be switched off without weakening anything).
 * `none`: anyone may call (oauth-callback, reached by the platform's browser redirect).
 */
async function context(req: Request, auth: "user" | "none"): Promise<{ deps: Deps; user: string | null }> {
  const { data, error } = await createSupabaseContext(req, { auth });
  if (error || !data) {
    const status = (error as { status?: number } | null)?.status ?? 401;
    if (status >= 500) { console.error("supabase context failed", (error as { code?: string } | null)?.code ?? ""); throw new ApiError(500, "internal", "Something went wrong."); }
    throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");
  }
  const user = data.userClaims?.id ?? (data.jwtClaims?.sub as string | undefined) ?? null;
  if (auth === "user" && !user) throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");
  return { deps: makeDeps(data.supabaseAdmin as SupabaseClient), user };
}

/** A signed-in route that handles the raw request itself (post-upload). */
export function serveUser(handle: (deps: Deps, user: string, req: Request) => Promise<Response>) {
  return {
    async fetch(req: Request): Promise<Response> {
      try { const { deps, user } = await context(req, "user"); return await handle(deps, user!, req); }
      catch (e) { return toResponse(e); }
    },
  };
}

/** A signed-in JSON route: auth → parse (GET/DELETE have no body) → handle → JSON. */
export function serveJson(handle: (deps: Deps, user: string, body: unknown, req: Request) => Promise<unknown>) {
  return serveUser(async (deps, user, req) => {
    let body: unknown = null;
    if (req.method !== "GET" && req.method !== "DELETE") {
      try { body = JSON.parse(new TextDecoder().decode(await readCapped(req, MAX_JSON_BYTES, "Request is too large."))); } catch (e) { if (e instanceof ApiError) throw e; body = null; }
    }
    return json(await handle(deps, user, body, req));
  });
}

/** A public route (no sign-in). */
export function servePublic(handle: (deps: Deps, req: Request) => Promise<Response>) {
  return {
    async fetch(req: Request): Promise<Response> {
      try { const { deps } = await context(req, "none"); return await handle(deps, req); }
      catch (e) { return toResponse(e); }
    },
  };
}
