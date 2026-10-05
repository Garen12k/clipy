import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { DEFAULT_GLOW, DEFAULT_SHADOW, TEXT_STYLE_LIMITS, type TextStyle } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";

type Props = {
  style: TextStyle;
  /** The text's Outline switch: the outline colour and thickness show only while it is on. */
  outline: boolean;
  /** Called when a slider drag starts (the owner opens one undo step). */
  onBegin: () => void;
  /** One undo step: a switch, a colour, the Auto chip. */
  onPatch: (patch: Partial<TextStyle>) => void;
  /** While a slider is dragged, after `onBegin`. */
  onPatchTransient: (patch: Partial<TextStyle>) => void;
};

const L = TEXT_STYLE_LIMITS;
const ROW = { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } as const;
const pct = (v: number) => `${Math.round(v * 100)}`;

/**
 * The look of a text beyond font and colour: opacity, spacing, outline colour / thickness, shadow, glow. Presentational — the Text panel
 * writes one overlay, the Caption style sheet writes every caption. A nested value (shadow, glow) is always sent whole.
 */
export function TextStyleSection({ style, outline, onBegin, onPatch, onPatchTransient }: Props) {
  const { shadow, glow } = style;
  const slider = (testID: string, label: string, range: readonly [number, number], value: number, toPatch: (v: number) => Partial<TextStyle>) => (
    <View>
      <Body muted>{label}</Body>
      <Slider testID={testID} minimumValue={range[0]} maximumValue={range[1]} step={0.01} value={value}
        onSlidingStart={onBegin} onValueChange={(v) => onPatchTransient(toPatch(v))} onSlidingComplete={(v) => onPatchTransient(toPatch(v))} />
    </View>
  );

  return (
    <View style={{ gap: theme.space.lg }}>
      {slider("style-opacity-slider", `Opacity ${pct(style.opacity)} %`, L.opacity, style.opacity, (v) => ({ opacity: v }))}
      {slider("style-letter-spacing-slider", `Letter spacing ${pct(style.letterSpacing)}`, L.letterSpacing, style.letterSpacing, (v) => ({ letterSpacing: v }))}
      {slider("style-line-spacing-slider", `Line spacing ${style.lineSpacing.toFixed(2)}×`, L.lineSpacing, style.lineSpacing, (v) => ({ lineSpacing: v }))}

      {outline && (<>
        <Body>Outline colour</Body>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: theme.space.sm }}>
          <Chip label="Auto" selected={style.outlineColor === null} onPress={() => onPatch({ outlineColor: null })} />
          <View testID="style-outline-color"><ColorRow value={style.outlineColor ?? ""} onChange={(outlineColor) => onPatch({ outlineColor })} /></View>
        </View>
        {slider("style-outline-width-slider", `Thickness ${style.outlineWidth.toFixed(2)}×`, L.outlineWidth, style.outlineWidth, (v) => ({ outlineWidth: v }))}
      </>)}

      <View style={ROW}>
        <Body>Shadow</Body>
        <Switch accessibilityLabel="Shadow" value={!!shadow} onValueChange={(on) => onPatch({ shadow: on ? { ...DEFAULT_SHADOW } : null })} trackColor={{ true: theme.colors.accent }} />
      </View>
      {shadow && (<>
        <View testID="style-shadow-color"><ColorRow value={shadow.color} onChange={(color) => onPatch({ shadow: { ...shadow, color } })} /></View>
        {slider("style-shadow-opacity-slider", `Shadow opacity ${pct(shadow.opacity)} %`, L.shadowOpacity, shadow.opacity, (v) => ({ shadow: { ...shadow, opacity: v } }))}
        {slider("style-shadow-distance-slider", `Distance ${pct(shadow.distance)}`, L.shadowDistance, shadow.distance, (v) => ({ shadow: { ...shadow, distance: v } }))}
        {slider("style-shadow-blur-slider", `Blur ${pct(shadow.blur)}`, L.shadowBlur, shadow.blur, (v) => ({ shadow: { ...shadow, blur: v } }))}
      </>)}

      <View style={ROW}>
        <Body>Glow</Body>
        <Switch accessibilityLabel="Glow" value={!!glow} onValueChange={(on) => onPatch({ glow: on ? { ...DEFAULT_GLOW } : null })} trackColor={{ true: theme.colors.accent }} />
      </View>
      {glow && (<>
        <View testID="style-glow-color"><ColorRow value={glow.color} onChange={(color) => onPatch({ glow: { ...glow, color } })} /></View>
        {slider("style-glow-size-slider", `Size ${pct(glow.size)}`, L.glowSize, glow.size, (v) => ({ glow: { ...glow, size: v } }))}
      </>)}
    </View>
  );
}

/** The section behind a "Style" row, closed until asked for (both sheets are long already). */
export function CollapsibleTextStyle(props: Props) {
  const [open, setOpen] = useState(false);
  return (<>
    <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="Style" accessibilityState={{ expanded: open }}
      style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs }}>
      <Body style={{ color: theme.colors.sea }}>Style</Body>
      <Body style={{ color: theme.colors.sea }}>{open ? "▲" : "▼"}</Body>
    </Pressable>
    {open && <TextStyleSection {...props} />}
  </>);
}
