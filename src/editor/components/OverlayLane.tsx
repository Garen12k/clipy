import { useMemo } from "react";
import { View } from "react-native";
import type { Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, overlayRows, rowOffset } from "../timelineLayout";
import { OverlayPill } from "./OverlayPill";

const NONE: Overlay[] = [];

/**
 * The timeline lane for text, captions and stickers: as many rows as `overlayRows` says the bars need (what `laneModel` counts), so
 * no bar covers another — bars that share no time share a row. Unlike the layers' rows there are no row containers: a bar's row can
 * change while it is dragged or trimmed, so every bar is a direct child of the one lane, keyed by its overlay and in the order of
 * the array, and only its `top` says which row it is in. A row change is therefore a style change on a mounted bar — never a
 * remount, which would cancel the gesture. Adds height only (its rows and the gaps between them); the bars are out of the flow.
 */
export function OverlayLane() {
  const overlays = useEditorStore((s) => s.project?.overlays ?? NONE);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const { rows, rowOf } = useMemo(() => overlayRows(overlays), [overlays]);
  return (
    <View testID="overlay-lane" style={{ position: "relative", height: rowOffset(Math.max(1, rows)) - LANE_GAP, marginTop: LANE_GAP }}>
      {overlays.map((o) => (
        <OverlayPill key={o.id} overlay={o} selected={o.id === selectedId} top={rowOffset(rowOf[o.id] ?? 0)} onPress={() => selectOverlay(o.id)} />
      ))}
    </View>
  );
}
