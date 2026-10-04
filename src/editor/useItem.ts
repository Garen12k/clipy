import { findItem } from "@/src/editor/model/timeline";
import type { Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";

/** The main clip or layer with this id (null when there is none): what every clip sheet edits. The stored object itself, so it only changes when the item does. */
export function useItemClip(id: string | null): Clip | null {
  return useEditorStore((s) => (id && s.project ? findItem(s.project, id)?.clip ?? null : null));
}

/** Whether the id is a layer's (false for a main clip or no item). */
export function useIsLayer(id: string | null): boolean {
  return useEditorStore((s) => !!id && !!s.project && !!findItem(s.project, id)?.layer);
}
