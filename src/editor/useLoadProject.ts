import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { storage } from "@/src/projects";
import { setLastFlush } from "./flush";
import { forgetHistory, historyStale, keepHistoryNow, restoreAfterOpen } from "./historyKeeper";
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
      // A history to write needs the project written with it even when nothing is dirty: its stamp is of what is on disk. And it
      // is asked of the project that is SAVED — with an empty text dropped that is another project.json than the one the history
      // was last written beside.
      const { past, future } = s;
      const stale = p !== null && historyStale({ project: p, past, future });
      forgetHistory();
      if (p) {
        // Asked for in this very call, as the leave's save always was; the storage runs one project's saves one after another, so
        // an autosave or an app-switcher write still on its way ends first. With a history to keep, the project and the history are
        // ONE turn (`saveWithHistory`): the history is stamped from the very text written, and nothing lands between the two.
        // The cover comes last and waits for nobody's turn: it waits for a thumbnail, and nothing saved later may wait for that.
        const pair = stale ? storage.saveWithHistory(p, past, future) : null;
        const saved = pair ? pair.saved : s.dirty || p !== s.project ? storage.saveProject(p) : Promise.resolve();
        setLastFlush(saved
          .then(() => pair?.kept)
          .then(() => storage.writeCover(p))
          .catch((e: unknown) => console.warn("flush save failed", e)));
      }
      s.reset();
    };
  }, [id]);
  return state;
}
