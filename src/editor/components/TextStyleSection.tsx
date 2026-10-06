import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Switch, View } from "react-native";
import { BOX_CORNERS, DEFAULT_GLOW, DEFAULT_SHADOW, TEXT_STYLE_LIMITS, type BoxCorner, type TextStyle } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PressableScale } from "@/src/ui/PressableScale";
import { Slider } from "@/src/ui/Slider";
import { Body, ValueLabel } from "@/src/ui/Text";
import { ColorRow, CONTENT_BLACK } from "./ColorRow";

/** A text's background box as the overlay stores it (`TextOverlay.background`). */
export type TextBox = { color: string; opacity: number };

type Props = {
  style: TextStyle;
  /** The text's outline and box live beside the style, on the overlay. */
  outline: boolean;
  background: TextBox | null;
  /** Called when a slider drag starts (the owner opens one undo step). */
  onBegin: () => void;
  /** One undo step: a switch, a colour, a chip. */
  onPatch: (patch: Partial<TextStyle>) => void;
  /** While a slider is dragged, after `onBegin`. */
  onPatchTransient: (patch: Partial<TextStyle>) => void;
  onOutline: (on: boolean) => void;
  /** One undo step: the Background switch, the box colour. */
  onBackground: (box: TextBox | null) => void;
  /** While the box opacity slider is dragged, after `onBegin`. */
  onBackgroundTransient: (box: TextBox) => void;
  /** The box opacity slider's test id: each panel keeps the name its slider always had. */
  boxOpacityTestID: string;
};

type RowId = "outline" | "shadow" | "box" | "spacing" | "glow";
const L = TEXT_STYLE_LIMITS;
/** How see-through a box may get: below 20 % it no longer reads as a box. */
export const BOX_OPACITY_RANGE = [0.2, 1] as const;
/** The box a text gets when Background is switched on. */
export const NEW_BOX: TextBox = { color: CONTENT_BLACK, opacity: 0.6 };
const CORNER_LABEL: Record<BoxCorner, string> = { rounded: "Rounded", square: "Square" };
const ROW = { height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;
/** The row's name takes the rest of the row's width (the row has an explicit height: this `flex` is a width). */
const NAME = { flex: 1, height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.sm } as const;
const BODY = { gap: theme.space.md, paddingBottom: theme.space.md } as const;
const pct = (v: number) => `${Math.round(v * 100)}`;

/**
 * The look of a text beyond font and colour, as five rows: Outline, Shadow, Background, Spacing and opacity, Glow. Presentational — the
 * Text panel writes one overlay, the Caption style panel writes every caption. Every row starts closed, so the panel opens short.
 * A row that is on (Spacing and opacity always) opens and closes from its name; turning a row on opens it, off closes it.
 * A nested value (shadow, glow, the box) is always sent whole. Nothing here animates.
 */
export function TextStyleSection({ style, outline, background, onBegin, onPatch, onPatchTransient, onOutline, onBackground, onBackgroundTransient, boxOpacityTestID }: Props) {
  const [open, setOpen] = useState<Partial<Record<RowId, boolean>>>({});
  const { shadow, glow } = style;
  const set = (id: RowId, to: boolean) => setOpen((o) => ({ ...o, [id]: to }));

  /** `on`: the row's switch, or null for a row without one. `shown`: its controls are drawn (a row switched off from elsewhere — Undo — is not open). */
  const row = (id: RowId, title: string, on: boolean | null, onChange?: (on: boolean) => void, shown = !!open[id] && on !== false) => (
    <View style={ROW}>
      <PressableScale accessibilityRole="button" accessibilityLabel={on === null ? title : `${title} options`} disabled={on === false}
        accessibilityState={{ expanded: shown, disabled: on === false }} onPress={() => set(id, !open[id])} style={NAME}>
        <Body weight="semi">{title}</Body>
        {on === false ? null : <Ionicons name={shown ? "chevron-up-outline" : "chevron-down-outline"} size={theme.size.icon.md} color={theme.colors.textMuted} />}
      </PressableScale>
      {on === null ? null : <Switch accessibilityLabel={title} value={on} onValueChange={(to) => { set(id, to); onChange?.(to); }} trackColor={{ true: theme.colors.accent }} />}
    </View>
  );
  const slider = (testID: string, label: string, shown: string, range: readonly [number, number], value: number, write: (v: number) => void) => (
    <View>
      <ValueLabel label={label} value={shown} />
      <Slider testID={testID} minimumValue={range[0]} maximumValue={range[1]} step={0.01} value={value} onSlidingStart={onBegin} onValueChange={write} onSlidingComplete={write} />
    </View>
  );
  const styled = (toPatch: (v: number) => Partial<TextStyle>) => (v: number) => onPatchTransient(toPatch(v));

  return (
    <View testID="style-sections">
      {row("outline", "Outline", outline, onOutline)}
      {open.outline && outline && (
        <View testID="style-outline" style={BODY}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: theme.space.sm }}>
            <Chip label="Auto" selected={style.outlineColor === null} onPress={() => onPatch({ outlineColor: null })} />
            <View testID="style-outline-color"><ColorRow value={style.outlineColor ?? ""} onChange={(outlineColor) => onPatch({ outlineColor })} /></View>
          </View>
          {slider("style-outline-width-slider", "Thickness", `${style.outlineWidth.toFixed(2)}×`, L.outlineWidth, style.outlineWidth, styled((v) => ({ outlineWidth: v })))}
        </View>
      )}

      {row("shadow", "Shadow", !!shadow, (on) => onPatch({ shadow: on ? { ...DEFAULT_SHADOW } : null }))}
      {open.shadow && shadow && (
        <View testID="style-shadow" style={BODY}>
          <View testID="style-shadow-color"><ColorRow value={shadow.color} onChange={(color) => onPatch({ shadow: { ...shadow, color } })} /></View>
          {slider("style-shadow-opacity-slider", "Shadow opacity", `${pct(shadow.opacity)} %`, L.shadowOpacity, shadow.opacity, styled((v) => ({ shadow: { ...shadow, opacity: v } })))}
          {slider("style-shadow-distance-slider", "Distance", pct(shadow.distance), L.shadowDistance, shadow.distance, styled((v) => ({ shadow: { ...shadow, distance: v } })))}
          {slider("style-shadow-blur-slider", "Blur", pct(shadow.blur), L.shadowBlur, shadow.blur, styled((v) => ({ shadow: { ...shadow, blur: v } })))}
        </View>
      )}

      {row("box", "Background", !!background, (on) => onBackground(on ? { ...NEW_BOX } : null))}
      {open.box && background && (
        <View testID="style-box" style={BODY}>
          <View testID="style-box-color"><ColorRow value={background.color} onChange={(color) => onBackground({ color, opacity: background.opacity })} /></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
            {BOX_CORNERS.map((c) => <Chip key={c} label={CORNER_LABEL[c]} selected={style.boxCorner === c} onPress={() => onPatch({ boxCorner: c })} />)}
          </View>
          {slider("style-box-padding-slider", "Padding", pct(style.boxPadding), L.boxPadding, style.boxPadding, styled((v) => ({ boxPadding: v })))}
          {slider(boxOpacityTestID, "Box opacity", `${pct(background.opacity)} %`, BOX_OPACITY_RANGE, background.opacity, (v) => onBackgroundTransient({ color: background.color, opacity: v }))}
        </View>
      )}

      {row("spacing", "Spacing and opacity", null)}
      {open.spacing && (
        <View testID="style-spacing" style={BODY}>
          {slider("style-opacity-slider", "Opacity", `${pct(style.opacity)} %`, L.opacity, style.opacity, styled((v) => ({ opacity: v })))}
          {slider("style-letter-spacing-slider", "Letter spacing", pct(style.letterSpacing), L.letterSpacing, style.letterSpacing, styled((v) => ({ letterSpacing: v })))}
          {slider("style-line-spacing-slider", "Line spacing", `${style.lineSpacing.toFixed(2)}×`, L.lineSpacing, style.lineSpacing, styled((v) => ({ lineSpacing: v })))}
        </View>
      )}

      {row("glow", "Glow", !!glow, (on) => onPatch({ glow: on ? { ...DEFAULT_GLOW } : null }))}
      {open.glow && glow && (
        <View testID="style-glow" style={BODY}>
          <View testID="style-glow-color"><ColorRow value={glow.color} onChange={(color) => onPatch({ glow: { ...glow, color } })} /></View>
          {slider("style-glow-size-slider", "Size", pct(glow.size), L.glowSize, glow.size, styled((v) => ({ glow: { ...glow, size: v } })))}
        </View>
      )}
    </View>
  );
}
