import { ApiError } from "../_shared/errors.ts";
import { appleCodeOf, deleteAccount, REVOKE_BUDGET_MS } from "../_shared/handlers/deleteAccount.ts";
import { serveJson } from "../_shared/runtime.ts";

// The user is the one in the verified token; of the body only Apple's authorization code is read (appleCodeOf).
export default serveJson((deps, user, body, req) => {
  if (req.method !== "POST") throw new ApiError(405, "bad_request", "Use POST.");
  return deleteAccount(deps, user, REVOKE_BUDGET_MS, appleCodeOf(body));
});
