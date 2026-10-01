import { useEffect, useState } from "react";
import { storage } from "@/src/projects";
import { useEditorStore } from "./store";

export function useLoadProject(id: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    storage.loadProject(id)
      .then(({ project, missingClipIds }) => { if (!alive) return; useEditorStore.getState().setProject(project, missingClipIds); setState({ status: "ready" }); })
      .catch((e: unknown) => { if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; useEditorStore.getState().reset(); };
  }, [id]);
  return state;
}
