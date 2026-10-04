import { useEffect, useState, type ReactNode } from "react";
import { Image, View } from "react-native";
import { coversFrame, maskRadius, placeClip } from "@/src/editor/model/clipLayout";
import { hasClipMotion, resolveClipMotion } from "@/src/editor/model/motion";
import { isPhoto, type Clip, type ClipTransform } from "@/src/editor/model/types";
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
 * Draws one clip in a frame of `frameW`×`frameH`: its background (only where the picture leaves the frame
 * uncovered), then the cropped picture placed by `placeClip`. A video's picture is `children` (the single
 * `VideoView`, `contentFit="fill"`); a photo's picture is an `Image` and `children` are ignored.
 * `transform` / `opacity` are the clip's motion at the playhead (animations, keyframes, its own opacity — see `clipFrameMotion`):
 * the transform replaces the clip's own for placement, the opacity fades the picture only. Both absent for a default clip. Only
 * styles change with them — the tree stays the same, so the `VideoView` never remounts.
 * A mask (`clip.mask`) rounds the picture box by `maskRadius`; the box clips, so the picture and `overlayChildren` are cut to it.
 * `transparent` (layers): no background at all — what the picture does not cover shows what is beneath.
 * `overlayChildren` are drawn inside the picture box above the picture (a layer's own filter / adjust layers).
 */
export function ClipFrame({ clip, frameW, frameH, transform, opacity, transparent, overlayChildren, children }:
  { clip: Clip; frameW: number; frameH: number; transform?: ClipTransform; opacity?: number; transparent?: boolean; overlayChildren?: ReactNode; children?: ReactNode }) {
  const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, transform ?? clip.transform, frameW, frameH);
  const masked = clip.mask !== "none";
  // A see-through picture shows the clip's own background behind it, as the export does; so do a mask's cut-off corners.
  const showBackground = !transparent && (!coversFrame(placed, frameW, frameH) || (opacity !== undefined && opacity < 1) || masked);
  // A clip with motion asks for its blur still up front, so the first faded frames are not black while it loads.
  const blurStill = useBlurStill(clip, !transparent && (showBackground || opacity !== undefined) && clip.background.type === "blur");
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
        <View testID="clip-content" style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH }}>
          {isPhoto(clip)
            ? <Image testID="clip-photo" source={{ uri: clip.sourceUri }} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
            : children}
        </View>
        {overlayChildren}
      </View>
    </View>
  );
}
