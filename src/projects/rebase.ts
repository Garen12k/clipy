import type { Project } from "@/src/editor/model/types";

/**
 * One file reference, re-pointed at where its project's folder is NOW. References are stored absolute, and iOS may move the app's
 * container (a restore to a new phone, some reinstalls). Under `dirNow` already → untouched; under `/projects/<projectId>/`
 * anywhere else → the part after the LAST such marker, under `dirNow`; anything else is left alone.
 */
export function rebaseUri(uri: string, projectId: string, dirNow: string): string {
  if (typeof uri !== "string" || uri.startsWith(`${dirNow}/`)) return uri;
  const mark = `/projects/${projectId}/`;
  const at = uri.lastIndexOf(mark);
  return at < 0 ? uri : `${dirNow}/${uri.slice(at + mark.length)}`;
}

/**
 * Every file reference of a project (clips, layers, sounds — the model has no other: rebase.guard.test.ts) re-pointed at `dirNow`.
 * Pure and idempotent; when nothing moves THE SAME OBJECT is returned, and a list with nothing to move keeps its identity.
 * In memory only: nothing is written because of it (the next ordinary save stores today's references).
 */
export function rebaseProject(project: Project, dirNow: string): Project {
  const dir = dirNow.replace(/\/+$/, "");
  let moved = false;
  const fix = <T extends { sourceUri: string }>(list: T[]): T[] => {
    let any = false;
    const out = list.map((item) => {
      const uri = rebaseUri(item.sourceUri, project.id, dir);
      if (uri === item.sourceUri) return item;
      any = true;
      return { ...item, sourceUri: uri };
    });
    if (any) moved = true;
    return any ? out : list;
  };
  const clips = fix(project.clips), layers = fix(project.layers), audioTracks = fix(project.audioTracks);
  return moved ? { ...project, clips, layers, audioTracks } : project;
}
