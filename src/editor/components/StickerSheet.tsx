import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS, searchEmoji, type EmojiEntry, type EmojiPackId } from "@/src/editor/emoji";
import { addSticker, defaultOverlayRange } from "@/src/editor/model/ops";
import { makeSticker, SHAPE_IDS, type ShapeId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SHAPES } from "@/src/editor/effects";
import { newId } from "@/src/lib/id";
import { prefs } from "@/src/projects/prefs";
import { DEFAULT_STICKER_COLOR } from "@/src/editor/components/ColorRow";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { useKeyboard } from "@/src/ui/keyboard";
import { Body } from "@/src/ui/Text";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { ColorRow } from "./ColorRow";

type Tab = "emoji" | "shapes";
/** The search row's height; the grid gets the rest of the panel's body. */
const SEARCH_ROW = 52;
/** Rows of eight the grid mounts first (the tallest panel shows eight); the rest is virtualised. */
const FIRST_ROWS = 9;

export function StickerSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState<EmojiPackId>("faces");
  const [recent, setRecent] = useState<string[]>([]);
  const [color, setColor] = useState<string>(DEFAULT_STICKER_COLOR);
  const apply = useEditorStore((s) => s.apply);
  // The keyboard is up (the panel is at its typing height): the recents row gives its place to the results.
  const typing = useKeyboard((s) => s.height > 0);

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

  const searching = query.trim().length > 0;
  // A search looks through every emoji; without one the grid shows the chosen pack, all of it.
  const results = searching ? searchEmoji(query) : EMOJI_BY_PACK[pack];

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Sticker" scroll={false}
      lead={<>
        <Chip label="Emoji" selected={tab === "emoji"} onPress={() => setTab("emoji")} />
        <Chip label="Shapes" selected={tab === "shapes"} onPress={() => setTab("shapes")} />
        {tab === "emoji" ? (<>
          <View style={{ width: StyleSheet.hairlineWidth, height: theme.size.icon.md, backgroundColor: theme.colors.hairline }} />
          {/* The lead row has an explicit height: this `flex` is the row's spare WIDTH. The chips scroll sideways inside it. */}
          <ScrollView testID="emoji-packs" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{ flex: 1, height: PANEL.lead }} contentContainerStyle={{ alignItems: "center", gap: theme.space.sm }}>
            {EMOJI_PACK_IDS.map((id) => (
              <Chip key={id} compact label={EMOJI_PACKS[id].label} accessibilityLabel={`${EMOJI_PACKS[id].label} pack`} selected={!searching && pack === id}
                onPress={() => { setQuery(""); setPack(id); }} />
            ))}
          </ScrollView>
        </>) : null}
      </>}>
      {(bodyHeight) => tab === "emoji" ? (
        <View style={{ height: bodyHeight }}>
          <View style={{ height: SEARCH_ROW, justifyContent: "center" }}>
            <TextInput accessibilityLabel="Search emoji" value={query} onChangeText={setQuery}
              placeholder="Search" placeholderTextColor={theme.colors.textMuted}
              style={{ color: theme.colors.text, fontFamily: theme.fonts.body, backgroundColor: theme.elevation.tile, borderRadius: theme.radius.chip, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm }} />
          </View>
          <FlatList key={searching ? "search" : pack} testID="emoji-grid" style={{ height: bodyHeight - SEARCH_ROW }} data={results} keyExtractor={(e) => e.char} numColumns={8} initialNumToRender={FIRST_ROWS} windowSize={7}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            ListHeaderComponent={recent.length > 0 && !query && !typing ? (
              <View style={{ flexDirection: "row", gap: theme.space.sm, flexWrap: "wrap", marginBottom: theme.space.sm }}>
                {recent.map((char) => (
                  <Pressable key={char} accessibilityLabel={`Recent ${char}`} onPress={() => addEmoji({ char, name: char, keywords: [] })}>
                    <Text style={{ fontSize: 28 }}>{char}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            renderItem={({ item }) => (
              <Pressable accessibilityLabel={`Emoji ${item.name}`} onPress={() => addEmoji(item)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 24 }}>{item.char}</Text>
              </Pressable>
            )} />
        </View>
      ) : (
        <ScrollView testID="shape-list" style={{ height: bodyHeight }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: theme.space.md, paddingVertical: theme.space.md }}>
          <ColorRow value={color} onChange={setColor} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            {SHAPE_IDS.map((id) => (
              <Pressable key={id} accessibilityRole="button" accessibilityLabel={SHAPES[id].label} onPress={() => addShape(id)}
                style={{ width: 64, alignItems: "center", gap: theme.space.xs }}>
                <Svg width={48} height={48} viewBox="0 0 100 100"><Path d={SHAPES[id].path} fill={color} /></Svg>
                <Body style={{ fontSize: theme.type.small }}>{SHAPES[id].label}</Body>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </ToolPanel>
  );
}
