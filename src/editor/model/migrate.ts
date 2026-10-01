import { SCHEMA_VERSION, type Clip, type Project } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  if (version === SCHEMA_VERSION) return raw as unknown as Project;
  // v1 → v2: clips gain `muted`; overlay/audio arrays become real.
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...(raw as unknown as Project), clips, overlays: [], audioTracks: [], schemaVersion: SCHEMA_VERSION };
}
