import { textLookOf, type TextLook } from "@/src/editor/model/ops";
import { activePhotoMotion, clampTextStyle, FILTER_IDS, FONT_IDS, isHexColor, isPhoto, makeOverlay, OVERLAY_LIMITS, PHOTO_MOTION_IDS, TRANSITION_LIMITS, TRANSITION_TYPES,
  type Align, type FilterId, type FontId, type PhotoMotionId, type Project, type TransitionType } from "@/src/editor/model/types";
import { BUNDLED_BEATS, bundledTrackOf } from "@/src/editor/musicBeats";
import { isSafeName } from "./projectFile";
import { markerStep, type QuickPlan, type StyleTitle } from "./quickEdit";

// The owner's own Quick Edit styles (docs/superpowers/specs/2026-10-16-my-styles-design.md). Pure: what a style is, how one is read
// from a project, how it becomes the plan `buildQuickEdit` reads, and the file's text. Storage is styleStore.ts.

export const STYLES = { version: 1, max: 20, nameMax: 40, minBeats: 4, maxBeats: 2000, maxTitle: 500 } as const;
/** A user style's pace in seconds, turned into marker steps by `paceFor`: the middle of what the six built-in styles give. */
export const USER_PACE = { photoSeconds: 2.5, videoSeconds: 5, most: 16 } as const;

export type StyleMusic = { kind: "bundled"; trackId: string } | { kind: "own"; file: string; title: string; durationSec: number; beats: number[] };
export type DraftMusic = { kind: "bundled"; trackId: string } | { kind: "own"; sourceUri: string; title: string; durationSec: number; beats: number[] };
export interface UserStyle {
  id: string; name: string; createdAt: string;
  /** null = no music. An own file is a NAME in the styles' media folder, never a uri (iOS may move the app's container). */
  music: StyleMusic | null;
  filter: FilterId | null; filterIntensity: number;
  transition: { type: TransitionType; duration: number };
  title: StyleTitle | null;
  motions: PhotoMotionId[]; motionStrength: number;
}
export type StyleDraft = Omit<UserStyle, "id" | "name" | "createdAt" | "music"> & { music: DraftMusic | null };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown, d: number, lo: number, hi: number) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : d);
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");
/** The most common key, a tie going to the one met first; null for none. */
function mostCommon<T>(keys: readonly T[]): T | null {
  const count = new Map<T, number>();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  let best: T | null = null, most = 0;
  for (const [k, n] of count) if (n > most) { best = k; most = n; }   // Map keeps first-met order, so `>` keeps the first of a tie
  return best;
}

/** The style a project makes (spec §3). Pure; the own music's file is copied by the store. */
export function styleFromProject(p: Project): StyleDraft {
  const songs = p.audioTracks.filter((t) => t.kind === "music");
  const sounds = (t: (typeof songs)[number]) => t.trimEnd - t.trimStart;
  const song = songs.reduce<(typeof songs)[number] | null>((best, t) => (!best || sounds(t) > sounds(best) || (sounds(t) === sounds(best) && t.start < best.start) ? t : best), null);
  let music: DraftMusic | null = null;
  if (song) {
    const bundled = bundledTrackOf(song);
    if (bundled) music = { kind: "bundled", trackId: bundled.id };
    else {
      const end = song.start + sounds(song);
      const inside = p.beatMarkers.filter((m) => m >= song.start - 1e-9 && m <= end + 1e-9).map((m) => r3(song.trimStart + (m - song.start)));
      music = { kind: "own", sourceUri: song.sourceUri, title: song.title, durationSec: song.sourceDuration, beats: inside.length >= STYLES.minBeats ? inside : [] };
    }
  }
  const filterKey = mostCommon(p.clips.map((c) => c.filter ?? "none"));
  const filter = filterKey === null || filterKey === "none" ? null : filterKey;
  const filterIntensity = filter === null ? 1 : p.clips.find((c) => c.filter === filter)!.filterIntensity;
  const cuts = p.clips.slice(0, -1).map((c) => c.transitionOut).filter((t) => t.type !== "none");
  const type = mostCommon(cuts.map((t) => t.type));
  const transition = type === null ? { type: "none" as const, duration: 0 } : { type, duration: cuts.find((t) => t.type === type)!.duration };
  let title: StyleTitle | null = null;
  let firstStart = Infinity;
  for (const o of p.overlays) {
    if (o.kind !== "text" || o.text.trim().length === 0) continue;
    if (!title || o.start < firstStart) { title = { text: o.text, look: textLookOf(o), x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, align: o.align }; firstStart = o.start; }
  }
  const played = p.clips.filter(isPhoto).map(activePhotoMotion).filter((m) => m !== null);
  const motions = [...new Set(played.map((m) => m.id))].slice(0, PHOTO_MOTION_IDS.length);
  return { music, filter, filterIntensity, transition, title, motions, motionStrength: played[0]?.strength ?? 0.5 };
}

/** Marker steps for a style: a photo about `photoSeconds`, a video at most about `videoSeconds`, whatever the tempo. Without a step the values are unused (nothing is cut). */
export function paceFor(beats: readonly number[], every: 1 | 2 | 4): { hold: number; videoHold: number } {
  const step = markerStep(beats, every);
  if (step <= 0) return { hold: 1, videoHold: 1 };
  const hold = Math.min(USER_PACE.most, Math.max(1, Math.round(USER_PACE.photoSeconds / step)));
  return { hold, videoHold: Math.min(USER_PACE.most, Math.max(hold, Math.round(USER_PACE.videoSeconds / step))) };
}

/** What `buildQuickEdit` reads for a style, and the beats (FILE seconds) it cuts to. A bundled song: every 2nd shipped beat; own music: every one of its stored beats (the owner's markers). */
export function planOfStyle(s: UserStyle): { plan: QuickPlan; beats: readonly number[] } {
  const beats = s.music === null ? [] : s.music.kind === "own" ? s.music.beats : (BUNDLED_BEATS[s.music.trackId]?.beats ?? []);
  const every = s.music?.kind === "own" ? 1 : 2;
  const { hold, videoHold } = paceFor(beats, every);
  return { beats, plan: { every, hold, videoHold, transition: s.transition, filter: s.filter, filterIntensity: s.filterIntensity,
    title: s.title ? { from: "look", ...s.title } : null, motions: s.motions, motionStrength: s.motionStrength } };
}

export type ParsedStyles = { status: "ok"; styles: UserStyle[] } | { status: "newer" } | { status: "damaged" };
export function stylesText(styles: readonly UserStyle[]): string { return JSON.stringify({ version: STYLES.version, styles }); }
export function parseStyles(text: string): ParsedStyles {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { status: "damaged" }; }
  if (!isRec(v) || !Number.isInteger(v.version) || (v.version as number) < 1 || !Array.isArray(v.styles)) return { status: "damaged" };
  if ((v.version as number) > STYLES.version) return { status: "newer" };
  return { status: "ok", styles: v.styles.map(cleanStyle).filter((s): s is UserStyle => s !== null) };
}

const BLANK = makeOverlay({ id: "" });
function cleanMusic(v: unknown): StyleMusic | null {
  if (!isRec(v)) return null;
  if (v.kind === "bundled") return typeof v.trackId === "string" && v.trackId.length > 0 ? { kind: "bundled", trackId: v.trackId } : null;
  if (v.kind !== "own" || !isSafeName(v.file) || typeof v.title !== "string" || !isNum(v.durationSec) || v.durationSec <= 0) return null;
  const beats = Array.isArray(v.beats) ? v.beats.filter((b): b is number => isNum(b) && b >= 0).sort((a, b) => a - b).slice(0, STYLES.maxBeats) : [];
  return { kind: "own", file: v.file, title: v.title, durationSec: v.durationSec, beats };
}
function cleanTitle(v: unknown): StyleTitle | null {
  if (!isRec(v) || typeof v.text !== "string" || v.text.trim().length === 0) return null;
  const l = isRec(v.look) ? v.look : {};
  const bg = isRec(l.background) && isHexColor(l.background.color) ? { color: l.background.color, opacity: num(l.background.opacity, 1, 0, 1) } : null;
  const look: TextLook = { fontId: (FONT_IDS as readonly unknown[]).includes(l.fontId) ? (l.fontId as FontId) : BLANK.fontId,
    fontScale: num(l.fontScale, BLANK.fontScale, OVERLAY_LIMITS.fontScale[0], OVERLAY_LIMITS.fontScale[1]), color: isHexColor(l.color) ? l.color : BLANK.color,
    background: bg, outline: typeof l.outline === "boolean" ? l.outline : BLANK.outline, style: clampTextStyle(l.style) };
  const align: Align = v.align === "left" || v.align === "right" ? v.align : "center";
  return { text: cut(v.text, STYLES.maxTitle), look, x: num(v.x, 0.5, 0, 1), y: num(v.y, 0.5, 0, 1), scale: num(v.scale, 1, OVERLAY_LIMITS.scale[0], OVERLAY_LIMITS.scale[1]),
    rotation: num(v.rotation, 0, -360, 360), align };
}
/** One stored style, every value usable; null when it has no id or no name (that entry alone is dropped). */
export function cleanStyle(v: unknown): UserStyle | null {
  if (!isRec(v) || typeof v.id !== "string" || v.id.length === 0 || typeof v.name !== "string") return null;
  const filter = v.filter !== "none" && (FILTER_IDS as readonly unknown[]).includes(v.filter) ? (v.filter as FilterId) : null;
  const t = isRec(v.transition) ? v.transition : {};
  const type = (TRANSITION_TYPES as readonly unknown[]).includes(t.type) ? (t.type as TransitionType) : "none";
  const motions = Array.isArray(v.motions) ? [...new Set(v.motions.filter((m): m is PhotoMotionId => (PHOTO_MOTION_IDS as readonly unknown[]).includes(m)))] : [];
  return { id: v.id, name: cut(v.name, STYLES.nameMax), createdAt: typeof v.createdAt === "string" ? v.createdAt : "", music: cleanMusic(v.music),
    filter, filterIntensity: num(v.filterIntensity, 1, 0, 1),
    transition: type === "none" ? { type, duration: 0 } : { type, duration: num(t.duration, TRANSITION_LIMITS.min, TRANSITION_LIMITS.min, TRANSITION_LIMITS.max) },
    title: cleanTitle(v.title), motions, motionStrength: num(v.motionStrength, 0.5, 0, 1) };
}
