import { useEffect, useRef } from "react";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/** Saves the project `delayMs` after the last change. Latest project wins; failures are logged, not thrown. */
export function useAutosave(save: (p: Project) => Promise<void>, delayMs = 500) {
  const dirty = useEditorStore((s) => s.dirty);
  const project = useEditorStore((s) => s.project);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || !project) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const latest = useEditorStore.getState().project;
      if (!latest) return;
      save(latest).then(() => useEditorStore.getState().markSaved()).catch((e) => console.warn("autosave failed", e));
    }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, project, save, delayMs]);
}
