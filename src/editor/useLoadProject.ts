import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { storage } from "@/src/projects";
import { setLastFlush } from "./flush";
import { forgetHistory, historyStale, historyTurn, keepHistoryNow, restoreAfterOpen } from "./historyKeeper";
import { dropEmptyText, undoAutoFit } from "./model/ops";
import { useEditorStore } from "./store";
import { useToolStrip } from "./toolStrip";

export function useLoadProject(id: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    storage.loadProject(id)
      .then(({ project, missingSourceUris, stamp }) => {
        if (!alive) return;
        const opened = undoAutoFit(project);
        useEditorStore.getState().setProject(opened, missingSourceUris);
        setState({ status: "ready" });
        // The undo history kept with the project: read a moment later, never before the editor is on screen.
        restoreAfterOpen(opened, stamp);
      })
      .catch((e: unknown) => { if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) }); });
    // The app stops being active (the app switcher, a call, Control Centre): the history is written now — a force-quit comes after this.
    const sub = AppState.addEventListener("change", (now) => { if (now !== "active") void keepHistoryNow(); });
    return () => {
      alive = false;
      sub.remove();
      // Flush edits the autosave debounce hasn't written yet, then (after that save) the undo history, then refresh the cover file
      // the drafts list shows, and clear the editor.
      const s = useEditorStore.getState();
      // A text left empty in the open text panel is removed when the panel closes — but the toolbar that does it is unmounting too
      // (this cleanup runs before its own), so it is dropped here: from what is saved, and saved even when the autosave already wrote it.
      const editing = useToolStrip.getState().open?.id === "text" ? s.selectedOverlayId : null;
      const p = s.project && dropEmptyText(s.project, editing);
      // A history to write needs the project written first even when it is not dirty: its stamp is of what is on disk.
      const stale = historyStale(s);
      const { past, future } = s;
      forgetHistory();
      // In its turn (historyTurn): at once, as always — unless the write of "the app stops being active" is still on its way, and
      // then after it, so its history is never written beside a project.json this save has replaced meanwhile.
      // The cover is outside the turn: it waits for a thumbnail, and nothing that is saved later may wait for that.
      if (p) setLastFlush(historyTurn(() => (s.dirty || p !== s.project || stale ? storage.saveProject(p) : Promise.resolve())
        .then(() => (stale ? storage.saveHistory(p, past, future) : false)))
        .then(() => storage.writeCover(p))
        .catch((e: unknown) => console.warn("flush save failed", e)));
      s.reset();
    };
  }, [id]);
  return state;
}
