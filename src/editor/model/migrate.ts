import { normaliseTransitions } from "./ops";
import {
  clampCrop, clampTransform, CLIP_KINDS, DEFAULT_TRANSFORM, FILTER_IDS, FULL_CROP, PHOTO, POST_PLATFORMS, SCHEMA_VERSION, SHAPE_IDS, SPEED_LIMITS, TRANSITION_TYPES,
  type Clip, type ClipBackground, type ClipKind, type ClipTransform, type CropRect, type Overlay, type PostRecord, type Project, type ShapeId,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
type Raw = Record<string, unknown> & { clips: unknown[] };

function v1to2(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...raw, clips, overlays: [], audioTracks: [], schemaVersion: 2 };
}

const isKnownShape = (s: unknown) => (SHAPE_IDS as readonly string[]).includes(s as string);

/** A sticker needs a known shape or a non-empty emoji; an unknown shape falls back to the emoji, else the sticker is dropped. */
function normaliseSticker(o: Record<string, unknown>): Overlay | null {
  const emoji = typeof o.emoji === "string" && o.emoji.length > 0 ? o.emoji : null;
  const shape = isKnownShape(o.shape) ? (o.shape as ShapeId) : null;
  if (!emoji && !shape) return null;
  return { ...o, emoji, shape } as unknown as Overlay;
}

/**
 * Brings a v2–v5 file to a safe v5 shape. Idempotent, so it runs on EVERY load: unknown speed → 1, unknown filter →
 * null, unknown transition → none, transitions re-capped (last clip cleared), overlays get a kind, bad stickers fixed/dropped,
 * clips get kind/transform/crop/background/reversed defaults or repairs, photos forced to the photo rules.
 */
function normaliseCurrent(raw: Raw): Raw {
  const mapped = (raw.clips as Clip[]).map((c) => {
    const speed = typeof c.speed === "number" && c.speed >= SPEED_LIMITS[0] && c.speed <= SPEED_LIMITS[1] ? c.speed : 1;
    const filter = (FILTER_IDS as readonly string[]).includes(c.filter as string) && c.filter !== "none" ? c.filter : null;
    const t = c.transitionOut;
    const transitionOut = t && (TRANSITION_TYPES as readonly string[]).includes(t.type) && t.type !== "none" && typeof t.duration === "number" && t.duration > 0
      ? { type: t.type, duration: t.duration } : { type: "none" as const, duration: 0 };
    const kind: ClipKind = (CLIP_KINDS as readonly string[]).includes(c.kind as string) ? c.kind : "video";
    const transform = clampTransform(isObj(c.transform) ? (c.transform as ClipTransform) : DEFAULT_TRANSFORM);
    const crop = clampCrop(isObj(c.crop) ? (c.crop as CropRect) : FULL_CROP);
    const bg = c.background as Record<string, unknown> | undefined;
    const background: ClipBackground = isObj(bg) && bg.type === "blur" ? { type: "blur" }
      : isObj(bg) && bg.type === "color" && typeof bg.color === "string" && HEX_COLOR.test(bg.color) ? { type: "color", color: bg.color }
      : { type: "black" };
    const reversed = c.reversed === true;
    const base = { ...c, speed, filter, transitionOut, kind, transform, crop, background, reversed } as Clip;
    if (kind !== "photo") return base;
    const trimEnd = clampNum(typeof c.trimEnd === "number" && Number.isFinite(c.trimEnd) ? c.trimEnd : PHOTO.defaultSeconds, PHOTO.minSeconds, PHOTO.maxSeconds);
    return { ...base, speed: 1, muted: true, reversed: false, trimStart: 0, sourceDuration: PHOTO.maxSeconds, trimEnd };
  });
  const clips = normaliseTransitions(mapped);
  const overlays = ((raw.overlays as Array<Record<string, unknown>> | undefined) ?? []).flatMap((o): Overlay[] => {
    if (!o.kind) return [{ ...o, kind: "text" as const } as unknown as Overlay];
    if (o.kind === "sticker") { const s = normaliseSticker(o); return s ? [s] : []; }
    return [o as unknown as Overlay];
  });
  const posts = (Array.isArray(raw.posts) ? raw.posts : []).filter((r): r is PostRecord =>
    isObj(r) && (POST_PLATFORMS as readonly unknown[]).includes(r.platform) && (typeof r.url === "string" || r.url === null) && typeof r.postedAt === "string");
  return { ...raw, clips, overlays, audioTracks: (raw.audioTracks as unknown[] | undefined) ?? [], posts, schemaVersion: SCHEMA_VERSION };
}

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  let cur = raw as Raw;
  if (version === 1) cur = v1to2(cur);
  // v2 → v4 and the sanity pass are the same idempotent step, so corrupted files of any supported version load safely too.
  return normaliseCurrent(cur) as unknown as Project;
}
