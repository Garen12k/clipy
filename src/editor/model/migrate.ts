import { normaliseTransitions } from "./ops";
import { FILTER_IDS, SCHEMA_VERSION, SHAPE_IDS, SPEED_LIMITS, TRANSITION_TYPES, type Clip, type Overlay, type Project, type ShapeId } from "./types";

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
 * Brings a v2 or v3 file to a safe v3 shape. Idempotent, so it runs on EVERY load: unknown speed → 1, unknown filter →
 * null, unknown transition → none, transitions re-capped (last clip cleared), overlays get a kind, bad stickers fixed/dropped.
 */
function normaliseV3(raw: Raw): Raw {
  const mapped = (raw.clips as Clip[]).map((c) => {
    const speed = typeof c.speed === "number" && c.speed >= SPEED_LIMITS[0] && c.speed <= SPEED_LIMITS[1] ? c.speed : 1;
    const filter = (FILTER_IDS as readonly string[]).includes(c.filter as string) && c.filter !== "none" ? c.filter : null;
    const t = c.transitionOut;
    const transitionOut = t && (TRANSITION_TYPES as readonly string[]).includes(t.type) && t.type !== "none" && typeof t.duration === "number" && t.duration > 0
      ? { type: t.type, duration: t.duration } : { type: "none" as const, duration: 0 };
    return { ...c, speed, filter, transitionOut } as Clip;
  });
  const clips = normaliseTransitions(mapped);
  const overlays = ((raw.overlays as Array<Record<string, unknown>> | undefined) ?? []).flatMap((o): Overlay[] => {
    if (!o.kind) return [{ ...o, kind: "text" as const } as unknown as Overlay];
    if (o.kind === "sticker") { const s = normaliseSticker(o); return s ? [s] : []; }
    return [o as unknown as Overlay];
  });
  return { ...raw, clips, overlays, audioTracks: (raw.audioTracks as unknown[] | undefined) ?? [], schemaVersion: 3 };
}

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  let cur = raw as Raw;
  if (version === 1) cur = v1to2(cur);
  // v2 → v3 and the v3 sanity pass are the same idempotent step, so corrupted v3 files load safely too.
  return normaliseV3(cur) as unknown as Project;
}
