import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { fileSize } from "@/src/lib/fileInfo";
import { clientAdapters, type ClientAdapter, type VideoInfo } from "./adapters";
import type { PlatformStatus } from "./api";
import type { PlatformId } from "./platforms";
import type { PostJob, RowState } from "./runPost";

type Param = string | string[] | undefined;
const one = (v: Param) => (Array.isArray(v) ? v[0] : v);
const positive = (v: Param) => { const s = one(v); const n = s ? Number(s) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };

export interface PostTarget { video: VideoInfo; projectId: string | null; title: string | null }

/** The Post screen's route params as a video to post, or null when they can't describe one (never throws). */
export function videoFromParams(params: Record<string, Param>): PostTarget | null {
  const fileUri = one(params.fileUri);
  const durationSec = positive(params.durationSec);
  if (!fileUri || durationSec === null) return null;
  const size = one(params.fileSize) === undefined ? fileSize(fileUri) : positive(params.fileSize);
  if (!size) return null;
  return {
    video: { fileUri, durationSec, fileSize: size, mimeType: one(params.mimeType) || "video/mp4" },
    projectId: one(params.projectId) || null, title: one(params.title) ?? null,
  };
}

export type Reason = "Not available yet" | "Not connected" | "Sign-in expired";
export interface PlatformView {
  status: PlatformStatus; adapter: ClientAdapter | null;
  /** Why the platform can't be ticked, or null when it can. */
  reason: Reason | null;
  /** Ticked and valid: it goes out when Post is pressed. */
  checked: boolean;
  /** The adapter's validation sentence while the platform is ticked. */
  error: string | null;
  note: string | null;
  options: Record<string, unknown>;
  /** The row failed with "reconnect", the user went to Accounts and the platform is healthy again. */
  canResume: boolean;
}
type Job = Omit<PostJob, "video">;

/** Caption, per-platform selection / options / validation, and the reconnect → resume flow of the Post screen. */
export function usePostForm(video: VideoInfo, platforms: PlatformStatus[], title: string | null, rows: Record<PlatformId, RowState>, refresh: () => Promise<void>) {
  const [caption, setCaption] = useState("");
  const [ticked, setTicked] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [options, setOptions] = useState<Partial<Record<PlatformId, Record<string, unknown>>>>({});
  // Platforms whose row said "reconnect" and whose Reconnect button sent the user to Accounts …
  const [awaiting, setAwaiting] = useState<ReadonlySet<PlatformId>>(new Set());
  // … and those of them for which the accounts list has been reloaded since the user came back.
  const [returned, setReturned] = useState<ReadonlySet<PlatformId>>(new Set());
  const awaitingRef = useRef(awaiting); awaitingRef.current = awaiting;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // useAccounts loads on mount; reload whenever the screen comes back into focus (e.g. from Accounts).
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    const back = new Set(awaitingRef.current);
    refresh().then(() => { if (mounted.current && back.size) setReturned((r) => new Set([...r, ...back])); }, () => {});
  }, [refresh]));

  const optionsFor = (id: PlatformId, adapter: ClientAdapter) => options[id] ?? adapter.defaultOptions(title ?? "");

  const views: PlatformView[] = platforms.map((status) => {
    const adapter = clientAdapters[status.id] ?? null;
    const reason: Reason | null = !status.available || !adapter ? "Not available yet" : status.needsReconnect ? "Sign-in expired" : !status.connected ? "Not connected" : null;
    const opts = adapter ? optionsFor(status.id, adapter) : {};
    const on = !reason && (ticked[status.id] ?? true);
    const error = on && adapter ? adapter.validate(video, caption, opts) : null;
    return {
      status, adapter, reason, checked: on && !error, error, options: opts,
      note: on && adapter ? adapter.note(video) : null,
      canResume: rows[status.id]?.phase === "needsReconnect" && returned.has(status.id) && !reason,
    };
  });

  const limits = views.filter((v) => !v.reason && (ticked[v.status.id] ?? true) && v.adapter).map((v) => v.adapter!.captionMax);
  const captionMax = limits.length ? Math.min(...limits) : null;
  const overLimit = captionMax !== null && caption.length > captionMax;
  const jobFor = (v: PlatformView): Job => ({ platform: v.status.id, caption, options: v.options });
  // Rows that already ran keep their own Retry / Resume / View; Post only sends the fresh ones.
  const jobs = overLimit ? [] : views.filter((v) => v.checked && (rows[v.status.id]?.phase ?? "idle") === "idle").map(jobFor);

  const toggle = (id: PlatformId) => setTicked((t) => ({ ...t, [id]: !(t[id] ?? true) }));
  const setOption = (id: PlatformId, patch: Record<string, unknown>) => {
    const adapter = clientAdapters[id];
    if (adapter) setOptions((o) => ({ ...o, [id]: { ...(o[id] ?? adapter.defaultOptions(title ?? "")), ...patch } }));
  };
  const forget = (id: PlatformId) => {
    setAwaiting((s) => { const n = new Set(s); n.delete(id); return n; });
    setReturned((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  /** The user is sent to Accounts to reconnect this platform. */
  const markReconnect = (id: PlatformId) => { setAwaiting((s) => new Set(s).add(id)); setReturned((s) => { const n = new Set(s); n.delete(id); return n; }); };
  /** The job a Retry / Resume press sends for this platform (current caption and options). */
  const retryJob = (v: PlatformView) => { forget(v.status.id); return jobFor(v); };

  return { caption, setCaption, captionMax, overLimit, views, jobs, toggle, setOption, markReconnect, retryJob };
}
