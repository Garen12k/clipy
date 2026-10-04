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
      // Flush edits the autosave debounce hasn't written yet, then (after that save) refresh the cover file the drafts
      // list shows, and clear the editor.
      const s = useEditorStore.getState();
      const p = s.project;
      if (p) setLastFlush((s.dirty ? storage.saveProject(p) : Promise.resolve()).then(() => storage.writeCover(p)).catch((e: unknown) => console.warn("flush save failed", e)));
      s.reset();
    };
  }, [id]);
  return state;
}
