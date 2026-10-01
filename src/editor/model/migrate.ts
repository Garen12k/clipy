import { FILTER_IDS, SCHEMA_VERSION, SPEED_LIMITS, TRANSITION_TYPES, type Clip, type Overlay, type Project } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
type Raw = Record<string, unknown> & { clips: unknown[] };

function v1to2(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...raw, clips, overlays: [], audioTracks: [], schemaVersion: 2 };
}

function v2to3(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => {
    const speed = typeof c.speed === "number" && c.speed >= SPEED_LIMITS[0] && c.speed <= SPEED_LIMITS[1] ? c.speed : 1;
    const filter = (FILTER_IDS as readonly string[]).includes(c.filter as string) && c.filter !== "none" ? c.filter : null;
    const t = c.transitionOut;
    const transitionOut = t && (TRANSITION_TYPES as readonly string[]).includes(t.type) && t.type !== "none" && typeof t.duration === "number" && t.duration > 0
      ? { type: t.type, duration: t.duration } : { type: "none" as const, duration: 0 };
    return { ...c, speed, filter, transitionOut };
  });
  const overlays = ((raw.overlays as Array<Record<string, unknown>> | undefined) ?? []).map(
    (o) => (o.kind ? (o as unknown as Overlay) : ({ ...o, kind: "text" as const } as unknown as Overlay)),
  );
  return { ...raw, clips, overlays, audioTracks: (raw.audioTracks as unknown[] | undefined) ?? [], schemaVersion: 3 };
}

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  let version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  let cur = raw as Raw;
  if (version === 1) { cur = v1to2(cur); version = 2; }
  if (version === 2) { cur = v2to3(cur); version = 3; }
  return cur as unknown as Project;
}
