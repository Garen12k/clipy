// Public: Google's browser redirect lands here without a Supabase session (verify_jwt = false in supabase/config.toml).
import { oauthCallback } from "../_shared/handlers/oauthCallback.ts";
import { servePublic } from "../_shared/runtime.ts";

// An explicit 302 rather than Response.redirect: the target is the app's own scheme (exp:// or clipy://), not https.
export default servePublic(async (deps, req) => {
  const { redirect } = await oauthCallback(deps, new URL(req.url));
  return new Response(null, { status: 302, headers: { Location: redirect } });
});