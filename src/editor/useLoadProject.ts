import { useEffect, useState } from "react";
import { storage } from "@/src/projects";
import { setLastFlush } from "./flush";
import { dropEmptyText } from "./model/ops";
import { useEditorStore } from "./store";
import { useToolStrip } from "./toolStrip";

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
      // A text left empty in the open text panel is removed when the panel closes — but the toolbar that does it is unmounting too
      // (this cleanup runs before its own), so it is dropped here: from what is saved, and saved even when the autosave already wrote it.
      const editing = useToolStrip.getState().open?.id === "text" ? s.selectedOverlayId : null;
      const p = s.project && dropEmptyText(s.project, editing);
      if (p) setLastFlush((s.dirty || p !== s.project ? storage.saveProject(p) : Promise.resolve()).then(() => storage.writeCover(p)).catch((e: unknown) => console.warn("flush save failed", e)));
      s.reset();
    };
  }, [id]);
  return state;
}
