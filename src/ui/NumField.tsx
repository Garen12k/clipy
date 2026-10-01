import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body } from "./Text";

const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 10, fontSize: 16, minWidth: 72 } as const;

type Props = { label: string; value: number; onCommit: (v: number) => void; step?: number };

export function NumField({ label, value, onCommit, step = 1 }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <View style={{ gap: 4 }}>
      <Body muted style={{ fontSize: 12 }}>{label}</Body>
      <TextInput accessibilityLabel={label} keyboardType="numbers-and-punctuation" value={text} onChangeText={setText}
        onBlur={() => { const n = Number(text); if (Number.isFinite(n)) onCommit(Math.round(n / step) * step); else setText(String(value)); }} style={field} />
    </View>
  );
}
