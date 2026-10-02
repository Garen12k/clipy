import { disconnect, listAccounts } from "../_shared/handlers/accounts.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, _body, req) =>
  req.method === "DELETE" ? disconnect(deps, user, new URL(req.url).searchParams.get("platform")) : listAccounts(deps, user));