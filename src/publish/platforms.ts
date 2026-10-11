import type { Ionicons } from "@expo/vector-icons";
import { PLATFORM_LABELS, POST_PLATFORMS, type PostPlatform } from "@/src/editor/model/types";

export type PlatformId = PostPlatform;
export const PLATFORM_IDS = POST_PLATFORMS;
type Icon = keyof typeof Ionicons.glyphMap;
const ICONS: Record<PlatformId, Icon> = { youtube: "logo-youtube", tiktok: "logo-tiktok", instagram: "logo-instagram", facebook: "logo-facebook", x: "logo-x" };
export const PLATFORMS = Object.fromEntries(PLATFORM_IDS.map((id) => [id, { label: PLATFORM_LABELS[id], icon: ICONS[id] }])) as Record<PlatformId, { label: string; icon: Icon }>;

/**
 * Platforms Clipy knows but does not show (the owner's choice, 11 October 2026: no Facebook account). The adapters and
 * the server keep working; only the Accounts and Post rows are left out. To show one again, take it out of this list.
 */
export const HIDDEN_PLATFORMS: readonly PlatformId[] = ["facebook"];
export const isShown = (id: PlatformId) => !HIDDEN_PLATFORMS.includes(id);
