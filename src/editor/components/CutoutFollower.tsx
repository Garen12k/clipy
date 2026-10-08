import { useEffect, useMemo } from "react";
import { setFollowerShown } from "@/src/editor/followerShown";
import { clipAt } from "@/src/editor/model/timeline";
import type { Clip, LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LayerVideo } from "./LayerVideo";

/**
 * A main video clip's cut-out in the preview. The preview's own players load the clip's file and are not told otherwise, so the
 * copy gets a player of its own: a `LayerVideo` (the layers' player, unchanged) handed the clip with the copy's uri and no sound,
 * at the clip's offset under the playhead. The main player underneath keeps the sound and keeps driving the playhead; this one only
 * follows. Mounted by `ClipFrame` only while the copy is ready and the clip is on screen. It is never keyed by the clip or the
 * copy: from one cut-out clip to the next (or to another copy of the same clip) the one player stays and only loads the other file
 * — and loads nothing at all for the two halves of a split, which share a copy.
 * It reports the copy it is SHOWING (`followerShown.ts`): the player's own word that a frame of this uri has been presented, and
 * nothing again once it is handed another copy or unmounts — so `ClipFrame` keeps the clip's own picture until then. The two halves
 * of a split keep the report (the uri did not change). Keyed on the uri alone, never on the playhead.
 */
export function CutoutFollower({ clip, uri }: { clip: Clip; uri: string }) {
  const offset = useEditorStore((s) => {
    const hit = s.project ? clipAt(s.project, s.playhead) : null;
    return hit && hit.clip.id === clip.id ? hit.offsetInClip : 0;
  });
  const follower = useMemo<LayerClip>(() => ({ ...clip, sourceUri: uri, muted: true, start: 0 }), [clip, uri]);
  useEffect(() => () => { setFollowerShown(null); }, [uri]);
  return <LayerVideo layer={follower} offset={offset} onShown={setFollowerShown} />;
}
