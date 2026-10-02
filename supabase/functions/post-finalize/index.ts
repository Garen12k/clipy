import { postFinalize } from "../_shared/handlers/postFinalize.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => postFinalize(deps, user, body));