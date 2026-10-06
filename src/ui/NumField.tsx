import { useState } from "react";
import { TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body } from "./Text";

const field = { backgroundColor: theme.elevation.tile, color: theme.colors.text, fontFamily: theme.fonts.body, borderRadius: theme.radius.chip, padding: theme.space.md, fontSize: 16, minWidth: 72 } as const;

type Props = { label: string; value: number; onCommit: (v: number) => void; step?: number };

export function NumField({ label, value, onCommit, step = 1 }: Props) {
  const [text, setText] = useState(String(value));
  // The text follows the value — adjusted during render, never from an effect: the value can change on every frame of a gesture
  // (a text dragged on the preview), and state set from an effect on each of those frames trips React's update-depth limit
  // (LayerBar.updateDepth.test.tsx). What is being typed is replaced only when the value itself changed.
  const [seeded, setSeeded] = useState(value);
  if (!Object.is(value, seeded)) { setSeeded(value); setText(String(value)); }
  return (
    <View style={{ gap: theme.space.xs }}>
      <Body muted style={{ fontSize: theme.type.small }}>{label}</Body>
      <TextInput accessibilityLabel={label} keyboardType="numbers-and-punctuation" value={text} onChangeText={setText}
        onBlur={() => { const n = Number(text); if (Number.isFinite(n)) onCommit(Math.round(n / step) * step); else setText(String(value)); }} style={field} />
    </View>
  );
}
