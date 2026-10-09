import { Children } from "react";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Card } from "./Card";
import { Body } from "./Text";
import { useSurfaces } from "./tone";

/**
 * A group of rows on a screen: a small muted label (when given) above ONE rounded card, with a quiet line between its rows.
 * Each child is a row and brings its own height; the card only pads the sides. The label is a header for VoiceOver.
 */
export function Group({ label, children, testID }: { label?: string; children: React.ReactNode; testID?: string }) {
  const s = useSurfaces();
  return (
    <View style={{ gap: theme.space.sm }}>
      {label ? <Body muted accessibilityRole="header" style={{ fontSize: theme.type.label, paddingHorizontal: theme.space.lg }}>{label}</Body> : null}
      <Card testID={testID} style={{ paddingVertical: theme.space.xs }}>
        {Children.toArray(children).map((row, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: s.separator } : undefined}>{row}</View>
        ))}
      </Card>
    </View>
  );
}
