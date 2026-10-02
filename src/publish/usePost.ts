import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Prepared } from "./api";
import type { VideoInfo } from "./adapters/types";
import { openReader } from "./fileReader";
import { PLATFORM_IDS, type PlatformId } from "./platforms";
import { IDLE_ROW, runPost, type PostDeps, type PostJob, type RowState } from "./runPost";
import { uploadGoogleResumable, uploadRelay } from "./upload";

const realDeps: PostDeps = { api, openReader, uploadGoogleResumable, uploadRelay, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
const allIdle = () => Object.fromEntries(PLATFORM_IDS.map((id) => [id, IDLE_ROW])) as Record<PlatformId, RowState>;
const ACTIVE = ["preparing", "uploading", "publishing"];

/** One row of state per platform; rows run in parallel and never affect each other. */
export function usePost(video: VideoInfo, onPosted: (platform: PlatformId, url: string | null) => void) {
  const [rows, setRows] = useState(allIdle);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const prepared = useRef<Partial<Record<PlatformId, Prepared | null>>>({});
  const aborts = useRef<Partial<Record<PlatformId, AbortController>>>({});
  const runIds = useRef<Partial<Record<PlatformId, number>>>({});
  const mounted = useRef(true);
  const posted = useRef(onPosted); posted.current = onPosted;

  const run = useCallback((job: Omit<PostJob, "video">, resume: boolean) => {
    const { platform } = job;
    aborts.current[platform]?.abort();
    const id = (runIds.current[platform] ?? 0) + 1;
    runIds.current[platform] = id;
    const ac = new AbortController();
    aborts.current[platform] = ac;
    const live = () => mounted.current && runIds.current[platform] === id;
    let notified = false;
    const update = (patch: Partial<RowState>) => {
      if (!live()) return;
      setRows((r) => ({ ...r, [platform]: { ...r[platform], ...patch } }));
      if (patch.phase === "done" && !notified) { notified = true; posted.current(platform, patch.url ?? null); }
    };
    runPost({ ...job, video }, realDeps, update, ac.signal, resume ? prepared.current[platform] ?? null : null)
      .then((p) => { if (live()) prepared.current[platform] = p; });
  }, [video]);

  const start = useCallback((jobs: Array<Omit<PostJob, "video">>) => { for (const j of jobs) run(j, false); }, [run]);
  const retry = useCallback((job: Omit<PostJob, "video">) => run(job, rowsRef.current[job.platform].resumable), [run]);
  const cancel = useCallback(() => { for (const ac of Object.values(aborts.current)) ac?.abort(); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); }; // leaving the screen stops uploads
  }, [cancel]);

  return { rows, busy: Object.values(rows).some((r) => ACTIVE.includes(r.phase)), start, retry, cancel };
}
