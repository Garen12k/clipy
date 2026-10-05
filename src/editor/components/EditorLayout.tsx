import { View } from "react-native";
import { usePanelPresence } from "@/src/ui/ToolPanel";

type Props = { top: React.ReactNode; preview: React.ReactNode; transport: React.ReactNode; timeline: React.ReactNode; toolbar: React.ReactNode };

/**
 * The editor's column: top bar, preview (takes what is left), transport row, timeline, bottom area.
 * While a tall panel shows, the timeline's slot is collapsed to height 0 and clipped — the timeline inside stays mounted with its own
 * explicit height, so none of its views changes its frame and its scroll view keeps its offset — and it is hidden from touches and
 * from accessibility. A fragment on purpose: the bottom area must stay a direct child of the screen, after the timeline.
 */
export function EditorLayout({ top, preview, transport, timeline, toolbar }: Props) {
  const collapsed = usePanelPresence((s) => s.count > 0);
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
