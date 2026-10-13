/**
 * The undo history kept beside a project: `<project>/history.jsonl`. Pure — no import. Spec:
 * docs/superpowers/specs/2026-10-13-undo-history-design.md.
 *
 *   line 1        {"app":"clipy-history","version":1,"schemaVersion":N,"projectId":"…","stamp":"…","past":P,"future":F}
 *   P lines       the undo stack, oldest first (the store's `past`)
 *   F lines       the redo stack, nearest first (the store's `future`)
 *
 * A snapshot line is `JSON.stringify(project)`, which never holds a raw line feed. A history belongs to ONE text of project.json,
 * named by `stamp`; storage applies it to nothing else.
 */
export const HISTORY_FILE = { name: "history.jsonl", app: "clipy-history", version: 1, maxSteps: 50, maxChars: 4_000_000, maxBytes: 12_000_000 } as const;

export interface HistoryLines { past: string[]; future: string[] }

/** A text's fingerprint: its length and two independent 32-bit hashes (FNV-1a, djb2) of its UTF-16 units. */
export function stampOf(text: string): string {
  let a = 0x811c9dc5, b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = (Math.imul(b, 33) + c) | 0;
  }
  return `${text.length}.${(a >>> 0).toString(16)}.${(b >>> 0).toString(16)}`;
}

const lines = new WeakMap<object, string>();
/** A snapshot as its line, made once per object: a project object in the editor's stacks is never mutated (every op returns a new one). */
export function lineOf(snapshot: object): string {
  let line = lines.get(snapshot);
  if (line === undefined) { line = JSON.stringify(snapshot); lines.set(snapshot, line); }
  return line;
}

/**
 * What is written: the newest `maxSteps` undo steps and the nearest `maxSteps` redo steps; then, while the lines (each with its
 * line feed) are over `maxChars`, the OLDEST undo step goes, and with none left the FARTHEST redo step — redo is the newest work.
 */
export function fitHistory(past: readonly string[], future: readonly string[], maxSteps: number = HISTORY_FILE.maxSteps, maxChars: number = HISTORY_FILE.maxChars): HistoryLines {
  const p = past.slice(-maxSteps), f = future.slice(0, maxSteps);
  let size = 0;
  for (const l of p) size += l.length + 1;
  for (const l of f) size += l.length + 1;
  let from = 0, to = f.length;
  while (size > maxChars && from < p.length) size -= p[from++].length + 1;
  while (size > maxChars && to > 0) size -= f[--to].length + 1;
  return { past: p.slice(from), future: f.slice(0, to) };
}

/**
 * `fitHistory` for the snapshots themselves — the same answer, but a snapshot is turned into text only until the cap is passed
 * (a long project keeps a handful of its 100 steps: the rest are megabytes of `JSON.stringify` for nothing, at the moment the
 * app is being left). The nearest redo steps are measured first, then the undo steps from the newest back.
 */
export function fitSnapshots(past: readonly object[], future: readonly object[], maxSteps: number = HISTORY_FILE.maxSteps, maxChars: number = HISTORY_FILE.maxChars, line: (snapshot: object) => string = lineOf): HistoryLines {
  const p = past.slice(-maxSteps), f = future.slice(0, maxSteps);
  const keptFuture: string[] = [], keptPast: string[] = [];
  let size = 0, whole = true;
  for (const snapshot of f) {
    const l = line(snapshot);
    if (size + l.length + 1 > maxChars) { whole = false; break; }
    size += l.length + 1;
    keptFuture.push(l);
  }
  // An undo step is kept only when every redo step was: the oldest undo steps go before the farthest redo step does.
  for (let i = p.length - 1; whole && i >= 0; i--) {
    const l = line(p[i]);
    if (size + l.length + 1 > maxChars) break;
    size += l.length + 1;
    keptPast.unshift(l);
  }
  return { past: keptPast, future: keptFuture };
}

export function encodeHistory(projectId: string, schemaVersion: number, stamp: string, h: HistoryLines): string {
  const header = { app: HISTORY_FILE.app, version: HISTORY_FILE.version, schemaVersion, projectId, stamp, past: h.past.length, future: h.future.length };
  return [JSON.stringify(header), ...h.past, ...h.future].join("\n");
}

/** The snapshot lines of a history that is exactly this project's, this schema's and this stamp's — or null. Nothing is repaired. */
export function decodeHistory(text: string, projectId: string, schemaVersion: number, stamp: string): HistoryLines | null {
  if (typeof text !== "string" || text.length === 0 || text.length > HISTORY_FILE.maxChars + 4096) return null;
  const all = text.split("\n");
  let header: unknown;
  try { header = JSON.parse(all[0]); } catch { return null; }
  if (typeof header !== "object" || header === null || Array.isArray(header)) return null;
  const h = header as Record<string, unknown>;
  if (h.app !== HISTORY_FILE.app || h.version !== HISTORY_FILE.version || h.schemaVersion !== schemaVersion || h.projectId !== projectId || h.stamp !== stamp) return null;
  const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= HISTORY_FILE.maxSteps;
  const past = h.past, future = h.future;
  if (!count(past) || !count(future) || past + future === 0 || all.length !== 1 + past + future) return null;
  if (all.some((l) => l.length === 0)) return null;
  return { past: all.slice(1, 1 + past), future: all.slice(1 + past) };
}
