import { useEffect, useState } from "react";
import { theme } from "@/src/theme/theme";

/** Ready once fonts are loaded (or we stop waiting for them) and the loading screen has had its minimum time. */
export function useAppReady(fontsLoaded: boolean): { ready: boolean } {
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setMinElapsed(true), theme.motion.minLoading);
    const b = setTimeout(() => setTimedOut(true), theme.motion.fontTimeout);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return { ready: (fontsLoaded && minElapsed) || timedOut };
}
