import Slider from "@react-native-community/slider";
import { Switch, View } from "react-native";
import { CAPTION_STYLE } from "@/src/editor/effects";
import { setCaptionStyleForAll } from "@/src/editor/model/ops";
import type { TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { NumField } from "@/src/ui/NumField";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";
import { FontStrip } from "./FontStrip";

type Props = { visible: boolean; onClose: () => void };

export function CaptionStyleSheet({ visible, onClose }: Props) {
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const caption = useEditorStore((s) => s.project?.overlays.find((o): o is TextOverlay => o.kind === "caption"));
  const style = caption ?? CAPTION_STYLE;
  type StylePatch = Parameters<typeof setCaptionStyleForAll>[1];
  const patch = (p: StylePatch) => apply((x) => setCaptionStyleForAll(x, p));
  // Slider drags: one undo step per drag (beginTransaction on start, transient updates while sliding).
  const patchTransient = (p: StylePatch) => applyTransient((x) => setCaptionStyleForAll(x, p));
  const opacityPatch = (v: number) => ({ background: { color: style.background?.color ?? "#000000", opacity: v } });

  return (
    <Sheet visible={visible} onClose={onClose} title="Caption style">
      <View style={{ gap: theme.space.lg }}>
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
            onValueChange={(on) => patch({ background: on ? { color: style.background?.color ?? "#000000", opacity: style.background?.opacity ?? 0.6 } : null })}
            trackColor={{ true: theme.colors.accent }} />
        </View>
        {style.background && (<>
          <ColorRow value={style.background.color} onChange={(color) => patch({ background: { color, opacity: style.background!.opacity } })} />
          <Slider testID="caption-opacity-slider" minimumValue={0.2} maximumValue={1} value={style.background.opacity}
            onSlidingStart={beginTransaction} onValueChange={(v) => patchTransient(opacityPatch(v))}
            onSlidingComplete={(v) => patchTransient(opacityPatch(v))}
            minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
        </>)}
        <NumField label="Y %" value={Math.round(style.y * 100)} onCommit={(v) => patch({ y: v / 100 })} />
      </View>
    </Sheet>
  );
}
