import type { ExportFps, ExportQuality, ExportSettings } from "@/src/editor/model/types";
import type { IconName } from "@/src/ui/Icon";
import { QUALITY_LABELS, RESOLUTIONS, type Resolution } from "./estimate";

/**
 * Export presets: three shortcuts that set the Export screen's three controls (Resolution, Frame rate, Quality) in one tap.
 * Data and pure functions only. NOTHING IS STORED for a preset: which tile is picked is worked out from the controls' current
 * values (`pickedPreset`), so a change made by hand un-picks it, and a hand-made match picks it. The three VALUES are remembered with the
 * project (`ExportSettings`), which is why a picked tile is picked again when the sheet is opened again.
 */
export const PRESET_IDS = ["social", "message", "best"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
/** The three values a preset sets — what the three controls hold. */
export type PresetValues = { res: Resolution; fps: ExportFps; quality: ExportQuality };

export const PRESETS: Record<PresetId, { label: string; icon: IconName; hint: string }> = {
  social: { label: "Social", icon: "paper-plane-outline", hint: "For TikTok, Reels, Shorts and X" },
  message: { label: "Message", icon: "chatbubble-outline", hint: "A small file for WhatsApp, email and chat" },
  best: { label: "Best", icon: "sparkles-outline", hint: "The highest quality this project can export" },
};

/**
 * The quality in ONE short word, for a tile's small line only: a tile is about 109 pt wide on a 375-pt phone and its line must stay one row
 * (at most 18 characters, pinned in presets.test.ts). The control and VoiceOver keep the full words (`QUALITY_LABELS`).
 */
export const QUALITY_SHORT: Record<ExportQuality, string> = { high: "High", small: "Small" };

/** A frame rate as the Frame rate control writes it. */
export const fpsLabel = (fps: ExportFps): string => `${fps} fps`;

/** What a preset sets. Only Best looks at the project: 4K when it can export 4K (`canExport4K`), else 1080p. */
export function presetValues(id: PresetId, has4K: boolean): PresetValues {
  if (id === "message") return { res: 720, fps: 30, quality: "small" };
  if (id === "best") return { res: has4K ? 2160 : 1080, fps: 30, quality: "high" };
  return { res: 1080, fps: 30, quality: "high" };
}

/**
 * The tiles of the row, in order. Without 4K, Best would set exactly what Social sets (1080p · 30 · High), so it is NOT SHOWN:
 * the row is two tiles then — never two picked tiles, never a dead one.
 */
export const presetsShown = (has4K: boolean): PresetId[] => (has4K ? [...PRESET_IDS] : PRESET_IDS.filter((id) => id !== "best"));

/** The shown preset whose three values are the current ones, or null. Derived on every draw, never remembered. */
export function pickedPreset(res: Resolution, settings: ExportSettings, has4K: boolean): PresetId | null {
  return presetsShown(has4K).find((id) => {
    const v = presetValues(id, has4K);
    return v.res === res && v.fps === settings.fps && v.quality === settings.quality;
  }) ?? null;
}

const resLabel = (res: Resolution): string => RESOLUTIONS.find((r) => r.value === res)?.label ?? "";
/** A tile's small second line, from the values themselves, in short words so it stays one row: "1080p · 30 · High", "720p · 30 · Small". */
export const presetLine = (v: PresetValues): string => [resLabel(v.res), String(v.fps), QUALITY_SHORT[v.quality]].join(" · ");
/** What VoiceOver reads for a tile: its name, then its settings in the controls' own words. */
export const presetLabel = (id: PresetId, has4K: boolean): string => {
  const v = presetValues(id, has4K);
  return [PRESETS[id].label, resLabel(v.res), fpsLabel(v.fps), QUALITY_LABELS[v.quality]].join(", ");
};
