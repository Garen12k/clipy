import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { clientAdapters, type ClientAdapter, type VideoInfo } from "./adapters";
import type { PlatformStatus } from "./api";
import type { PlatformId } from "./platforms";
import type { PostJob, RowState } from "./runPost";

export type Reason = "Not available yet" | "Not connected" | "Sign-in expired";
export interface PlatformView {
  status: PlatformStatus; adapter: ClientAdapter | null;
  /** Why the platform can't be ticked, or null when it can. */
  reason: Reason | null;
  /** Ticked and valid: it goes out when Post is pressed. */
  checked: boolean;
  /** The adapter's validation sentence while the platform is ticked. */
  error: string | null;
  /** Ticked, valid and the caption within the limit: the one rule for Post, Retry and Resume alike. */
  canPost: boolean;
  /** Why a ticked platform can't be sent right now (validation or caption length), or null. */
  blocker: string | null;
  note: string | null;
  /** The adapter's caption-dependent note while the platform is ticked (e.g. X's link price), or null. */
  captionNote: string | null;
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

  const base = platforms.map((status) => {
    const adapter = clientAdapters[status.id] ?? null;
    const reason: Reason | null = !status.available || !adapter ? "Not available yet" : status.needsReconnect ? "Sign-in expired" : !status.connected ? "Not connected" : null;
    const opts = adapter ? optionsFor(status.id, adapter) : {};
    const on = !reason && (ticked[status.id] ?? true);
    return { status, adapter, reason, on, opts, error: on && adapter ? adapter.validate(video, caption, opts) : null };
  });
  // The caption limit is the smallest one among the ticked platforms that receive the caption.
  const tickedAdapters = base.filter((b) => b.on && b.adapter).map((b) => b.adapter!);
  const limits = tickedAdapters.flatMap((a) => (a.captionMax === null ? [] : [a.captionMax]));
  const captionMax = limits.length ? Math.min(...limits) : null;
  const overLimit = captionMax !== null && caption.length > captionMax;
  /** Some platform is ticked, so the caption counter is shown (with or without a limit). */
  const anyTicked = tickedAdapters.length > 0;
  /** Ticked platforms that never receive the caption, by id. */
  const captionless = tickedAdapters.filter((a) => a.captionMax === null).map((a) => a.id);

  const views: PlatformView[] = base.map(({ status, adapter, reason, on, opts, error }) => {
    // A platform that doesn't receive the caption is never held back by its length.
    const tooLong = overLimit && adapter?.captionMax !== null;
    const blocker = !on ? null : error ?? (tooLong ? `Captions can be up to ${captionMax} characters.` : null);
    return {
      status, adapter, reason, checked: on && !error, error, options: opts,
      canPost: on && !blocker, blocker,
      note: on && adapter ? adapter.note(video) : null,
      captionNote: on && adapter?.captionNote ? adapter.captionNote(caption) : null,
      canResume: rows[status.id]?.phase === "needsReconnect" && returned.has(status.id) && !reason,
    };
  });
  const jobFor = (v: PlatformView): Job => ({ platform: v.status.id, caption, options: v.options });
  // Rows that already ran keep their own Retry / Resume / View; Post only sends the fresh ones.
  const jobs = views.filter((v) => v.canPost && (rows[v.status.id]?.phase ?? "idle") === "idle").map(jobFor);

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
  /** The job a Retry / Resume press sends (current caption and options), or null when the row can't be sent now. */
  const retryJob = (v: PlatformView): Job | null => { if (!v.canPost) return null; forget(v.status.id); return jobFor(v); };

  return { caption, setCaption, captionMax, overLimit, anyTicked, captionless, views, jobs, toggle, setOption, markReconnect, retryJob };
}
