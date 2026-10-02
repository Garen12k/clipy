import type { PlatformId } from "../platforms";
import type { ClientAdapter } from "./types";
import { youtube } from "./youtube";

export type { ClientAdapter, VideoInfo } from "./types";
export const clientAdapters: Partial<Record<PlatformId, ClientAdapter>> = { youtube };
