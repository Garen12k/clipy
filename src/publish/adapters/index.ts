import type { PlatformId } from "../platforms";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import type { ClientAdapter } from "./types";
import { youtube } from "./youtube";

export type { ClientAdapter, VideoInfo } from "./types";
export const clientAdapters: Partial<Record<PlatformId, ClientAdapter>> = { youtube, tiktok, instagram, facebook };
