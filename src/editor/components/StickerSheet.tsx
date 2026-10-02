import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { searchEmoji, type EmojiEntry } from "@/src/editor/emoji";
import { addSticker, defaultOverlayRange } from "@/src/editor/model/ops";
import { makeSticker, SHAPE_IDS, type ShapeId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SHAPES } from "@/src/editor/effects";
import { newId } from "@/src/lib/id";
import { prefs } from "@/src/projects/prefs";
import { DEFAULT_STICKER_COLOR } from "@/src/editor/components/ColorRow";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";

type Tab = "emoji" | "shapes";

export function StickerSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [color, setColor] = useState<string>(DEFAULT_STICKER_COLOR);
  const apply = useEditorStore((s) => s.apply);

  useEffect(() => {
    if (!visible) return;
    prefs.getRecentEmoji().then(setRecent).catch(() => {});
  }, [visible]);

  const addEmoji = (e: EmojiEntry) => {
    const id = newId();
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    apply((p) => addSticker(p, { ...makeSticker({ id, emoji: e.char }), ...defaultOverlayRange(p, playhead) }));
    selectOverlay(id);
    prefs.pushRecentEmoji(e.char);
    onAdded(id);
    onClose();
  };

  const addShape = (shape: ShapeId) => {
    const id = newId();
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    apply((p) => addSticker(p, { ...makeSticker({ id, emoji: null, shape, color }), ...defaultOverlayRange(p, playhead) }));
    selectOverlay(id);
    onAdded(id);
    onClose();
  };

  const results = searchEmoji(query);

  return (
    <Sheet visible={visible} onClose={onClose} title="Sticker" height="60%">
      <View style={{ flexDirection: "row", gap: theme.space.sm }}>
        <Chip label="Emoji" selected={tab === "emoji"} onPress={() => setTab("emoji")} />
        <Chip label="Shapes" selected={tab === "shapes"} onPress={() => setTab("shapes")} />
      </View>
      {tab === "emoji" ? (
        <View style={{ flex: 1, gap: theme.space.sm }}>
          <TextInput accessibilityLabel="Search emoji" value={query} onChangeText={setQuery}
            placeholder="Search" placeholderTextColor={theme.colors.textMuted}
            style={{ color: theme.colors.text, fontFamily: theme.fonts.body, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, paddingHorizontal: 10, paddingVertical: 8 }} />
          {recent.length > 0 && !query && (
            <View style={{ flexDirection: "row", gap: theme.space.sm, flexWrap: "wrap" }}>
              {recent.map((char) => (
                <Pressable key={char} accessibilityLabel={`Recent ${char}`} onPress={() => addEmoji({ char, name: char, keywords: [] })}>
                  <Text style={{ fontSize: 28 }}>{char}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <FlatList data={results} keyExtractor={(e) => e.char} numColumns={8}
            renderItem={({ item }) => (
              <Pressable accessibilityLabel={`Emoji ${item.name}`} onPress={() => addEmoji(item)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 24 }}>{item.char}</Text>
              </Pressable>
            )} />
        </View>
      ) : (
        <View style={{ flex: 1, gap: theme.space.md }}>
          <ColorRow value={color} onChange={setColor} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            {SHAPE_IDS.map((id) => (
              <Pressable key={id} accessibilityRole="button" accessibilityLabel={SHAPES[id].label} onPress={() => addShape(id)}
                style={{ width: 64, alignItems: "center", gap: theme.space.xs }}>
                <Svg width={48} height={48} viewBox="0 0 100 100"><Path d={SHAPES[id].path} fill={color} /></Svg>
                <Body style={{ fontSize: 12 }}>{SHAPES[id].label}</Body>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}
