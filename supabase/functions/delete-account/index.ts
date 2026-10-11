import { ApiError } from "../_shared/errors.ts";
import { deleteAccount } from "../_shared/handlers/deleteAccount.ts";
import { serveJson } from "../_shared/runtime.ts";

// The user is the one in the verified token; the body is not read by the handler.
export default serveJson((deps, user, _body, req) => {
  if (req.method !== "POST") throw new ApiError(405, "bad_request", "Use POST.");
  return deleteAccount(deps, user);
});
