import type { PlatformId, ServerAdapter } from "../types.ts";
import { facebook } from "./facebook.ts";
import { instagram } from "./instagram.ts";
import { tiktok } from "./tiktok.ts";
import { youtube } from "./youtube.ts";

/** One entry per platform that has a server adapter. Plan 4D adds x. */
export const adapters: Partial<Record<PlatformId, ServerAdapter>> = { youtube, tiktok, facebook, instagram };
