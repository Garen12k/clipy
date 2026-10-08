import { Switch, View } from "react-native";
import { isCutoutAvailable } from "@/modules/clipy-video";
import { cutoutFileOf, cutoutNeedOf, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { isNoPerson, retryCutout } from "@/src/editor/cutoutRenders";
import { cutoutBytes, cutoutRefusal, type CutoutRefusal } from "@/src/editor/model/cutout";
import { setClipCutout } from "@/src/editor/model/ops";
import { isPhoto, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, ToolStrip } from "@/src/ui/ToolStrip";

/** Said where the switch is tapped on a video whose trimmed source is over the limit, and in the strip for such a clip. */
export const CUTOUT_TOO_LONG = "Remove background works on clips up to 60 seconds. Trim or split this clip first.";
/** Said in the strip for a switched-on clip whose own file is gone: its copy is never made. */
export const CUTOUT_FILE_MISSING = "The file of this clip is missing.";
const HINT = "The phone finds the person and hides everything else.";
const PREPARING = "Preparing the cut-out";

/**
 * The strip's one status line: what the copy will take, how far it is, that it is ready, or why it is not. `more.blocked`: why a
 * copy nobody has asked for yet never will be (this build has no tool for it, or the clip's file is missing) — said instead of
 * waiting for ever. `more.photo`: the phone reports no progress for a photo, so its line has no percent.
 */
export function cutoutStatus(on: boolean, refusal: CutoutRefusal | null, file: CutoutFile | undefined, bytes: number, more: { blocked?: "build" | "missing" | null; photo?: boolean } = {}): string {
  if (refusal === "tooLong") return CUTOUT_TOO_LONG;
  if (!on) return `People only. The copy takes about ${Number.isFinite(bytes) ? Math.max(1, Math.round(bytes / 1000000)) : 1} MB.`;
  if (file === undefined) return more.blocked === "build" ? BEATS_BACKGROUND_TOOLS : more.blocked === "missing" ? CUTOUT_FILE_MISSING : "Waiting to start.";
  if (file.status === "busy" && more.photo === true) return `${PREPARING}.`;
  if (file.status === "busy") return `${PREPARING}: ${Number.isFinite(file.progress) ? Math.min(100, Math.max(0, Math.round(file.progress * 100))) : 0} %`;
  if (file.status === "ready") return "Ready.";
  return isNoPerson(file.message) ? "No person was found in this clip." : "Could not remove the background. Switch it off and on to try again.";
}

/**
 * The status row (height STRIP.slider). The one place that follows the clip's copy: it is mounted only while the strip shows, and its
 * selector returns the stored entry, so a render's percent re-renders this row and nothing else.
 */
function CutoutStatus({ clip }: { clip: Clip }) {
  const file = useCutoutFiles((s) => cutoutFileOf(s.files, clip));
  const missing = useEditorStore((s) => s.missingSourceUris.includes(clip.sourceUri));
  const on = clip.cutout === true;
  const blocked = !isCutoutAvailable() ? "build" : missing ? "missing" : null;
  return (
    <View testID="cutout-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      {on && file !== undefined && file.status === "busy" ? <Spinner label={PREPARING} /> : null}
      <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{cutoutStatus(on, cutoutRefusal(clip), file, cutoutBytes(clip), { blocked, photo: isPhoto(clip) })}</Body>
    </View>
  );
}

/**
 * The selected clip's or layer's Remove background: one switch and one status line. Switching on is one undo step and only writes
 * the switch — the cut-out copy is prepared by the queue (`cutoutRenders.ts`), and the clip shows as it was until the copy is
 * ready. The original file is never changed; switching off brings the clip back at once, and is never refused.
 */
export function CutoutSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  if (!clip) return null;
  const on = clip.cutout === true;
  const toggle = (next: boolean) => {
    if (next === on) return;
    if (!next) { apply((p) => setClipCutout(p, clip.id, false)); return; }
    if (!isCutoutAvailable()) { useToast.getState().show(BEATS_BACKGROUND_TOOLS); return; }
    const refusal = cutoutRefusal(clip);
    if (refusal === "tooLong") { useToast.getState().show(CUTOUT_TOO_LONG); return; }
    if (refusal !== null) return;
    haptic("light");
    // A copy that failed before is asked for again by this tap (the queue forgets a failed copy nobody needs, so this is a second lock).
    retryCutout(cutoutNeedOf(useCutoutFiles.getState().files, clip).name);
    apply((p) => setClipCutout(p, clip.id, true));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Remove background" note={<StripNote>Edges are not perfect</StripNote>}>
      {/* Not StripTiles: its row scrolls sideways, and this sentence must wrap beside the switch instead. `flex: 1` shares the row's WIDTH. */}
      <View testID="cutout-switch" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter }}>
        <Switch accessibilityLabel="Remove background" value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />
        <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{HINT}</Body>
      </View>
      <CutoutStatus clip={clip} />
    </ToolStrip>
  );
}
