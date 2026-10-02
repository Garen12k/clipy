import { postStatus } from "../_shared/handlers/postStatus.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => postStatus(deps, user, body));