import { Pressable, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { OverlayText } from "./OverlayText";
import { SelectionFrame } from "./SelectionFrame";

type Props = { frameW: number; frameH: number; onOpenPanel: (overlayId: string) => void };

/** Overlays visible at the playhead, drawn over the video inside the aspect frame. Tap an overlay to select it; tap elsewhere to deselect. */
export function OverlayLayer({ frameW, frameH, onOpenPanel }: Props) {
  const overlays = useEditorStore((s) => s.project?.overlays ?? []);
  const playhead = useEditorStore((s) => s.playhead);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const visible = overlays.filter((o) => playhead >= o.start && playhead < o.end);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: frameW, height: frameH }}>
      {visible.map((o) => (
        <OverlayText key={o.id} overlay={o} frameW={frameW} frameH={frameH}>
          <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
          {o.id === selectedId && <SelectionFrame overlay={o} frameW={frameW} frameH={frameH} onDoubleTap={() => onOpenPanel(o.id)} />}
        </OverlayText>
      ))}
    </View>
  );
}
