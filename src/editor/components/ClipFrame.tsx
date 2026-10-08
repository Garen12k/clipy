import { useEffect, useState, type ReactNode } from "react";
import { Image, View } from "react-native";
import { shownCutout, useCutoutFiles } from "@/src/editor/cutoutFiles";
import { coversFrame, maskRadius, placeClip, type PlacedClip } from "@/src/editor/model/clipLayout";
import { useFollowerShown } from "@/src/editor/followerShown";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { hasClipMotion, resolveClipMotion } from "@/src/editor/model/motion";
import { STEADY_PREVIEW } from "@/src/editor/model/steady";
import { isPhoto, type Clip, type ClipTransform } from "@/src/editor/model/types";
import { shownSteady, useSteadyFiles } from "@/src/editor/steadyFiles";
import { getThumb } from "./thumbnails";

/** The empty-frame colour the export also draws behind a clip (user content, not UI chrome). */
const BLACK = "black";
const BLUR_RADIUS = 24;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/** The still a blur background is made from: the photo itself, or a thumbnail of the clip's first frame. Null until ready. */
function useBlurStill(clip: Clip, wanted: boolean): string | null {
  const photo = isPhoto(clip);
  const [thumb, setThumb] = useState<{ key: string; uri: string } | null>(null);
  const key = `${clip.sourceUri}|${clip.trimStart}`;
  useEffect(() => {
    if (!wanted || photo) return;
    let alive = true;
    getThumb(clip.sourceUri, clip.trimStart).then((uri) => { if (alive) setThumb({ key, uri }); }).catch(() => {});
    return () => { alive = false; };
  }, [wanted, photo, key, clip.sourceUri, clip.trimStart]);
  if (!wanted) return null;
  if (photo) return clip.sourceUri;
  return thumb?.key === key ? thumb.uri : null;
}

const NO_MOTION: { transform?: ClipTransform; opacity?: number } = {};
/**
 * What a clip (or layer) hands its `ClipFrame` at `offsetInClip`: nothing for a default clip (so its tree and styles stay as they
 * always were), the opacity alone for a clip that is only see-through (`clip.opacity` below 1), and the resolved transform and
 * opacity (motion × the clip's own) for a clip with animations or keyframes.
 */
export function clipFrameMotion(clip: Clip, offsetInClip: number): { transform?: ClipTransform; opacity?: number } {
  const moving = hasClipMotion(clip);
  if (!moving && !(clip.opacity < 1)) return NO_MOTION;
  const m = resolveClipMotion(clip, offsetInClip);
  return moving ? m : { opacity: m.opacity };
}

/**
 * Whether a main clip's background can be seen behind its picture (`placed`, with the opacity `clipFrameMotion` gives — undefined for
 * an opaque clip): the picture leaves part of the frame uncovered, is see-through, or has a mask (its cut-off corners). The one rule
 * `ClipFrame` draws the background by and the Preview tag goes by.
 */
export function backgroundShows(clip: Clip, placed: PlacedClip, opacity: number | undefined, frameW: number, frameH: number): boolean {
  return !coversFrame(placed, frameW, frameH) || (opacity !== undefined && opacity < 1) || clip.mask !== "none";
}

/**
 * Which copy of a MAIN clip plays in the second player (`CutoutFollower`), given its ready cut-out and steady copies (null = none):
 * the cut-out comes first (the two never share a clip), a photo has no player, and each kind can be switched off. The one rule
 * `ClipFrame` mounts the follower by and the Preview tag waits for its first frame by. Call it in a render or inside a selector
 * that returns a yes / no — never return it from a selector (it is a new object each time).
 */
export function mainFollower(clip: Clip, cutUri: string | null, steadyUri: string | null): { kind: "cutout" | "steady"; uri: string } | null {
  if (isPhoto(clip)) return null;
  if (cutUri !== null) return CUTOUT_PREVIEW.mainVideo ? { kind: "cutout", uri: cutUri } : null;
  return steadyUri !== null && STEADY_PREVIEW.mainVideo ? { kind: "steady", uri: steadyUri } : null;
}

/**
 * Draws one clip in a frame of `frameW`×`frameH`: its background (only where the picture leaves the frame
 * uncovered), then the cropped picture placed by `placeClip`. A video's picture is `children` (the single
 * `VideoView`, `contentFit="fill"`); a photo's picture is an `Image` and `children` are ignored.
 * `transform` / `opacity` are the clip's motion at the playhead (animations, keyframes, its own opacity — see `clipFrameMotion`):
 * the transform replaces the clip's own for placement, the opacity fades the picture only. Both absent for a default clip. Only
 * styles change with them — the tree stays the same, so the `VideoView` never remounts.
 * A mask (`clip.mask`) rounds the picture box by `maskRadius`; the box clips, so the picture and `overlayChildren` are cut to it.
 * `transparent` (layers): no background at all — what the picture does not cover shows what is beneath.
 * `overlayChildren` are drawn inside the picture box above the picture (a layer's own filter / adjust layers).
 * Remove background (`cutout.ts`): a photo draws its PNG copy once that is ready; a main video's own picture is then hidden by
 * opacity (never unmounted) under a silent second player showing the copy (`CutoutFollower`), and a main clip's background is
 * always drawn behind a cut-out. A clip without a ready copy goes through none of it: its tree and styles are as they always were.
 * Stabilize / Smooth slow motion (steady.ts): a main video's steady copy, once ready, plays in the same follower laid OVER the clip's
 * own picture (the copy is opaque, so the picture underneath is not hidden); nothing else changes.
 * Either follower counts only once it SHOWS the copy (`followerShown.ts`: its player has presented a frame of this very uri). Until
 * then — the copy just became ready, the playhead just entered the clip, the clip moved to another copy — the follower is mounted
 * and loading but unseen (opacity 0), and the clip is drawn exactly as it is without a copy: never a frame of background alone.
 */
export function ClipFrame({ clip, frameW, frameH, transform, opacity, transparent, overlayChildren, children }:
  { clip: Clip; frameW: number; frameH: number; transform?: ClipTransform; opacity?: number; transparent?: boolean; overlayChildren?: ReactNode; children?: ReactNode }) {
  const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, transform ?? clip.transform, frameW, frameH);
  const masked = clip.mask !== "none";
  // Remove background: the clip's cut-out copy once it is ready (null = the clip is drawn as it is). The selector returns the
  // uri itself, so a render's progress (the store changes on every percent) draws nothing here.
  const cutUri = useCutoutFiles((s) => shownCutout(s.files, clip));
  // Stabilize / Smooth slow motion: the clip's steady copy once it is ready (null for a clip without one — and for a clip with a
  // cut-out: the two never share a clip). The selector returns the uri itself.
  const steadyUri = useSteadyFiles((s) => shownSteady(s.files, clip));
  const photo = isPhoto(clip);
  // A MAIN video cannot be handed another file (the preview's players load the clip's own): a silent player showing the copy is
  // laid in its place. Under a cut-out the clip's own picture is hidden (it keeps playing, with the sound); under a steady copy it
  // is not — the copy covers it. A layer's own player plays the copy.
  const followed = transparent ? null : mainFollower(clip, cutUri, steadyUri);
  const cutFollower = followed?.kind === "cutout";
  const follower = followed !== null;
  const copyUri = followed?.uri ?? null;
  // Whether that player has presented a frame of THIS copy (a yes / no: the playhead draws nothing here). A new uri is "no" in the
  // very render that brings it — nothing is remembered and nothing waits for an effect.
  const shown = useFollowerShown((s) => copyUri !== null && s.uri === copyUri);
  // A see-through picture shows the clip's own background behind it, as the export does; so do a mask's cut-off corners, and so
  // does a cut-out on the main track (always: what was the picture's background is see-through now) — a video's once it is shown.
  const cutOut = !transparent && cutUri !== null && (photo || (cutFollower && shown));
  const showBackground = !transparent && (cutOut || backgroundShows(clip, placed, opacity, frameW, frameH));
  // Loaded only when it is shown: suites that never show a copy do not load a video player for it.
  const Follower = follower ? (require("./CutoutFollower") as typeof import("./CutoutFollower")).CutoutFollower : null;
  // A clip with motion asks for its blur still up front, so the first faded frames are not black while it loads.
  // So does a cut-out whose player is still loading: the still is there when the picture gives way to it.
  const blurStill = useBlurStill(clip, !transparent && (showBackground || opacity !== undefined || cutFollower) && clip.background.type === "blur");
  const contentW = placed.width / clip.crop.w, contentH = placed.height / clip.crop.h;

  return (
    <View pointerEvents="none" style={{ ...fill, overflow: "hidden" }}>
      {showBackground && (
        <View testID="clip-background" style={{ ...fill, backgroundColor: clip.background.type === "color" ? clip.background.color : BLACK }}>
          {blurStill && <Image testID="clip-background-blur" source={{ uri: blurStill }} blurRadius={BLUR_RADIUS} resizeMode="cover" style={fill} />}
        </View>
      )}
      <View
        testID="clip-box"
        style={{
          position: "absolute", overflow: "hidden",
          left: placed.centerX - placed.width / 2, top: placed.centerY - placed.height / 2, width: placed.width, height: placed.height,
          transform: [{ rotate: `${placed.rotation}deg` }, { scaleX: placed.flipH ? -1 : 1 }, { scaleY: placed.flipV ? -1 : 1 }],
          ...(opacity === undefined ? null : { opacity }),
          ...(masked ? { borderRadius: maskRadius(placed, clip.mask) } : null),
        }}>
        <View testID="clip-content" style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH, ...(cutFollower && shown ? { opacity: 0 } : null) }}>
          {photo
            ? <Image testID="clip-photo" source={{ uri: cutUri ?? clip.sourceUri }} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
            : children}
        </View>
        {Follower && copyUri !== null ? (
          <View testID={cutFollower ? "clip-cutout" : "clip-steady"} style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH, ...(shown ? null : { opacity: 0 }) }}>
            <Follower clip={clip} uri={copyUri} />
          </View>
        ) : null}
        {overlayChildren}
      </View>
    </View>
  );
}
