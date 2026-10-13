import { useRef, useState } from "react";
import { Alert } from "react-native";
import { lastFlush } from "@/src/editor/flush";
import { useStayAwake } from "@/src/export/exportAwake";
import { filePhone, storage, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import type { FileRun } from "./projectFile";
import { addedWords, failureWords, FILE_WORDS, missingWords } from "./projectFileWords";

/** A project file being written (`save`) or read (`open`): what the card shows. `bytes` is 0 until the size is known. */
export type Transfer = { kind: "save" | "open"; name: string; bytes: number; done: number };
const percent = (done: number, bytes: number) => (bytes > 0 ? Math.floor((done * 100) / bytes) : 0);

/**
 * Save a Copy and Open Project File, for Home. One run at a time — Home's own guards see to that. While `transfer` is set Home is
 * inert and shows the card; the screen is kept awake (a locked phone suspends the app and the copy with it). Nothing here promises
 * work in the background. A cancel says nothing; a failure is one alert in plain words (the system's text goes to the log).
 * The card stays until the run's promise has ended — after Cancel too, so the storage has removed what it made before anything
 * else can start.
 */
export function useProjectFile(reload: () => Promise<void>) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const current = useRef<FileRun | null>(null);
  useStayAwake(transfer !== null);

  function begin(kind: Transfer["kind"], name: string): FileRun {
    const run: FileRun = {
      cancelled: false,
      onStart: (info) => setTransfer((t) => (t ? { ...t, name: info.name, bytes: info.bytes } : t)),
      // The card is drawn again only when the whole percent changes: at most a hundred times, however many chunks there are.
      onProgress: (done) => setTransfer((t) => (t && percent(done, t.bytes) !== percent(t.done, t.bytes) ? { ...t, done } : t)),
    };
    current.current = run;
    setTransfer({ kind, name, bytes: 0, done: 0 });
    return run;
  }
  function end() { current.current = null; setTransfer(null); }
  function failed(kind: Transfer["kind"], e: unknown) {
    const words = failureWords(kind, e);
    if (!words) return;                      // cancelled
    console.warn(`project file ${kind} failed`, e);
    Alert.alert(words.title, words.message);
  }

  /** Packs the project, then hands the file to Apple's share sheet; resolves when the sheet has closed. The temporary file is removed then. */
  async function saveCopy(p: ProjectSummary): Promise<void> {
    const run = begin("save", p.name);
    let made: Awaited<ReturnType<typeof storage.packProject>> | null = null;
    try { await lastFlush; made = await storage.packProject(p.id, run); }
    catch (e) { failed("save", e); }
    finally { end(); }
    if (!made) return;
    try { await filePhone.share(made.uri); }
    catch (e) { console.warn("share failed", e); Alert.alert(FILE_WORDS.cantSave, FILE_WORDS.shareFailed); }
    finally { await storage.sweepProjectFiles(); }
    if (made.missing > 0) useToast.getState().show(missingWords(made.missing));
  }

  /** A picked file as a new project. The picked (temporary) copy is removed however it ends. */
  async function openFile(uri: string): Promise<void> {
    const run = begin("open", "");
    try {
      const made = await storage.restoreProject(uri, run);
      try { await reload(); } catch (e) { console.warn("reload after open failed", e); }
      useToast.getState().show(addedWords(made.name));
    } catch (e) { failed("open", e); }
    finally { end(); await filePhone.forget(uri); }
  }

  const cancel = () => { if (current.current) current.current.cancelled = true; };
  return { transfer, saveCopy, openFile, cancel };
}
