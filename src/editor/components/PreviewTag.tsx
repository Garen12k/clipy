import { Ionicons } from "@expo/vector-icons";
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
 * Why the tag shows, in the words of the tool that causes it — the names the toolbar, the strips and the clip badges already use.
 * The tag names ONE reason: the first that applies, in the order the checks have always run.
 */
export const REASON = {
  filter: "Filter", reversed: "Reversed", curve: "Speed curve", transition: "Transition", adjust: "Adjust", effect: "Effect",
  chroma: "Green screen", blend: "Blend", blur: "Blur background",
  cutout: "Remove background", stabilize: "Stabilize", slow: "Slow motion",
} as const;

/**
 * Why the preview only approximates the current frame, or null when it does not: the clip has a filter (at a strength above 0), is
 * reversed (the preview plays forwards), has a speed curve (the rate switches step by step, which can hitch, and the sound changes
 * pitch in steps), the playhead is in a transition window, any Adjust value is non-zero, a timeline effect (a blur / mosaic box
 * included) covers the playhead, a layer at the playhead has one of those looks or timings, the clip or a layer at the playhead has
 * a green screen, a layer there has a blend mode other than Normal, or the clip's blur background is visible — the picture, placed
 * where its motion puts it at the playhead, does not cover the frame, is not fully opaque (its own opacity × its motion's) or has a
 * mask: `backgroundShows`, the rule `ClipFrame` draws the background by. The FIRST that applies is the answer.
 */
export function previewReason(p: Project, playhead: number): string | null {
  const hit = clipAt(p, playhead);
  if (!hit) return null;
  const c = hit.clip;
  if (c.filter && c.filterIntensity > 0) return REASON.filter;
  if (c.reversed) return REASON.reversed;
  if (hasSpeedCurve(c)) return REASON.curve;
  if (isInTransitionWindow(p, playhead)) return REASON.transition;
  if (adjustNeedsTag(c.adjust)) return REASON.adjust;
  if (activeEffects(p.effects, playhead).length > 0) return REASON.effect;
  // A layer on screen whose own look or timing the preview only approximates (the same rules as for the clip above).
  const layers = layersAt(p, playhead);
  for (const l of layers) {
    if (l.filter && l.filterIntensity > 0) return REASON.filter;
    if (adjustNeedsTag(l.adjust)) return REASON.adjust;
    if (l.reversed) return REASON.reversed;
    if (hasSpeedCurve(l)) return REASON.curve;
  }
  // Shown only in the export: a green screen on the clip or on a layer, and a layer's blend mode. (A blur / mosaic box is a
  // timeline effect: `activeEffects` above already counts it.)
  if (c.chroma) return REASON.chroma;
  for (const l of layers) { if (l.blend !== "normal") return REASON.blend; if (l.chroma) return REASON.chroma; }
  if (c.background.type !== "blur") return null;
  const f = frameSize(p);
  const motion = clipFrameMotion(c, hit.offsetInClip);   // what PreviewPlayer hands the clip's ClipFrame
  return backgroundShows(c, placeClip({ width: c.width, height: c.height }, c.crop, motion.transform ?? c.transform, f.width, f.height), motion.opacity, f.width, f.height) ? REASON.blur : null;
}
/** Whether the preview only approximates the current frame (see `previewReason`). */
export const needsPreviewTag = (p: Project, playhead: number): boolean => previewReason(p, playhead) !== null;

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

/** Which of the two a clip's steady copy is for, as the tag names it: Stabilize when it has a strength, else Slow motion. */
const steadyName = (c: Clip): string => ((steadyOf(c)?.level ?? 0) > 0 ? REASON.stabilize : REASON.slow);
/**
 * Why Stabilize / Smooth slow motion makes the preview differ from the export at the playhead, or null: a clip or layer on screen
 * has a setting and the preview is not showing its copy — it is not ready (or cannot be made), or that kind of preview is switched
 * off (`STEADY_PREVIEW`). The main clip is asked first.
 */
export function steadyReason(p: Project, playhead: number, files: Record<string, SteadyFile>): string | null {
  const asExported = (c: Clip, main: boolean): boolean =>
    steadyOf(c) === null || (shownSteady(files, c) !== null && (main ? STEADY_PREVIEW.mainVideo : STEADY_PREVIEW.layerVideo));
  const hit = clipAt(p, playhead);
  if (hit && !asExported(hit.clip, true)) return steadyName(hit.clip);
  const layer = layersAt(p, playhead).find((l) => !asExported(l, false));
  return layer ? steadyName(layer) : null;
}
/** Whether Stabilize / Smooth slow motion makes the preview differ from the export at the playhead (see `steadyReason`). */
export const steadyNeedsTag = (p: Project, playhead: number, files: Record<string, SteadyFile>): boolean => steadyReason(p, playhead, files) !== null;

/**
 * Why the main clip at the playhead still waits for its copy on screen, or null: it has a ready copy that the preview is not
 * SHOWING yet — its second player (`mainFollower`, the rule `ClipFrame` mounts it by) has not presented a frame of that copy
 * (`shown` — `followerShown.ts`), so the clip's own picture is still what is on screen. A copy on disk is not a picture.
 */
export function followerReason(p: Project, playhead: number, cutFiles: Record<string, CutoutFile>, steadyFiles: Record<string, SteadyFile>, shown: string | null): string | null {
  const hit = clipAt(p, playhead);
  if (!hit) return null;
  const followed = mainFollower(hit.clip, shownCutout(cutFiles, hit.clip), shownSteady(steadyFiles, hit.clip));
  if (followed === null || followed.uri === shown) return null;
  return followed.kind === "cutout" ? REASON.cutout : steadyName(hit.clip);
}
/** Whether the main clip at the playhead has a ready copy that the preview is not showing yet (see `followerReason`). */
export const followerNeedsTag = (p: Project, playhead: number, cutFiles: Record<string, CutoutFile>, steadyFiles: Record<string, SteadyFile>, shown: string | null): boolean =>
  followerReason(p, playhead, cutFiles, steadyFiles, shown) !== null;

/**
 * What the tag says for what the four stores hold right now: null = no tag; a reason; or "" = the tag with no reason to name
 * (`visible` without one — it then says only "Preview"). `visible` is `needsPreviewTag` as the preview computed it; its reason is
 * looked up only then, so a frame without a tag costs what it did. The order is the order the checks have always had: the frame's
 * own looks, Remove background, Stabilize / Slow motion — never on a build without the tool: no copy can be made there and the
 * export sends such a clip as it is (`useExport`), so the preview already shows what goes out; the build is asked last, only for a
 * frame that would show the tag — and then a copy that has not reached the screen.
 */
export function tagReasonNow(visible: boolean): string | null {
  const s = useEditorStore.getState(), p = s.project;
  if (!p) return visible ? "" : null;
  const own = visible ? previewReason(p, s.playhead) : null;
  if (own !== null) return own;
  if (cutoutNeedsTag(p, s.playhead, useCutoutFiles.getState().files)) return REASON.cutout;
  const steady = steadyReason(p, s.playhead, useSteadyFiles.getState().files);
  if (steady !== null && isSteadyAvailable()) return steady;
  const waiting = followerReason(p, s.playhead, useCutoutFiles.getState().files, useSteadyFiles.getState().files, useFollowerShown.getState().uri);
  return waiting ?? (visible ? "" : null);
}

/**
 * Small chip over the preview when the current frame is an approximation of the export. It says why — "Preview · Filter" — naming
 * the FIRST reason that applies and nothing else (`tagReasonNow`). One answer read from four stores (the project and the playhead,
 * the cut-out copies, the steady copies, what the second player has presented): asked again whenever any of them changes, and the
 * chip is drawn again only when the answer does, not on every tick or percent. It is information only: it takes no touches. A solid
 * scrim, never a blur; white words (gold is never body text) after a gold info symbol; one line that shrinks, then ends in dots,
 * rather than leave a narrow frame.
 */
export function PreviewTag({ visible }: { visible: boolean }) {
  const now = () => tagReasonNow(visible);
  const reason = useEditorStore(now);
  useCutoutFiles(now); useSteadyFiles(now); useFollowerShown(now);   // the same answer: these only ask again when a copy or the shown frame changes
  if (reason === null) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: theme.space.sm, right: theme.space.sm, top: theme.space.sm, flexDirection: "row" }}>
      <View
        testID="preview-tag"
        pointerEvents="none"
        style={{
          flexShrink: 1, flexDirection: "row", alignItems: "center", gap: theme.space.xs, overflow: "hidden",
          borderWidth: 1, borderColor: theme.colors.hairline,
          borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong,
          paddingHorizontal: theme.space.sm, paddingVertical: theme.space.xs,
        }}
      >
        <Ionicons testID="preview-tag-info" name="information-circle-outline" size={12} color={theme.colors.accent} />
        <Body testID="preview-tag-text" weight="semi" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flexShrink: 1, fontSize: theme.type.micro, color: theme.colors.text }}>
          {reason ? `Preview · ${reason}` : "Preview"}
        </Body>
      </View>
    </View>
  );
}
