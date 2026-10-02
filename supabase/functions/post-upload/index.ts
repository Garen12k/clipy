// Relay mode: a binary body of at most 4 MB; headers x-session-id, x-offset, x-total.
import { readCapped } from "../_shared/body.ts";
import { json } from "../_shared/errors.ts";
import { MAX_RELAY_BYTES, postUpload } from "../_shared/handlers/postUpload.ts";
import { serveUser } from "../_shared/runtime.ts";

export default serveUser(async (deps, user, req) => {
  // Refused by Content-Length before a byte is read, and the bytes actually read are capped as well.
  const chunk = await readCapped(req, MAX_RELAY_BYTES);
  return json(await postUpload(deps, user, { sessionId: req.headers.get("x-session-id"), offset: req.headers.get("x-offset"), total: req.headers.get("x-total") }, chunk));
});