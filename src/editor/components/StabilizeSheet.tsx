import { useMemo } from "react";
import { View } from "react-native";
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipStabilize } from "@/src/editor/model/ops";
import { STEADY_LEVELS, steadyBytes, steadyOf, steadyRefusal, type SteadyRefusal } from "@/src/editor/model/steady";
import { STABILIZE_IDS, type Clip, type StabilizeId } from "@/src/editor/model/types";
import { steadyFileOf, steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

/** Said where a strength is tapped on a video whose trimmed source is over the limit, and in the strip for such a clip. */
export const STABILIZE_TOO_LONG = "Stabilize works on clips up to 60 seconds. Trim or split this clip first.";
/** Said where a strength is tapped on a clip whose Remove background is on, and in the strip for such a clip: one copy per clip. */
export const STABILIZE_WITH_CUTOUT = "Stabilize does not work together with Remove background. Switch Remove background off for this clip first.";
/** Said in the strip for a clip with a setting whose own file is gone: its copy is never made. */
export const STEADY_FILE_MISSING = "The file of this clip is missing.";
const STEADYING = "Steadying the clip";
const LABELS: Record<StabilizeId, string> = { low: "Low", medium: "Medium", high: "High" };
/** The three bars inside a strength tile (points): as many filled as the strength. */
const BAR_WIDTH = 4;
const BAR_HEIGHTS = [8, 14, 20] as const;

/**
 * The strip's one status line: what the copy will take, how far it is, that it is ready, or why it is not. `blocked`: why a copy
 * nobody has asked for yet never will be (this build has no tool for it, or the clip's file is missing).
 */
export function stabilizeStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string {
  if (more.cutout) return STABILIZE_WITH_CUTOUT;
  if (more.refusal === "tooLong") return STABILIZE_TOO_LONG;
  if (!on) return `Takes out the shake. The copy takes about ${Number.isFinite(more.bytes) ? Math.max(1, Math.round(more.bytes / 1000000)) : 1} MB.`;
  const file = more.file;
  if (file === undefined) return more.blocked === "build" ? STEADY_TOOLS : more.blocked === "missing" ? STEADY_FILE_MISSING : "Waiting to start.";
  if (file.status === "busy") return `${STEADYING}: ${Number.isFinite(file.progress) ? Math.min(100, Math.max(0, Math.round(file.progress * 100))) : 0} %`;
  if (file.status === "ready") return "Ready.";
  return "Could not stabilize this clip. Tap the strength again to try again.";
}

/** The status row (height STRIP.slider): the one place that follows the clip's copy; its selector returns the stored entry, so a percent re-renders this row and nothing else. */
function StabilizeStatus({ clip }: { clip: Clip }) {
  const file = useSteadyFiles((s) => steadyFileOf(s.files, clip));
  const missing = useEditorStore((s) => s.missingSourceUris.includes(clip.sourceUri));
  const on = clip.stabilize !== undefined;
  const blocked = !isSteadyAvailable() ? "build" : missing ? "missing" : null;
  // Off: what a Medium copy of this clip would take (with the grid its Smooth slow motion already asks for, if any).
  const bytes = steadyBytes(clip, { level: STEADY_LEVELS.medium.level, grid: steadyOf(clip)?.grid ?? 0 });
  return (
    <View testID="stabilize-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      {on && file !== undefined && file.status === "busy" ? <Spinner label={STEADYING} /> : null}
      <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{stabilizeStatus(on, { cutout: clip.cutout === true, refusal: steadyRefusal(clip), file, bytes, blocked })}</Body>
    </View>
  );
}

function Bars({ filled, color }: { filled: number; color: string }) {
  return (
    <View style={{ height: BAR_HEIGHTS[2], flexDirection: "row", alignItems: "flex-end", gap: theme.space.xs }}>
      {BAR_HEIGHTS.map((height, i) => <View key={height} style={{ width: BAR_WIDTH, height, borderRadius: theme.radius.tile, backgroundColor: i < filled ? color : theme.colors.track }} />)}
    </View>
  );
}

/**
 * The selected video clip's or layer's Stabilize: Off / Low / Medium / High and one status line. A pick is one undo step and only
 * writes the strength — the steadied copy is prepared by the queue (`steadyRenders.ts`), and the clip shows as it was until the
 * copy is ready. The original file is never changed; Off brings the clip back at once and is never refused. Picking the strength
 * the clip already has asks again for a copy that failed.
 */
export function StabilizeSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  const current: StabilizeId | null = clip?.stabilize ?? null;
  // Where the row starts: the selected tile in view, worked out when the strip opens — not on every pick.
  const startX = useMemo(
    () => tilesStartX(current === null ? 0 : STABILIZE_IDS.indexOf(current) + 1, TILE_WIDTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id],
  );
  if (!clip) return null;
  const again = (level: StabilizeId) => {
    const need = steadyNeedOf(useSteadyFiles.getState().files, { ...clip, stabilize: level });
    if (need !== null) retrySteady(need.name);
  };
  const pick = (level: StabilizeId | null) => {
    if (level === current) { if (level !== null) again(level); return; }
    if (level === null) { apply((p) => setClipStabilize(p, clip.id, null)); return; }
    if (!isSteadyAvailable()) { useToast.getState().show(STEADY_TOOLS); return; }
    if (clip.cutout === true) { useToast.getState().show(STABILIZE_WITH_CUTOUT); return; }
    if (steadyRefusal(clip) === "tooLong") { useToast.getState().show(STABILIZE_TOO_LONG); return; }
    haptic("light");
    again(level);
    apply((p) => setClipStabilize(p, clip.id, level));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Stabilize" note={<StripNote>Zooms in a little</StripNote>}>
      <StripTiles initialX={startX}>
        <Tile label="Off" icon="close-circle-outline" selected={current === null} onPress={() => pick(null)} boxTestID="stabilize-tile-off" />
        {STABILIZE_IDS.map((id) => (
          <Tile key={id} label={LABELS[id]} selected={current === id} onPress={() => pick(id)} boxTestID={`stabilize-tile-${id}`}>
            <Bars filled={STEADY_LEVELS[id].level} color={current === id ? theme.colors.accent : theme.colors.textMuted} />
          </Tile>
        ))}
      </StripTiles>
      <StabilizeStatus clip={clip} />
    </ToolStrip>
  );
}
