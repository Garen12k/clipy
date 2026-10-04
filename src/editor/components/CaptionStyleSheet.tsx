import Slider from "@react-native-community/slider";
import { ScrollView, Switch, View } from "react-native";
import { CAPTION_STYLE } from "@/src/editor/effects";
import { applyCaptionPreset, setCaptionStyleForAll } from "@/src/editor/model/ops";
import { aspectRatioValue, DEFAULT_TEXT_STYLE, makeOverlay, type CaptionWord, type TextOverlay, type TextStyle } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/src/editor/textTemplates";
import { theme } from "@/src/theme/theme";
import { NumField } from "@/src/ui/NumField";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow, CONTENT_BLACK } from "./ColorRow";
import { FontStrip } from "./FontStrip";
import { CAPTION_PRESET_TILES, TemplateStrip, TextSample } from "./TemplateStrip";
import { CollapsibleTextStyle } from "./TextStyleSection";

type Props = { visible: boolean; onClose: () => void };

/** The built-in sample: captions cannot be generated in Expo Go, so the look is shown here. Five words spread evenly over 2.5 s. */
const SAMPLE_TEXT = "This is how captions look";
const SAMPLE_LENGTH = 2.5;
const SAMPLE_WORDS: CaptionWord[] = SAMPLE_TEXT.split(" ").map((text, i, all) => ({ text, start: (i * SAMPLE_LENGTH) / all.length, end: ((i + 1) * SAMPLE_LENGTH) / all.length }));
/** Inside the second word, so that one carries the highlight. */
const SAMPLE_TIME = (SAMPLE_WORDS[1].start + SAMPLE_WORDS[1].end) / 2;
const SAMPLE_WIDTH = 320;
const SAMPLE_HEIGHT = 180;

export function CaptionStyleSheet({ visible, onClose }: Props) {
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const caption = useEditorStore((s) => s.project?.overlays.find((o): o is TextOverlay => o.kind === "caption"));
  const ratio = useEditorStore((s) => s.project?.aspectRatio ?? "9:16");
  // No caption yet: the controls show the look captions are generated with and write nothing (there is nothing to restyle).
  const style = caption ?? CAPTION_STYLE;
  const textStyle = caption?.style ?? DEFAULT_TEXT_STYLE;
  const highlightColor = caption?.highlightColor ?? null;
  type StylePatch = Parameters<typeof setCaptionStyleForAll>[1];
  const patch = (p: StylePatch) => apply((x) => setCaptionStyleForAll(x, p));
  // Slider drags: one undo step per drag (beginTransaction on start, transient updates while sliding).
  const patchTransient = (p: StylePatch) => applyTransient((x) => setCaptionStyleForAll(x, p));
  const opacityPatch = (v: number) => ({ background: { color: style.background?.color ?? CONTENT_BLACK, opacity: v } });
  // The sample is a window onto the middle of a frame of the project's shape, so the caption has its real size against the frame's width.
  const sample = makeOverlay({ id: "caption-sample", kind: "caption", text: SAMPLE_TEXT, fontId: style.fontId, fontScale: style.fontScale, color: style.color,
    background: style.background, outline: style.outline, align: style.align, x: 0.5, y: 0.5, start: 0, end: SAMPLE_LENGTH,
    style: textStyle, words: SAMPLE_WORDS, highlightColor });

  return (
    <Sheet visible={visible} onClose={onClose} title="Caption style" height="85%">
      <ScrollView testID="caption-style-scroll" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        <TemplateStrip tiles={CAPTION_PRESET_TILES} onPick={(presetId) => apply((x) => applyCaptionPreset(x, presetId))} />
        {!caption && <Body muted>Add captions to style them</Body>}
        <View style={{ alignItems: "center" }}>
          <TextSample testID="caption-sample" overlay={sample} time={SAMPLE_TIME} width={SAMPLE_WIDTH} height={SAMPLE_HEIGHT}
            frameHeight={Math.max(SAMPLE_HEIGHT, SAMPLE_WIDTH / aspectRatioValue(ratio))} backgroundColor={theme.colors.sea} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Highlight spoken word</Body>
          <Switch accessibilityLabel="Highlight spoken word" value={highlightColor !== null}
            onValueChange={(on) => patch({ highlightColor: on ? DEFAULT_HIGHLIGHT_COLOR : null })} trackColor={{ true: theme.colors.accent }} />
        </View>
        {highlightColor !== null && (
          <View testID="caption-highlight-color"><ColorRow value={highlightColor} onChange={(color) => patch({ highlightColor: color })} /></View>
        )}
        <FontStrip value={style.fontId} onChange={(fontId) => patch({ fontId })} />
        <View>
          <Body muted>Size {Math.round(style.fontScale * 100)}%</Body>
          <Slider testID="caption-size-slider" minimumValue={0.02} maximumValue={0.1} value={style.fontScale}
            onSlidingStart={beginTransaction} onValueChange={(v) => patchTransient({ fontScale: v })}
            onSlidingComplete={(v) => patchTransient({ fontScale: v })}
            minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
        </View>
        <ColorRow value={style.color} onChange={(color) => patch({ color })} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Background</Body>
          <Switch accessibilityLabel="Background" value={!!style.background}
            onValueChange={(on) => patch({ background: on ? { color: style.background?.color ?? CONTENT_BLACK, opacity: style.background?.opacity ?? 0.6 } : null })}
            trackColor={{ true: theme.colors.accent }} />
        </View>
        {style.background && (<>
          <ColorRow value={style.background.color} onChange={(color) => patch({ background: { color, opacity: style.background!.opacity } })} />
          <Slider testID="caption-opacity-slider" minimumValue={0.2} maximumValue={1} value={style.background.opacity}
            onSlidingStart={beginTransaction} onValueChange={(v) => patchTransient(opacityPatch(v))}
            onSlidingComplete={(v) => patchTransient(opacityPatch(v))}
            minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
        </>)}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Outline</Body>
          <Switch accessibilityLabel="Outline" value={style.outline} onValueChange={(outline) => patch({ outline })} trackColor={{ true: theme.colors.accent }} />
        </View>
        <NumField label="Y %" value={Math.round(style.y * 100)} onCommit={(v) => patch({ y: v / 100 })} />
        <CollapsibleTextStyle style={textStyle} outline={style.outline} onBegin={beginTransaction}
          onPatch={(sp: Partial<TextStyle>) => patch({ style: sp })} onPatchTransient={(sp: Partial<TextStyle>) => patchTransient({ style: sp })} />
      </ScrollView>
    </Sheet>
  );
}
