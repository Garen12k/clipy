/**
 * The most recent "save on leave" started by the editor. The editor's unmount cleanup is synchronous,
 * so it can't await its final save; the Projects list awaits this before re-reading project files.
 */
export let lastFlush: Promise<void> = Promise.resolve();

export function setLastFlush(p: Promise<void>): void { lastFlush = p; }
