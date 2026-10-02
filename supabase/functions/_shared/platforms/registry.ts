import type { PlatformId, ServerAdapter } from "../types.ts";
import { facebook } from "./facebook.ts";
import { tiktok } from "./tiktok.ts";
import { youtube } from "./youtube.ts";

/** One entry per platform that has a server adapter. Plans 4C–4D add instagram and x. */
export const adapters: Partial<Record<PlatformId, ServerAdapter>> = { youtube, tiktok, facebook };
