import type { PlatformId, ServerAdapter } from "../types.ts";
import { youtube } from "./youtube.ts";

/** One entry per platform that has a server adapter. Plans 4B–4D add tiktok, instagram, facebook and x. */
export const adapters: Partial<Record<PlatformId, ServerAdapter>> = { youtube };
