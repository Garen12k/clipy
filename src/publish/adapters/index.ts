import type { PlatformId } from "../platforms";
import { tiktok } from "./tiktok";
import type { ClientAdapter } from "./types";
import { youtube } from "./youtube";

export type { ClientAdapter, VideoInfo } from "./types";
export const clientAdapters: Partial<Record<PlatformId, ClientAdapter>> = { youtube, tiktok };
