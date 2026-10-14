import { memo, useCallback, useLayoutEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { hasOverlayMotion, overlayBaseAt, resolveOverlayMotion, type KeyValues } from "@/src/editor/model/motion";
import { highlightsWords, overlayFrameKey, shownIds, shownKey } from "@/src/editor/model/overlayFrame";
import { hasReveal } from "@/src/editor/model/textReveal";
import { isSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MIN_VIEW_OPACITY, OverlayText } from "./OverlayText";
import { SelectionFrame } from "./SelectionFrame";
import { StickerView } from "./StickerView";

type Props = { frameW: number; frameH: number; onOpenPanel: (overlayId: string) => void };
type Open = (overlayId: string) => void;

const NONE: Overlay[] = [];

/** The overlay drawn at another placement (a display copy; the project is not changed). */
const placed = <T extends Overlay>(o: T, v: KeyValues): T => ({ ...o, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation });

/**
 * Overlays visible at the playhead, drawn over the video inside the aspect frame. Tap an overlay to select it; tap elsewhere to deselect.
 * An overlay with an animation or keyframes is drawn where `resolveOverlayMotion` puts it at the playhead; its selection frame sits in
 * an unseen sibling copy at the base (static / keyframed) placement, so the handles stay put while the animation plays.
 * Every overlay keeps the key `id` (its frame copy `id-frame`) in one flat list, so motion toggling or other overlays coming and going never remount it.
 *
 * What a playhead tick costs: the list draws again only when the SET of shown overlays changes (`shownKey`), and each overlay only when
 * its own frame key changes (`overlayFrameKey`: its motion, reveal step or highlighted word) or its document, its selection or the frame's
 * size does — a still text costs no render while playing. This outer part reads nothing from the store; it only keeps the latest
 * `onOpenPanel` so the parts below can be skipped while the preview draws again around them.
 */
export function OverlayLayer({ frameW, frameH, onOpenPanel }: Props) {
  const latest = useRef(onOpenPanel);
  useLayoutEffect(() => { latest.current = onOpenPanel; }, [onOpenPanel]);
  const open = useCallback((id: string) => latest.current(id), []);
  return <OverlayList frameW={frameW} frameH={frameH} open={open} />;
}

const OverlayList = memo(function OverlayList({ frameW, frameH, open }: { frameW: number; frameH: number; open: Open }) {
  const allOverlays = useEditorStore((s) => s.project?.overlays ?? NONE);
  const shown = useEditorStore((s) => shownKey(s.project?.overlays ?? NONE, s.playhead));
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const ids = new Set(shownIds(shown));
  const visible = allOverlays.filter((o) => ids.has(o.id));
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: frameW, height: frameH }}>
      {visible.map((o) => <OverlayItem key={o.id} overlay={o} selected={o.id === selectedId} frameW={frameW} frameH={frameH} open={open} />)}
    </View>
  );
});

type ItemProps = { overlay: Overlay; selected: boolean; frameW: number; frameH: number; open: Open };
/** One overlay (and, when it is selected and drawn apart, its unseen frame copy). Draws again only when its frame key or a prop changes. */
const OverlayItem = memo(function OverlayItem({ overlay: o, selected, frameW, frameH, open }: ItemProps) {
  // The subscription: this part is drawn again when what it draws at the playhead changes, and only then.
  useEditorStore((s) => overlayFrameKey(o, s.playhead));
  const playhead = useEditorStore.getState().playhead;
  const { selectOverlay } = useEditorStore.getState();
  const m = hasOverlayMotion(o) ? resolveOverlayMotion(o, playhead) : null;
  const opacity = m ? Math.max(MIN_VIEW_OPACITY, m.opacity) : undefined;
  const frame = selected ? <SelectionFrame overlay={o} frameW={frameW} frameH={frameH} onDoubleTap={() => open(o.id)} /> : null;
  const size = { frameW, frameH };
  if (isSticker(o)) {
    const main = (
      <StickerView key={o.id} sticker={m ? placed(o, m) : o} {...size} opacity={opacity}>
        <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Sticker ${o.emoji ?? o.shape}`} />
        {m ? null : frame}
      </StickerView>
    );
    return m && frame ? [main, <StickerView key={`${o.id}-frame`} sticker={placed(o, overlayBaseAt(o, playhead))} {...size} frameOnly>{frame}</StickerView>] : [main];
  }
  // A see-through text (style opacity) fades its whole wrapper, so its frame goes in the unfaded copy too.
  const apart = m !== null || o.style.opacity < 1;
  const time = highlightsWords(o) || hasReveal(o) ? playhead : undefined;
  const main = (
    <OverlayText key={o.id} overlay={m ? placed(o, m) : o} {...size} opacity={opacity} time={time}>
      <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
      {apart ? null : frame}
    </OverlayText>
  );
  return apart && frame ? [main, <OverlayText key={`${o.id}-frame`} overlay={placed(o, overlayBaseAt(o, playhead))} {...size} frameOnly>{frame}</OverlayText>] : [main];
});
