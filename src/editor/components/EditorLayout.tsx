import { View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard, useKeyboardTracking } from "@/src/ui/keyboard";
import { usePanelPresence } from "@/src/ui/ToolPanel";
import { useStripPresence } from "@/src/ui/ToolStrip";

type Props = { top: React.ReactNode; preview: React.ReactNode; transport: React.ReactNode; timeline: React.ReactNode; toolbar: React.ReactNode };

/**
 * The editor's column: top bar, preview (takes what is left), transport row, timeline, bottom area.
 * While a tall panel shows, the timeline's slot is collapsed to height 0 and clipped — the timeline inside stays mounted with its own
 * explicit height, so none of its views changes its frame and its scroll view keeps its offset — and it is hidden from touches and
 * from accessibility. A fragment on purpose: the bottom area must stay a direct child of the screen, after the timeline.
 * The keyboard is tracked here, once, for the tools in the bottom area: a strip that has the keyboard collapses the timeline too, so
 * the preview (still the same view) keeps what is left above the tool and the keyboard. Not in multi-select: its strips have no
 * field, so a keyboard then belongs to something else (the rename prompt) and its bar stays lifted over the timeline.
 */
export function EditorLayout({ top, preview, transport, timeline, toolbar }: Props) {
  useKeyboardTracking();
  const panel = usePanelPresence((s) => s.count > 0);
  const strip = useStripPresence((s) => s.count > 0);
  const keyboardUp = useKeyboard((s) => s.height > 0);
  const multi = useEditorStore((s) => s.multiSelect !== null);
  // A panel always takes the timeline's place; a strip does while it has the keyboard (which would cover most of the timeline anyway).
  const collapsed = panel || (strip && keyboardUp && !multi);
  return (
    <>
      {top}
      <View testID="slot-preview" style={{ flex: 1 }}>{preview}</View>
      {transport}
      <View testID="slot-timeline" pointerEvents={collapsed ? "none" : "auto"} accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? "no-hide-descendants" : "auto"} style={collapsed ? { height: 0, overflow: "hidden" } : undefined}>
        {timeline}
      </View>
      {toolbar}
    </>
  );
}
