import { View, type StyleProp, type ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** The one card surface outside the editor: a step lighter than the page, the gold hairline, no shadow. */
export const cardStyle: ViewStyle = {
  backgroundColor: theme.elevation.bar, borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radius.card, padding: theme.space.lg,
};

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[cardStyle, style]}>{children}</View>;
}
