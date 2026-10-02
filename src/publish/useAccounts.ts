import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/src/ui/Toast";
import { api, type PlatformStatus } from "./api";
import type { PlatformId } from "./platforms";

type Status = "idle" | "loading" | "ready" | "error";
const text = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** The connected-accounts list plus connect / disconnect. `enabled` is false until the user is signed in. */
export function useAccounts(enabled: boolean) {
  const [status, setStatus] = useState<Status>(enabled ? "loading" : "idle");
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PlatformId | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current; // last request wins
    try {
      const list = await api.accounts();
      if (!mounted.current || id !== requestId.current) return;
      setPlatforms(list); setError(null); setStatus("ready");
    } catch (e) {
      if (!mounted.current || id !== requestId.current) return;
      setError(text(e)); setStatus("error");
    }
  }, []);
  useEffect(() => { if (enabled) { setStatus("loading"); refresh(); } else { requestId.current++; setPlatforms([]); setStatus("idle"); } }, [enabled, refresh]);

  // One connect / disconnect at a time: a ref, so two presses in the same frame can't both get through.
  const inFlight = useRef(false);
  const exclusive = useCallback(async (platform: PlatformId, work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(platform);
    try { await work(); }
    catch (e) { if (mounted.current) useToast.getState().show(text(e)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(null); }
  }, []);

  const connect = useCallback((platform: PlatformId) => exclusive(platform, async () => {
    const returnUrl = Linking.createURL("oauth");
    const result = await WebBrowser.openAuthSessionAsync(await api.oauthStart(platform, returnUrl), returnUrl);
    if (!mounted.current) return;
    if (result.type === "success") {
      const q = Linking.parse(result.url).queryParams ?? {};
      if (q.status === "error") useToast.getState().show(typeof q.message === "string" && q.message ? q.message : "Couldn't connect.");
      if (q.status !== "cancelled") await refresh();
    }
  }), [exclusive, refresh]);

  const disconnect = useCallback((platform: PlatformId) => exclusive(platform, async () => {
    await api.disconnect(platform); await refresh();
  }), [exclusive, refresh]);

  return { status, platforms, error, busy, refresh, connect, disconnect };
}
