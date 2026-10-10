import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { notifyDone, notifyState } from "@/src/lib/notify";
import type { ExportState } from "./useExport";

export const EXPORT_NOTICE = { title: "Your video is ready", body: (name: string) => `${name} finished exporting.` } as const;

/**
 * "Your video is ready": ONE local notification when an export finishes while the app is not the active one — and only where
 * notifications are already allowed (this never asks). In front, the Export screen itself shows the end, so nothing more is said;
 * a failure or a cancel says nothing. It only watches the export's state — `useExport` and its request are untouched — and it is
 * not a promise that an export goes on after the app is left: iOS decides that (what is asked of it is in backgroundExport.ts, and the video's frames wait there).
 * Once per export: it fires only on the CHANGE from exporting to done (the status before is kept in a ref and replaced before
 * anything is said), so a second render, a second run of the effect or the done state seen again says nothing.
 */
export function useExportNotice(status: ExportState["status"], projectName: string): void {
  const was = useRef(status);
  const name = useRef(projectName);
  name.current = projectName;
  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (before !== "exporting" || status !== "done") return;
    if (AppState.currentState === "active") return;
    const body = EXPORT_NOTICE.body(name.current);
    notifyState().then((state) => (state === "granted" ? notifyDone(EXPORT_NOTICE.title, body) : false)).then(() => {}, () => {});
  }, [status]);
}
