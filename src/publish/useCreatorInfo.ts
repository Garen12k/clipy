import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure, type CreatorInfo } from "./api";
import type { PlatformId } from "./platforms";

export type CreatorState = { status: "idle" } | { status: "loading" } | { status: "ready"; info: CreatorInfo } | { status: "needsPermission" } | { status: "switchedOff" } | { status: "error"; message: string };

/**
 * What the connected account may post right now, asked from the server only when `load()` is called (the TikTok sheet showing
 * "Post now") — never on its own, never cached: every load is a fresh question and the newest one wins.
 */
export function useCreatorInfo(platform: PlatformId, ask: (platform: PlatformId) => Promise<CreatorInfo> = api.creatorInfo) {
  const [state, setState] = useState<CreatorState>({ status: "idle" });
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(() => {
    const id = ++request.current;
    const live = () => mounted.current && id === request.current;
    setState({ status: "loading" });
    ask(platform).then(
      (info) => { if (live()) setState({ status: "ready", info }); },
      (e: unknown) => {
        if (!live()) return;
        if (e instanceof ApiFailure && e.code === "needs_permission") setState({ status: "needsPermission" });
        // Post now is not switched on on the server (`TIKTOK_DIRECT_POST`): nothing to reconnect for, nothing to try again.
        else if (e instanceof ApiFailure && e.code === "direct_off") setState({ status: "switchedOff" });
        else setState({ status: "error", message: e instanceof Error && e.message ? e.message : "Something went wrong." });
      },
    );
  }, [platform, ask]);
  return { state, load };
}
