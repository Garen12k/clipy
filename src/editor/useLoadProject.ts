import { useEffect, useState } from "react";
import { storage } from "@/src/projects";
import { setLastFlush } from "./flush";
import { useEditorStore } from "./store";

export function useLoadProject(id: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    storage.loadProject(id)
      .then(({ project, missingSourceUris }) => { if (!alive) return; useEditorStore.getState().setProject(project, missingSourceUris); setState({ status: "ready" }); })
      .catch((e: unknown) => { if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) }); });
    return () => {
      alive = false;
      // Flush edits the autosave debounce hasn't written yet, then clear the editor.
      const s = useEditorStore.getState();
      if (s.dirty && s.project) setLastFlush(storage.saveProject(s.project).catch((e: unknown) => console.warn("flush save failed", e)));
      s.reset();
    };
  }, [id]);
  return state;
}
