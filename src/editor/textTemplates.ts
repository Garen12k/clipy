import { DEFAULT_TEXT_STYLE, type FontId, type OverlayAnimation, type TextOverlay, type TextStyle } from "./model/types";

/**
 * One-tap looks for a text (twenty-four) and for the auto captions (six). The colours here are user content (burned into the video),
 * not UI chrome. Every value is inside TEXT_STYLE_LIMITS / OVERLAY_LIMITS, so a patch survives the sanity rule unchanged.
 * Not to be confused with `templates.ts`, the one-tap looks for clips.
 */

/** A template REPLACES the whole look (never a merge), so tapping one after another leaves nothing behind. That includes the entrance
 *  and the loop animation: what `animation` does not name of the two is cleared. The exit animation is kept unless `animation` names one. */
export interface TextTemplatePatch {
  fontId: FontId; color: string; background: { color: string; opacity: number } | null; outline: boolean; style: TextStyle;
  animation?: Partial<OverlayAnimation>;
}
/** The style fields of every caption; position, text, timing and words are never part of a preset. */
export interface CaptionPresetPatch extends Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "highlightColor"> { style: TextStyle }

const style = (over: Partial<TextStyle> = {}): TextStyle => ({ ...DEFAULT_TEXT_STYLE, ...over });

/** The colour the spoken word gets when "Highlight spoken word" is switched on (the Karaoke preset's yellow). */
export const DEFAULT_HIGHLIGHT_COLOR = "#FFE14D";

export const TEXT_TEMPLATE_IDS = ["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant",
  "shadowed", "outlineOnly", "stickerLabel", "softGlow",
  "headline", "neonOutline", "softShadow", "note", "titleBar", "stamp", "bubblegum", "cinema", "gold", "chalk", "pop3d", "watermark"] as const;
export type TextTemplateId = (typeof TEXT_TEMPLATE_IDS)[number];

export const TEXT_TEMPLATES: Record<TextTemplateId, { label: string; patch: TextTemplatePatch }> = {
  // White, a little air between the letters, a faint soft shadow so it holds on a bright picture.
  cleanTitle: { label: "Clean title", patch: { fontId: "poppins", color: "#FFFFFF", background: null, outline: false,
    style: style({ letterSpacing: 0.02, shadow: { color: "#000000", opacity: 0.35, distance: 0.03, blur: 0.12 } }) } },
  // Heavy condensed white with a thick black edge; pops in.
  boldPop: { label: "Bold pop", patch: { fontId: "anton", color: "#FFFFFF", background: null, outline: true,
    style: style({ letterSpacing: 0.02, outlineColor: "#000000", outlineWidth: 2 }), animation: { in: { id: "pop", duration: 0.4 } } } },
  // A near-white pink tube with a wide hot-pink halo.
  neon: { label: "Neon", patch: { fontId: "righteous", color: "#FFD6F5", background: null, outline: false,
    style: style({ letterSpacing: 0.04, glow: { color: "#FF2BD6", size: 0.45 } }) } },
  subtitleBar: { label: "Subtitle bar", patch: { fontId: "montserrat", color: "#FFFFFF", background: { color: "#000000", opacity: 0.75 }, outline: false,
    style: style() } },
  // Yellow with a black edge and a hard (unblurred) black drop.
  comic: { label: "Comic", patch: { fontId: "bangers", color: "#FFE14D", background: null, outline: true,
    style: style({ letterSpacing: 0.03, outlineColor: "#000000", outlineWidth: 2.2, shadow: { color: "#000000", opacity: 1, distance: 0.08, blur: 0 } }) } },
  // Arcade yellow with a hard red drop; the pixel font needs taller lines.
  retro: { label: "Retro", patch: { fontId: "pressStart", color: "#FFD23F", background: null, outline: false,
    style: style({ lineSpacing: 1.4, shadow: { color: "#D7263D", opacity: 1, distance: 0.1, blur: 0 } }) } },
  handwritten: { label: "Handwritten", patch: { fontId: "caveat", color: "#FFFFFF", background: null, outline: false,
    style: style({ lineSpacing: 0.9, shadow: { color: "#000000", opacity: 0.55, distance: 0.04, blur: 0.15 } }) } },
  // Champagne serif, widely spaced, a quiet shadow.
  elegant: { label: "Elegant", patch: { fontId: "playfair", color: "#F7E7CE", background: null, outline: false,
    style: style({ letterSpacing: 0.08, lineSpacing: 1.15, shadow: { color: "#000000", opacity: 0.45, distance: 0.03, blur: 0.2 } }) } },
  shadowed: { label: "Shadowed", patch: { fontId: "oswald", color: "#FFFFFF", background: null, outline: false,
    style: style({ shadow: { color: "#000000", opacity: 0.85, distance: 0.1, blur: 0.18 } }) } },
  // A fill cannot be transparent, so: a dark fill inside a strong white edge.
  outlineOnly: { label: "Outline only", patch: { fontId: "bebasNeue", color: "#111111", background: null, outline: true,
    style: style({ letterSpacing: 0.05, outlineColor: "#FFFFFF", outlineWidth: 2.6 }) } },
  // Dark rounded letters on a solid yellow bar.
  stickerLabel: { label: "Sticker label", patch: { fontId: "fredoka", color: "#1B1B1F", background: { color: "#FFD23F", opacity: 1 }, outline: false,
    style: style() } },
  // Warm white with a gentle amber halo.
  softGlow: { label: "Soft glow", patch: { fontId: "roboto", color: "#FFF4D6", background: null, outline: false,
    style: style({ letterSpacing: 0.01, glow: { color: "#FFB84D", size: 0.3 } }) } },

  // ---- 2026-10-06: twelve more. They use the box fields (padding, corner) and the fonts the first twelve left out. ----
  // Heavy white letters on a solid red block with square corners: a news headline.
  headline: { label: "Headline", patch: { fontId: "anton", color: "#FFFFFF", background: { color: "#E10600", opacity: 1 }, outline: false,
    style: style({ letterSpacing: 0.04, boxPadding: 0.35, boxCorner: "square" }) } },
  // Near-black letters traced with an electric green line that glows.
  neonOutline: { label: "Neon outline", patch: { fontId: "poppins", color: "#0B0B14", background: null, outline: true,
    style: style({ letterSpacing: 0.06, outlineColor: "#39FF14", outlineWidth: 2.4, glow: { color: "#39FF14", size: 0.35 } }) } },
  // Rounded cream letters floating on a wide, soft violet shadow.
  softShadow: { label: "Soft shadow", patch: { fontId: "fredoka", color: "#FFF8E7", background: null, outline: false,
    style: style({ shadow: { color: "#3A1F5D", opacity: 0.7, distance: 0.05, blur: 0.45 } }) } },
  // Dark marker handwriting on a square yellow sticky note with wide margins.
  note: { label: "Sticky note", patch: { fontId: "permanentMarker", color: "#1B1B1F", background: { color: "#FFF27A", opacity: 1 }, outline: false,
    style: style({ lineSpacing: 1.1, boxPadding: 0.5, boxCorner: "square" }) } },
  // Condensed white text on a tight, square, dark-blue strip: a TV name strap.
  titleBar: { label: "Title bar", patch: { fontId: "oswald", color: "#FFFFFF", background: { color: "#0A1B33", opacity: 0.85 }, outline: false,
    style: style({ letterSpacing: 0.06, boxPadding: 0.15, boxCorner: "square" }) } },
  // Wide-spaced red capitals, inked thicker by an outline of their own colour, on a cream label: a rubber stamp.
  stamp: { label: "Stamp", patch: { fontId: "bebasNeue", color: "#D7263D", background: { color: "#FFF4E0", opacity: 1 }, outline: true,
    style: style({ letterSpacing: 0.12, outlineColor: "#D7263D", outlineWidth: 0.8, boxPadding: 0.2 }) } },
  // White script with a thick pink edge and a hard, darker pink drop.
  bubblegum: { label: "Bubblegum", patch: { fontId: "lobster", color: "#FFFFFF", background: null, outline: true,
    style: style({ outlineColor: "#FF4FA3", outlineWidth: 2.5, shadow: { color: "#B0005A", opacity: 1, distance: 0.07, blur: 0 } }) } },
  // Thin white letters spaced very far apart, a little see-through: film credits.
  cinema: { label: "Cinema", patch: { fontId: "montserrat", color: "#FFFFFF", background: null, outline: false,
    style: style({ opacity: 0.9, letterSpacing: 0.3, lineSpacing: 1.4 }) } },
  // Golden flowing script with a warm glow and a small brown shadow.
  gold: { label: "Gold", patch: { fontId: "dancingScript", color: "#F5C542", background: null, outline: false,
    style: style({ shadow: { color: "#5A3A00", opacity: 0.9, distance: 0.04, blur: 0.08 }, glow: { color: "#FFE9A8", size: 0.2 } }) } },
  // Chalk-white handwriting on a dark green board with round corners.
  chalk: { label: "Chalkboard", patch: { fontId: "caveat", color: "#F4F4F5", background: { color: "#1E3B2F", opacity: 0.95 }, outline: false,
    style: style({ letterSpacing: 0.03, boxPadding: 0.4 }) } },
  // White letters, a purple edge and a hard mint-green copy behind: a two-colour 3D look.
  pop3d: { label: "3D pop", patch: { fontId: "righteous", color: "#FFFFFF", background: null, outline: true,
    style: style({ outlineColor: "#6C2BD9", outlineWidth: 2, shadow: { color: "#00E5A0", opacity: 1, distance: 0.12, blur: 0 } }) } },
  // Half see-through white, widely spaced: a watermark that sits quietly on the picture.
  watermark: { label: "Watermark", patch: { fontId: "poppins", color: "#FFFFFF", background: null, outline: false,
    style: style({ opacity: 0.55, letterSpacing: 0.15, lineSpacing: 1.3 }) } },
};

export const CAPTION_PRESET_IDS = ["classicBar", "boldOutline", "yellowPop", "cleanWhite", "neonGlow", "karaoke"] as const;
export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number];

export const CAPTION_PRESETS: Record<CaptionPresetId, { label: string; patch: CaptionPresetPatch }> = {
  // The look captions are generated with (effects.ts CAPTION_STYLE).
  classicBar: { label: "Classic bar", patch: { fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false,
    style: style(), highlightColor: null } },
  boldOutline: { label: "Bold outline", patch: { fontId: "anton", fontScale: 0.055, color: "#FFFFFF", background: null, outline: true,
    style: style({ letterSpacing: 0.02, outlineColor: "#000000", outlineWidth: 2 }), highlightColor: null } },
  yellowPop: { label: "Yellow pop", patch: { fontId: "bangers", fontScale: 0.06, color: "#FFE14D", background: null, outline: true,
    style: style({ letterSpacing: 0.03, outlineColor: "#000000", outlineWidth: 1.8, shadow: { color: "#000000", opacity: 1, distance: 0.06, blur: 0 } }), highlightColor: null } },
  cleanWhite: { label: "Clean white", patch: { fontId: "poppins", fontScale: 0.045, color: "#FFFFFF", background: null, outline: false,
    style: style({ shadow: { color: "#000000", opacity: 0.7, distance: 0.04, blur: 0.15 } }), highlightColor: null } },
  neonGlow: { label: "Neon glow", patch: { fontId: "righteous", fontScale: 0.05, color: "#D6FBFF", background: null, outline: false,
    style: style({ letterSpacing: 0.03, glow: { color: "#00E5FF", size: 0.4 } }), highlightColor: null } },
  // White with a black edge; the spoken word turns yellow.
  karaoke: { label: "Karaoke", patch: { fontId: "montserrat", fontScale: 0.05, color: "#FFFFFF", background: null, outline: true,
    style: style({ outlineColor: "#000000", outlineWidth: 1.5 }), highlightColor: "#FFE14D" } },
};
