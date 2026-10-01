export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const MIN_CLIP_SECONDS = 0.1;

export interface Clip {
  id: string;
  sourceUri: string;
  sourceDuration: number;
  width: number;
  height: number;
  trimStart: number;
  trimEnd: number;
  speed: 1;
  filter: null;
  volume: 1;
  transitionOut: { type: "none"; duration: 0 };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  aspectRatio: AspectRatio;
  clips: Clip[];
  overlays: never[];
  audioTracks: never[];
  schemaVersion: 1;
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return {
    sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920,
    trimStart: 0, trimEnd: partial.sourceDuration,
    speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 },
    ...partial,
  };
}

export function makeProject(partial: Partial<Project> = {}): Project {
  return {
    id: "p1", name: "Project 1", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], schemaVersion: 1,
    ...partial,
  };
}

export function aspectRatioValue(r: AspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
