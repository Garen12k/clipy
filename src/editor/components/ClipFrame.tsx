import { useEffect, useState, type ReactNode } from "react";
import { Image, View } from "react-native";
import { coversFrame, placeClip } from "@/src/editor/model/clipLayout";
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

/**
 * Draws one clip in a frame of `frameW`×`frameH`: its background (only where the picture leaves the frame
 * uncovered), then the cropped picture placed by `placeClip`. A video's picture is `children` (the single
 * `VideoView`, `contentFit="fill"`); a photo's picture is an `Image` and `children` are ignored.
 * `transform` / `opacity` are the clip's motion at the playhead (animations, keyframes): the transform replaces the
 * clip's own for placement, the opacity fades the picture only. Both absent for a clip without motion. Only styles
 * change with them — the tree stays the same, so the `VideoView` never remounts.
 */
export function ClipFrame({ clip, frameW, frameH, transform, opacity, children }:
  { clip: Clip; frameW: number; frameH: number; transform?: ClipTransform; opacity?: number; children?: ReactNode }) {
  const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, transform ?? clip.transform, frameW, frameH);
  // A see-through picture shows the clip's own background behind it, as the export does.
  const showBackground = !coversFrame(placed, frameW, frameH) || (opacity !== undefined && opacity < 1);
  // A clip with motion asks for its blur still up front, so the first faded frames are not black while it loads.
  const blurStill = useBlurStill(clip, (showBackground || opacity !== undefined) && clip.background.type === "blur");
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
        }}>
        <View testID="clip-content" style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH }}>
          {isPhoto(clip)
            ? <Image testID="clip-photo" source={{ uri: clip.sourceUri }} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
            : children}
        </View>
      </View>
    </View>
  );
}
