import { oauthStart } from "../_shared/handlers/oauthStart.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => oauthStart(deps, user, body));