import { creatorInfo } from "../_shared/handlers/creatorInfo.ts";
import { serveJson } from "../_shared/runtime.ts";

export default serveJson((deps, user, body) => creatorInfo(deps, user, body));
