import { postPrepare } from "../_shared/handlers/postPrepare.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => postPrepare(deps, user, body));