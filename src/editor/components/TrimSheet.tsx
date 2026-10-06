import { useState } from "react";
import { TextInput, View } from "react-native";
import { clampNum, isPhoto, PHOTO, type Clip } from "@/src/editor/model/types";
import { trimClip, trimLayer } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, ToolStrip } from "@/src/ui/ToolStrip";

const field = { backgroundColor: theme.elevation.tile, color: theme.colors.text, borderRadius: theme.radius.chip, padding: theme.space.md, fontSize: 18, flex: 1, fontFamily: theme.fonts.body } as const;

/** Whether the typed range, once fitted to what the source allows, is another range than the one the item has. */
function differs(clip: Clip, start: number, end: number): boolean {
  if (isPhoto(clip)) return clampNum(end, PHOTO.minSeconds, PHOTO.maxSeconds) !== clip.trimEnd;
  return clampNum(start, 0, clip.sourceDuration) !== clip.trimStart || clampNum(end, 0, clip.sourceDuration) !== clip.trimEnd;
}

// The fields share the row's WIDTH (`flex: 1` in `field`); the row's height is explicit.
const row = { height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter } as const;

const TRIM_TOO_SHORT = "That trim is too short or outside the clip.";
const TRIM_OVERLAP = "That trim doesn't fit — only two video layers can play at the same time.";

/** Trim by numbers, for a main clip or a layer (a layer keeps its start: the range is applied through `trimLayer`, anchored at its end handle). */
export function TrimSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const apply = useEditorStore((s) => s.apply);
  const [start, setStart] = useState("0"); const [end, setEnd] = useState("0");
  // The fields show the clip's range, and follow it: the timeline and Undo are live under the strip, so a handle drag or an Undo
  // re-seeds both (else Apply would put the old numbers back). Typing changes nothing in the store, and this strip's own Apply
  // closes it — so what is being typed is only ever replaced by a change the user made elsewhere.
  // Re-seeded DURING render, never from an effect: the strip is mounted (closed) for every selected item, and an effect that sets
  // state on each frame of a handle drag leaves React an update pending after every commit — fifty in a row and the drag's next
  // store write throws "Maximum update depth exceeded" (LayerBar.updateDepth.test.tsx).
  // Only while the strip is open: closed, a handle drag under it sets no state at all. Closing forgets the seed (once), so the next
  // opening always re-seeds — also over numbers that were typed and left behind.
  const seed = clip ? `${clip.id}|${clip.trimStart}|${clip.trimEnd}|${visible}` : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (!visible) { if (seeded !== null) setSeeded(null); }
  else if (clip && seed !== seeded) { setSeeded(seed); setStart(clip.trimStart.toFixed(1)); setEnd(clip.trimEnd.toFixed(1)); }
  if (!clip) return null;

  const submit = (from: number, to: number) => {
    if (!layer) { apply((p) => trimClip(p, clip.id, from, to)); onClose(); return; }
    const project = useEditorStore.getState().project;
    const next = project ? trimLayer(project, clip.id, from, to, "end") : project;
    onClose();
    if (!project || !next) return;
    // The same project for a range that is not the current one: the layer rules refused it. The strip closes first; the toast shows where it was.
    if (next === project) {
      if (!differs(clip, from, to)) return;
      // The real cause: the same trim with no other layer around. Still refused → the range itself; accepted → the overlap rule.
      const alone = { ...project, layers: project.layers.filter((l) => l.id === clip.id) };
      useToast.getState().show(trimLayer(alone, clip.id, from, to, "end") === alone ? TRIM_TOO_SHORT : TRIM_OVERLAP);
      return;
    }
    apply(() => next);
  };

  if (isPhoto(clip)) {
    return (
      <ToolStrip visible={visible} onClose={onClose} title="Trim" note={<StripNote lines={2}>How long the photo stays on screen (0.5 – 60 s)</StripNote>}>
        <View testID="trim-row" style={row}>
          <TextInput accessibilityLabel="Length" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
          <PrimaryButton compact title="Apply" onPress={() => submit(0, Number(end) || 0)} />
        </View>
      </ToolStrip>
    );
  }
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Trim" note={<StripNote lines={2}>{`Seconds into the original clip (0 – ${clip.sourceDuration.toFixed(1)})`}</StripNote>}>
      <View testID="trim-row" style={row}>
        <TextInput accessibilityLabel="Trim start" keyboardType="decimal-pad" value={start} onChangeText={setStart} style={field} />
        <TextInput accessibilityLabel="Trim end" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
        <PrimaryButton compact title="Apply" onPress={() => submit(Number(start) || 0, Number(end) || 0)} />
      </View>
    </ToolStrip>
  );
}
