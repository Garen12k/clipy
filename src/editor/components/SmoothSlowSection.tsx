import { Switch, View } from "react-native";
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipSmooth } from "@/src/editor/model/ops";
import { SMOOTH, steadyBytes, steadyOf, steadyRefusal, type SteadyRefusal } from "@/src/editor/model/steady";
import type { Clip } from "@/src/editor/model/types";
import { steadyFileOf, steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP } from "@/src/ui/ToolStrip";

/** Said where the switch is tapped on a video whose trimmed source is over the limit, and in the tab for such a clip. */
export const SMOOTH_TOO_LONG = "Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first.";
/** Said where the switch is tapped on a clip whose Remove background is on, and in the tab for such a clip: one copy per clip. */
export const SMOOTH_WITH_CUTOUT = "Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first.";
const NAME = "Smooth slow motion";
const SMOOTHING = "Smoothing the slow motion";
const FILE_MISSING = "The file of this clip is missing.";

/** The tab's one status line: what the copy will take, how far it is, that it is ready, or why it is not (`blocked` as in the Stabilize strip). */
export function smoothStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string {
  if (more.cutout) return SMOOTH_WITH_CUTOUT;
  if (more.refusal === "tooLong") return SMOOTH_TOO_LONG;
  if (!on) return `Fills the gaps between frames with blended ones. The copy takes about ${Number.isFinite(more.bytes) ? Math.max(1, Math.round(more.bytes / 1000000)) : 1} MB.`;
  const file = more.file;
  if (file === undefined) return more.blocked === "build" ? STEADY_TOOLS : more.blocked === "missing" ? FILE_MISSING : "Waiting to start.";
  if (file.status === "busy") return `${SMOOTHING}: ${Number.isFinite(file.progress) ? Math.min(100, Math.max(0, Math.round(file.progress * 100))) : 0} %`;
  if (file.status === "ready") return "Ready.";
  return "Could not smooth the slow motion. Switch it off and on to try again.";
}

/** The clip as it would be with the switch on: what its copy would be called and take. */
const withSmooth = (clip: Clip): Clip => ({ ...clip, smooth: true });

/**
 * The Slow motion tab's tiles row (it sits inside the Speed strip's `StripTiles`): the switch and its name. Switching on is one
 * undo step and only writes the switch — the copy with the in-between frames is prepared by the queue (`steadyRenders.ts`) and the
 * clip plays as it did until the copy is ready. Off is never refused. This is NOT the Curve tab's Smooth switch (that one chooses
 * how the speed changes); this one is about the picture while the clip is slow.
 */
export function SmoothSwitch({ clip }: { clip: Clip }) {
  const apply = useEditorStore((s) => s.apply);
  const on = clip.smooth === true;
  const toggle = (next: boolean) => {
    if (next === on) return;
    if (!next) { apply((p) => setClipSmooth(p, clip.id, false)); return; }
    if (!isSteadyAvailable()) { useToast.getState().show(STEADY_TOOLS); return; }
    if (clip.cutout === true) { useToast.getState().show(SMOOTH_WITH_CUTOUT); return; }
    if (steadyRefusal(clip) === "tooLong") { useToast.getState().show(SMOOTH_TOO_LONG); return; }
    haptic("light");
    // A copy that failed before is asked for again by this tap.
    const need = steadyNeedOf(useSteadyFiles.getState().files, withSmooth(clip));
    if (need !== null) retrySteady(need.name);
    apply((p) => setClipSmooth(p, clip.id, true));
  };
  return (
    <View testID="smooth-slow-switch" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <Switch accessibilityLabel={NAME} value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />
      <Body numberOfLines={1} style={{ fontSize: theme.type.small }}>{NAME}</Body>
    </View>
  );
}

/** The tab's bottom row (height STRIP.slider): the one place that follows the clip's copy; a percent re-renders this row and nothing else. */
export function SmoothStatus({ clip }: { clip: Clip }) {
  const file = useSteadyFiles((s) => steadyFileOf(s.files, clip));
  const missing = useEditorStore((s) => s.missingSourceUris.includes(clip.sourceUri));
  const on = clip.smooth === true;
  const blocked = !isSteadyAvailable() ? "build" : missing ? "missing" : null;
  const bytes = steadyBytes(clip, steadyOf(withSmooth(clip)) ?? { level: 0, grid: SMOOTH.fullGrid });
  return (
    <View testID="smooth-slow-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      {on && file !== undefined && file.status === "busy" ? <Spinner label={SMOOTHING} /> : null}
      <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{smoothStatus(on, { cutout: clip.cutout === true, refusal: steadyRefusal(clip), file, bytes, blocked })}</Body>
    </View>
  );
}
