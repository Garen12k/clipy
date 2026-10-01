import type { FilterId, ShapeId, TextOverlay, TransitionType } from "./model/types";

/** A ready-made look applied in one tap (see `applyTemplate` in model/ops.ts). Data only — every id comes from the shared effects/fonts registries. */
export interface Template {
  id: TemplateId; label: string;
  /** Two hex colours for the tile preview. */
  swatch: [string, string];
  filter: FilterId; speed: number; transition: { type: TransitionType; duration: number };
  /** Style merged into existing text overlays (project scope) and used for the title. */
  text: Pick<TextOverlay, "fontId" | "color" | "outline" | "background">;
  caption: Partial<Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y">>;
  /** One title overlay at x 0.5 for the first 3 s (clamped to the project length). */
  title: { text: string; y: number; fontScale: number };
  /** One sticker for the first 3 s. */
  sticker: { emoji: string | null; shape: ShapeId | null; color: string; x: number; y: number; scale: number };
}

export const TEMPLATE_IDS = ["clean", "retro", "hype", "cinematic", "neon", "soft", "bold", "minimal"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATES: Record<TemplateId, Template> = {
  clean: {
    id: "clean", label: "Clean", swatch: ["#F4F4F5", "#9A9AA3"],
    filter: "none", speed: 1, transition: { type: "none", duration: 0 },
    text: { fontId: "montserrat", color: "#FFFFFF", outline: false, background: { color: "#000000", opacity: 0.4 } },
    caption: { fontId: "montserrat", color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false },
    title: { text: "Your title", y: 0.15, fontScale: 0.06 },
    sticker: { emoji: null, shape: "circle", color: "#FFFFFF", x: 0.85, y: 0.08, scale: 0.4 },
  },
  retro: {
    id: "retro", label: "Retro", swatch: ["#C8A05A", "#7A4E2D"],
    filter: "vintage", speed: 0.8, transition: { type: "fade", duration: 0.5 },
    text: { fontId: "lobster", color: "#FFE3A8", outline: true, background: null },
    caption: { fontId: "lobster", color: "#FFE3A8", background: null, outline: true },
    title: { text: "Retro vibes", y: 0.18, fontScale: 0.08 },
    sticker: { emoji: "📼", shape: null, color: "#F5C542", x: 0.82, y: 0.1, scale: 1 },
  },
  hype: {
    id: "hype", label: "Hype", swatch: ["#FF2D7A", "#F5C542"],
    filter: "vivid", speed: 1.5, transition: { type: "zoom", duration: 0.3 },
    text: { fontId: "bangers", color: "#F5C542", outline: true, background: null },
    caption: { fontId: "bangers", color: "#FFFFFF", background: null, outline: true, fontScale: 0.06 },
    title: { text: "Let's go!", y: 0.2, fontScale: 0.09 },
    sticker: { emoji: "🔥", shape: null, color: "#FF2D7A", x: 0.8, y: 0.32, scale: 1.2 },
  },
  cinematic: {
    id: "cinematic", label: "Cinematic", swatch: ["#0B0B0D", "#5A5A63"],
    filter: "noir", speed: 1, transition: { type: "dissolve", duration: 0.6 },
    text: { fontId: "oswald", color: "#F4F4F5", outline: false, background: null },
    caption: { fontId: "oswald", color: "#F4F4F5", background: null, outline: false, y: 0.9 },
    title: { text: "Chapter one", y: 0.5, fontScale: 0.07 },
    sticker: { emoji: null, shape: "square", color: "#000000", x: 0.5, y: 0.04, scale: 0.3 },
  },
  neon: {
    id: "neon", label: "Neon", swatch: ["#00F0FF", "#B026FF"],
    filter: "cool", speed: 1.25, transition: { type: "slide", duration: 0.4 },
    text: { fontId: "anton", color: "#00F0FF", outline: true, background: null },
    caption: { fontId: "anton", color: "#00F0FF", background: { color: "#000000", opacity: 0.5 }, outline: false },
    title: { text: "Night mode", y: 0.15, fontScale: 0.08 },
    sticker: { emoji: null, shape: "star", color: "#B026FF", x: 0.82, y: 0.3, scale: 0.6 },
  },
  soft: {
    id: "soft", label: "Soft", swatch: ["#FFD1DC", "#C9E4FF"],
    filter: "faded", speed: 1, transition: { type: "fade", duration: 0.6 },
    text: { fontId: "pacifico", color: "#FFF5F8", outline: false, background: { color: "#FF8FAB", opacity: 0.5 } },
    caption: { fontId: "pacifico", color: "#FFFFFF", background: { color: "#FF8FAB", opacity: 0.5 }, outline: false },
    title: { text: "Sweet moments", y: 0.2, fontScale: 0.07 },
    sticker: { emoji: null, shape: "heart", color: "#FF8FAB", x: 0.8, y: 0.3, scale: 0.5 },
  },
  bold: {
    id: "bold", label: "Bold", swatch: ["#FF9A3C", "#C8102E"],
    filter: "warm", speed: 1, transition: { type: "zoom", duration: 0.4 },
    text: { fontId: "anton", color: "#FFFFFF", outline: false, background: { color: "#C8102E", opacity: 0.9 } },
    caption: { fontId: "anton", color: "#FFFFFF", background: { color: "#C8102E", opacity: 0.85 }, outline: false },
    title: { text: "Big news", y: 0.18, fontScale: 0.09 },
    sticker: { emoji: null, shape: "arrow", color: "#F5C542", x: 0.2, y: 0.32, scale: 0.6 },
  },
  minimal: {
    id: "minimal", label: "Minimal", swatch: ["#FFFFFF", "#222228"],
    filter: "mono", speed: 1, transition: { type: "none", duration: 0 },
    text: { fontId: "roboto", color: "#FFFFFF", outline: false, background: null },
    caption: { fontId: "roboto", color: "#FFFFFF", background: null, outline: false, fontScale: 0.04 },
    title: { text: "Simply", y: 0.12, fontScale: 0.05 },
    sticker: { emoji: null, shape: "roundedBox", color: "#FFFFFF", x: 0.08, y: 0.06, scale: 0.2 },
  },
};

/** A random template other than `exclude` (pass the last applied id so Random always changes the look). */
export function pickRandomTemplate(exclude: TemplateId | null, rnd: () => number = Math.random): Template {
  const pool = TEMPLATE_IDS.filter((id) => id !== exclude);
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rnd() * pool.length)));
  return TEMPLATES[pool[i]];
}
