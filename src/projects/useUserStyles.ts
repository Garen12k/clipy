import { useCallback, useState } from "react";
import { storage } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { myStyles } from "./myStyles";
import { StyleStoreError } from "./styleStore";
import { STYLES, styleFromProject, type UserStyle } from "./userStyles";

/** Every word the styles say (toasts: Home is a screen). */
export const STYLE_WORDS = {
  saved: "Style saved. You'll find it in Quick edit.",
  failed: "Couldn't save the style",
  full: `You have ${STYLES.max} styles. Delete one to save another.`,
  newer: "Your styles were saved by a newer Clipy.",
  missing: "Couldn't save the style: its music file is missing.",
  musicGone: "This style's music is missing.",
  renameFailed: "Couldn't rename the style",
  deleteFailed: "Couldn't delete the style",
} as const;
const say = (m: string) => useToast.getState().show(m);

/** The owner's styles for Home and its Quick Edit sheet. Read when asked (`reload`); a read that fails or is newer shows none. */
export function useUserStyles() {
  const [mine, setMine] = useState<UserStyle[]>([]);
  const reload = useCallback(async () => {
    try { const read = await myStyles.list(); setMine(read.status === "ok" ? read.styles : []); }
    catch (e) { console.warn("styles: list failed", e); setMine([]); }
  }, []);
  /** A style from a stored project (read in its turn of the save chain, so a queued save is in it). Only READS the project. True when saved. */
  async function save(projectId: string, name: string): Promise<boolean> {
    try {
      const { project } = await storage.loadProject(projectId);
      await myStyles.add(styleFromProject(project), name, project.name);
      say(STYLE_WORDS.saved);
      await reload();
      return true;
    } catch (e) {
      console.warn("save style failed", e);
      say(e instanceof StyleStoreError ? STYLE_WORDS[e.code] : STYLE_WORDS.failed);
      return false;
    }
  }
  async function rename(id: string, name: string) {
    try { await myStyles.rename(id, name); } catch (e) { console.warn("rename style failed", e); say(e instanceof StyleStoreError && e.code === "newer" ? STYLE_WORDS.newer : STYLE_WORDS.renameFailed); }
    await reload();
  }
  async function remove(id: string) {
    try { await myStyles.remove(id); } catch (e) { console.warn("delete style failed", e); say(e instanceof StyleStoreError && e.code === "newer" ? STYLE_WORDS.newer : STYLE_WORDS.deleteFailed); }
    await reload();
  }
  return { mine, reload, save, rename, remove };
}
