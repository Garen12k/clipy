import { View } from "react-native";
import { adjustNeedsTag } from "@/src/editor/model/adjust";
import { coversFrame, placeClip } from "@/src/editor/model/clipLayout";
import { activeEffects } from "@/src/editor/model/effectMath";
import { hasClipMotion, resolveClipMotion } from "@/src/editor/model/motion";
import { frameSize } from "@/src/editor/model/ops";
import { clipAt, isInTransitionWindow } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";

/**
 * Whether the preview only approximates the current frame: the clip has a filter (at a strength above 0), the playhead is in a
 * transition window, the clip is reversed (the preview plays forwards), the clip has a speed curve (the rate
 * switches step by step, which can hitch, and the sound changes pitch in steps), any Adjust value is non-zero, a
 * timeline effect covers the playhead, or its blur background is visible — the picture, placed where its motion puts it at the
 * playhead, does not cover the frame or is not fully opaque (the rule `ClipFrame` draws the background by).
 */
export function needsPreviewTag(p: Project, playhead: number): boolean {
  const hit = clipAt(p, playhead);
  if (!hit) return false;
  const c = hit.clip;
  if ((c.filter && c.filterIntensity > 0) || c.reversed || c.speedCurve !== null || isInTransitionWindow(p, playhead)) return true;
  if (adjustNeedsTag(c.adjust) || activeEffects(p.effects, playhead).length > 0) return true;
  if (c.background.type !== "blur") return false;
  const f = frameSize(p);
  const motion = hasClipMotion(c) ? resolveClipMotion(c, hit.offsetInClip) : null;
  if (motion && motion.opacity < 1) return true;
  return !coversFrame(placeClip({ width: c.width, height: c.height }, c.crop, motion ? motion.transform : c.transform, f.width, f.height), f.width, f.height);
}

/** Small chip shown over the preview when the current frame is an approximation of the export (see `needsPreviewTag`). */
export function PreviewTag({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View
      testID="preview-tag"
      pointerEvents="none"
      style={{
        position: "absolute", left: 8, top: 8, overflow: "hidden",
        borderWidth: 1, borderColor: theme.colors.hairline,
        borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong,
        paddingHorizontal: 8, paddingVertical: 3,
      }}
    >
      <Body weight="semi" style={{ fontSize: 10, color: theme.colors.accent }}>Preview</Body>
    </View>
  );
}
