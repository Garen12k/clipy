import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { VideoInfo } from "./adapters/types";
import { openReader } from "./fileReader";
import { PLATFORM_IDS, type PlatformId } from "./platforms";
import { IDLE_ROW, runPost, type PostDeps, type PostJob, type ResumeInfo, type RowState } from "./runPost";
import { uploadGoogleResumable, uploadRelay } from "./upload";

/** Timer that also ends early (and cleans up) when the signal aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}
const realDeps: PostDeps = { api, openReader, uploadGoogleResumable, uploadRelay, sleep };
const allIdle = () => Object.fromEntries(PLATFORM_IDS.map((id) => [id, IDLE_ROW])) as Record<PlatformId, RowState>;
const ACTIVE = ["preparing", "uploading", "publishing"];

/** One row of state per platform; rows run in parallel and never affect each other. */
export function usePost(video: VideoInfo, onPosted: (platform: PlatformId, url: string | null) => void) {
  const [rows, setRows] = useState(allIdle);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const resumeInfo = useRef<Partial<Record<PlatformId, ResumeInfo | null>>>({});
  const aborts = useRef<Partial<Record<PlatformId, AbortController>>>({});
  const runIds = useRef<Partial<Record<PlatformId, number>>>({});
  const active = useRef<Partial<Record<PlatformId, boolean>>>({});
  const mounted = useRef(true);
  const posted = useRef(onPosted); posted.current = onPosted;

  const run = useCallback((job: Omit<PostJob, "video">, resume: ResumeInfo | null) => {
    const { platform } = job;
    if (active.current[platform]) return; // a double press must not start a second run
    const id = (runIds.current[platform] ?? 0) + 1;
    runIds.current[platform] = id;
    active.current[platform] = true;
    const ac = new AbortController();
    aborts.current[platform] = ac;
    const live = () => mounted.current && runIds.current[platform] === id;
    let notified = false;
    const update = (patch: Partial<RowState>) => {
      if (!live()) return;
      setRows((r) => ({ ...r, [platform]: { ...r[platform], ...patch } }));
      // onPosted may touch state of an unmounted screen, so it is never called after unmount: a post that completes
      // after the user left the screen is not recorded on the project (live() is false then).
      if (patch.phase === "done" && !notified) {
        notified = true;
        try { posted.current(platform, patch.url ?? null); } catch (e) { console.warn("onPosted failed", e); }
      }
    };
    runPost({ ...job, video }, realDeps, update, ac.signal, resume).then((info) => {
      if (runIds.current[platform] !== id) return;
      active.current[platform] = false;
      resumeInfo.current[platform] = info;
    });
  }, [video]);

  const start = useCallback((jobs: Array<Omit<PostJob, "video">>) => { for (const j of jobs) run(j, null); }, [run]);
  const retry = useCallback((job: Omit<PostJob, "video">) => {
    const row = rowsRef.current[job.platform];
    const stored = resumeInfo.current[job.platform] ?? null;
    const resumable = (row.phase === "failed" && row.resumable) || row.phase === "needsReconnect";
    // A finished upload is never sent again: its info is kept whatever the row says (runPost drops it when only a fresh upload can help).
    run(job, resumable || stored?.uploaded ? stored : null);
  }, [run]);
  const cancel = useCallback(() => {
    for (const ac of Object.values(aborts.current)) ac?.abort();
    // `active` is cleared only when each run settles, so a cancelled run that is still finalizing blocks a second upload.
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); }; // leaving the screen stops uploads
  }, [cancel]);

  return { rows, busy: Object.values(rows).some((r) => ACTIVE.includes(r.phase)), start, retry, cancel };
}
