import { TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { clientAdapters } from "../adapters";
import { PLATFORMS, type PlatformId } from "../platforms";

/** Same look as the editor's text fields (TextPanel / NumField). */
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, fontFamily: theme.fonts.body, padding: 10, fontSize: 16 } as const;
const TITLE_MAX = 100;
const PRIVACY = [{ value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Private" }] as const;

/** Platforms that have options of their own (adapter `hasOptions`, default true); the others have no Options button. */
export const hasOptions = (id: PlatformId) => { const a = clientAdapters[id]; return !!a && a.hasOptions !== false; };

type Props = { platform: PlatformId | null; options: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; onClose: () => void };

/** Per-platform options. Every change applies at once; closing the sheet keeps them. */
export function PostOptionsSheet({ platform, options, onChange, onClose }: Props) {
  const label = platform ? PLATFORMS[platform].label : "";
  const title = typeof options.title === "string" ? options.title : "";
  return (
    <Sheet visible={platform !== null && hasOptions(platform)} onClose={onClose} title={`${label} options`} avoidKeyboard>
      {platform === "youtube" ? (
        <View style={{ gap: theme.space.lg }}>
          <View style={{ gap: theme.space.xs }}>
            <Body muted style={{ fontSize: 12 }}>Title</Body>
            <TextInput accessibilityLabel="YouTube title" value={title} maxLength={TITLE_MAX} onChangeText={(t) => onChange({ title: t })}
              style={field} placeholder="Uses your caption" placeholderTextColor={theme.colors.textMuted} returnKeyType="done" />
            <Body muted style={{ fontSize: 12, alignSelf: "flex-end" }}>{`${title.length} / ${TITLE_MAX}`}</Body>
          </View>
          <View style={{ gap: theme.space.sm }}>
            <Body muted style={{ fontSize: 12 }}>Who can see it</Body>
            <View style={{ flexDirection: "row", gap: theme.space.md }}>
              {PRIVACY.map((p) => <Chip key={p.value} label={p.label} selected={options.privacy === p.value} onPress={() => onChange({ privacy: p.value })} />)}
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
