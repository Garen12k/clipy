import { View } from "react-native";
import { isSteadyAvailable } from "@/modules/clipy-video";
import { shownCutout, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { useFollowerShown } from "@/src/editor/followerShown";
import { adjustNeedsTag } from "@/src/editor/model/adjust";
import { placeClip } from "@/src/editor/model/clipLayout";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { activeEffects } from "@/src/editor/model/effectMath";
import { frameSize } from "@/src/editor/model/ops";
import { STEADY_PREVIEW, steadyOf } from "@/src/editor/model/steady";
import { clipAt, hasSpeedCurve, isInTransitionWindow, layersAt } from "@/src/editor/model/timeline";
import { activeCutout, isPhoto, type Clip, type Project } from "@/src/editor/model/types";
import { shownSteady, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";
import { backgroundShows, clipFrameMotion, mainFollower } from "./ClipFrame";

/**
 * Whether the preview only approximates the current frame: the clip has a filter (at a strength above 0), the playhead is in a
 * transition window, the clip is reversed (the preview plays forwards), the clip has a speed curve (the rate
 * switches step by step, which can hitch, and the sound changes pitch in steps), any Adjust value is non-zero, a
 * timeline effect (a blur / mosaic box included) covers the playhead, a layer at the playhead has a blend mode other than Normal,
 * the clip or a layer at the playhead has a green screen, or its blur background is visible — the picture, placed where its motion puts it at the
 * playhead, does not cover the frame, is not fully opaque (its own opacity × its motion's) or has a mask: `backgroundShows`, the
 * rule `ClipFrame` draws the background by.
 */
export function needsPreviewTag(p: Project, playhead: number): boolean {
  const hit = clipAt(p, playhead);
  if (!hit) return false;
  const c = hit.clip;
  if ((c.filter && c.filterIntensity > 0) || c.reversed || hasSpeedCurve(c) || isInTransitionWindow(p, playhead)) return true;
  if (adjustNeedsTag(c.adjust) || activeEffects(p.effects, playhead).length > 0) return true;
  // A layer on screen whose own look or timing the preview only approximates (the same rules as for the clip above).
  if (layersAt(p, playhead).some((l) => (l.filter && l.filterIntensity > 0) || adjustNeedsTag(l.adjust) || l.reversed || hasSpeedCurve(l))) return true;
  // Shown only in the export: a layer's blend mode, and a green screen on the clip or on a layer. (A blur / mosaic box is a
  // timeline effect: `activeEffects` above already counts it.)
  if (c.chroma || layersAt(p, playhead).some((l) => l.blend !== "normal" || l.chroma)) return true;
  if (c.background.type !== "blur") return false;
  const f = frameSize(p);
  const motion = clipFrameMotion(c, hit.offsetInClip);   // what PreviewPlayer hands the clip's ClipFrame
  return backgroundShows(c, placeClip({ width: c.width, height: c.height }, c.crop, motion.transform ?? c.transform, f.width, f.height), motion.opacity, f.width, f.height);
}

/**
 * Whether Remove background makes the preview differ from the export at the playhead: a clip or layer on screen has the switch on
 * and the preview does not show its cut-out as the export will — the copy is not ready (or cannot be made), that kind of video
 * preview is switched off (`CUTOUT_PREVIEW`), or a main clip's background is Blur (the preview blurs a still of the first frame; the export blurs the moving original).
 */
export function cutoutNeedsTag(p: Project, playhead: number, files: Record<string, CutoutFile>): boolean {
  const asExported = (c: Clip, main: boolean): boolean => {
    if (!activeCutout(c)) return true;
    if (shownCutout(files, c) === null) return false;
    if (main && c.background.type === "blur") return false;
    if (isPhoto(c)) return true;
    return main ? CUTOUT_PREVIEW.mainVideo : CUTOUT_PREVIEW.layerVideo;
  };
  const hit = clipAt(p, playhead);
  return (!!hit && !asExported(hit.clip, true)) || layersAt(p, playhead).some((l) => !asExported(l, false));
}

/** `cutoutNeedsTag` for what the two stores hold right now. */
const cutoutTagNow = (): boolean => {
  const s = useEditorStore.getState();
  return !!s.project && cutoutNeedsTag(s.project, s.playhead, useCutoutFiles.getState().files);
};

/**
 * Whether Stabilize / Smooth slow motion makes the preview differ from the export at the playhead: a clip or layer on screen has a
 * setting and the preview is not showing its copy — it is not ready (or cannot be made), or that kind of preview is switched off
 * (`STEADY_PREVIEW`).
 */
export function steadyNeedsTag(p: Project, playhead: number, files: Record<string, SteadyFile>): boolean {
  const asExported = (c: Clip, main: boolean): boolean =>
    steadyOf(c) === null || (shownSteady(files, c) !== null && (main ? STEADY_PREVIEW.mainVideo : STEADY_PREVIEW.layerVideo));
  const hit = clipAt(p, playhead);
  return (!!hit && !asExported(hit.clip, true)) || layersAt(p, playhead).some((l) => !asExported(l, false));
}
/**
 * `steadyNeedsTag` for what the two stores hold right now. Never on a build without the tool: no copy can be made there and the
 * export sends such a clip as it is (`useExport`), so the preview already shows what goes out.
 */
const steadyTagNow = (): boolean => {
  const s = useEditorStore.getState();
  return !!s.project && steadyNeedsTag(s.project, s.playhead, useSteadyFiles.getState().files) && isSteadyAvailable();   // the build is asked last: only for a frame that would show the tag
};

/**
 * Whether the main clip at the playhead has a ready copy that the preview is not SHOWING yet: its second player (`mainFollower`,
 * the rule `ClipFrame` mounts it by) has not presented a frame of that copy (`shown` — `followerShown.ts`), so the clip's own
 * picture is still what is on screen. A copy on disk is not a picture.
 */
export function followerNeedsTag(p: Project, playhead: number, cutFiles: Record<string, CutoutFile>, steadyFiles: Record<string, SteadyFile>, shown: string | null): boolean {
  const hit = clipAt(p, playhead);
  if (!hit) return false;
  const followed = mainFollower(hit.clip, shownCutout(cutFiles, hit.clip), shownSteady(steadyFiles, hit.clip));
  return followed !== null && followed.uri !== shown;
}
/** `followerNeedsTag` for what the four stores hold right now. */
const followerTagNow = (): boolean => {
  const s = useEditorStore.getState();
  return !!s.project && followerNeedsTag(s.project, s.playhead, useCutoutFiles.getState().files, useSteadyFiles.getState().files, useFollowerShown.getState().uri);
};

/**
 * Small chip shown over the preview when the current frame is an approximation of the export (see `needsPreviewTag`), or shows a
 * clip whose background the export will remove and the preview does not (`cutoutNeedsTag` — asked here, of both stores, as one
 * yes / no: the chip is drawn again only when the answer changes, not on every tick or percent). The same for a clip whose steady
 * copy the preview is not showing (steadyNeedsTag), and for a main clip whose ready copy has not reached the screen yet
 * (`followerNeedsTag`: the tag goes with the copy's first presented frame, not with the file).
 */
export function PreviewTag({ visible }: { visible: boolean }) {
  const cutNow = useEditorStore(cutoutTagNow);      // asked again when the project or the playhead changes …
  const cutThen = useCutoutFiles(cutoutTagNow);     // … and when a copy does: the same answer, read from both stores
  const steadyNow = useEditorStore(steadyTagNow);
  const steadyThen = useSteadyFiles(steadyTagNow);
  // One answer read from four stores: asked again whenever any of them changes.
  const waitA = useEditorStore(followerTagNow), waitB = useCutoutFiles(followerTagNow), waitC = useSteadyFiles(followerTagNow), waitD = useFollowerShown(followerTagNow);
  if (!visible && !cutNow && !cutThen && !steadyNow && !steadyThen && !waitA && !waitB && !waitC && !waitD) return null;
  return (
    <View
      testID="preview-tag"
      pointerEvents="none"
      style={{
        position: "absolute", left: 8, top: 8, overflow: "hidden",
        borderWidth: 1, borderColor: theme.colors.hairline,
        borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong,
        paddingHorizontal: theme.space.sm, paddingVertical: theme.space.xs,
      }}
    >
      <Body weight="semi" style={{ fontSize: 10, color: theme.colors.accent }}>Preview</Body>
    </View>
  );
}
