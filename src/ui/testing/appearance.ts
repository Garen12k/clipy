import { screen } from "@testing-library/react-native";
import { showAppearance, theme, type AppAppearance } from "@/src/theme/theme";

/**
 * Test helpers for the two appearances (never imported by the app).
 *
 * `wear` puts the screens in an appearance the way the phone's setting does — AFTER every module has loaded, so a colour that was
 * read when a module loaded (a constant, a static style) is still the dark one and `leftovers` finds it.
 */
export function wear(appearance: AppAppearance): void {
  showAppearance(appearance);
}

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
const D = theme.screens.dark, E = theme.surfaces.editor;
/** A surface a cream screen must not be: any step of the navy family or of the editor's slate. */
const NOT_A_SURFACE = new Set<string>([D.page, D.bar, D.tile, D.lifted, D.picked, D.separator, E.page, E.bar, E.tile, E.lifted, E.picked, E.separator]);
/**
 * An ink a cream screen must not use: white text and the dark muted label, the BRIGHT gold (on cream it is a fill, never ink), the
 * dark reds, the navy separator and the navy steps as a border. Navy itself is not here: it is the text on cream.
 */
const NOT_AN_INK = new Set<string>([D.text, D.muted, D.accentInk, D.dangerText, D.danger, D.separator, D.bar, D.tile, D.lifted, D.picked, E.muted, E.separator]);
const INK = /^(color|tintColor|stroke|fill|placeholderTextColor|border\w*Color)$/;

function flat(style: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(style)) for (const s of style) flat(s, out);
  else if (style && typeof style === "object") Object.assign(out, style);
  return out;
}

/**
 * Every colour on screen that belongs to the DARK appearance (or to the editor): a navy or slate surface, white or bright-gold ink.
 * Empty on a screen that is truly light. `onPicture`: test ids whose words sit on a photo or a scrim and stay light in both
 * appearances (a cover's title, its length); the compass's red needle is the mark's own red in both.
 */
export function leftovers({ onPicture = [] }: { onPicture?: string[] } = {}): string[] {
  const found: string[] = [];
  const skip = new Set([...onPicture, "compass-needle"]);
  const walk = (node: Json | string | null, path: string) => {
    if (!node || typeof node === "string") return;
    const id = typeof node.props.testID === "string" ? node.props.testID : null;
    if (id && skip.has(id)) return;
    const here = `${path}/${node.type}${id ? `#${id}` : ""}`;
    const values = { ...node.props, ...flat(node.props.style) };
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== "string") continue;
      if (key === "backgroundColor" && NOT_A_SURFACE.has(value)) found.push(`${here} ${key} ${value}`);
      if (INK.test(key) && NOT_AN_INK.has(value)) found.push(`${here} ${key} ${value}`);
    }
    for (const child of node.children ?? []) walk(child, here.length > 90 ? `…${here.slice(-60)}` : here);
  };
  const tree = screen.toJSON() as Json | Json[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) walk(top, "");
  return found;
}

/** Whether any view on screen has this background (the page, a card …). */
export function hasSurface(color: string): boolean {
  let seen = false;
  const walk = (node: Json | string | null) => {
    if (!node || typeof node === "string" || seen) return;
    if (flat(node.props.style).backgroundColor === color) { seen = true; return; }
    for (const child of node.children ?? []) walk(child);
  };
  const tree = screen.toJSON() as Json | Json[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) walk(top);
  return seen;
}
