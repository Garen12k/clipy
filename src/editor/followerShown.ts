import { create } from "zustand";

/**
 * Which copy the main clip's second player (`CutoutFollower`) is SHOWING: the uri of the copy it has actually presented a frame of,
 * null while it has presented none (nothing mounted, still loading, or just handed another file). A copy that is ready on disk is
 * not yet a picture — until this says so the preview keeps drawing the clip's own (`ClipFrame`) and keeps the Preview tag.
 * There is one such player (the main clip's), so one slot. Written only by `CutoutFollower`; read it with a selector that returns
 * a yes / no for the uri in hand.
 */
export const useFollowerShown = create<{ uri: string | null }>(() => ({ uri: null }));

/** The follower's report: it shows `uri` now (null = it shows nothing). The same report twice writes nothing. */
export function setFollowerShown(uri: string | null): void {
  if (useFollowerShown.getState().uri !== uri) useFollowerShown.setState({ uri });
}
