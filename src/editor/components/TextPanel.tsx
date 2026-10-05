import Slider from "@react-native-community/slider";
import { useRef, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { overlayBaseAt } from "@/src/editor/model/motion";
import { applyTextTemplate, deleteOverlay, duplicateOverlay, editOverlayAt, setTextStyle, updateOverlay, updateOverlayShared } from "@/src/editor/model/ops";
import { isTextOverlay, OVERLAY_LIMITS, type Align, type TextStyle } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { NumField } from "@/src/ui/NumField";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { ColorRow, CONTENT_BLACK } from "./ColorRow";
import { FontStrip } from "./FontStrip";
import { TemplateStrip, TEXT_TEMPLATE_TILES } from "./TemplateStrip";
import { CollapsibleTextStyle } from "./TextStyleSection";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void; onRetarget?: (id: string) => void };
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, fontFamily: theme.fonts.body, padding: 10, fontSize: 16, minWidth: 72 } as const;

export function TextPanel({ overlayId, visible, onClose, onRetarget }: Props) {
  const found = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  // The playhead, followed only while the overlay has keyframes (else nothing shown here depends on it).
  const playhead = useEditorStore((s) => ((s.project?.overlays.find((o) => o.id === overlayId)?.keyframes.length ?? 0) > 0 ? s.playhead : 0));
  const [fine, setFine] = useState(false);
  // How long the history was right after this typing's undo step began (see `type`).
  const typedFrom = useRef(0);
  if (!found || !isTextOverlay(found)) return null;
  const overlay = found;
  const id = overlay.id;
  const patch = (p: Parameters<typeof updateOverlay>[2]) => apply((x) => updateOverlay(x, id, p));
  const patchShared = (p: Parameters<typeof updateOverlayShared>[2]) => apply((x) => updateOverlayShared(x, id, p));
  // Typing is one undo step per focus. Undo is reachable while the panel is open: if the history got shorter since that step began,
  // the step is gone, and the next keystroke begins a new one instead of being written into the step before it.
  const beginTyping = () => { beginTransaction(); typedFrom.current = useEditorStore.getState().past.length; };
  const type = (t: string) => {
    if (useEditorStore.getState().past.length < typedFrom.current) beginTyping();
    applyTransient((x) => updateOverlay(x, id, { text: t }));
  };
  // Placement (x / y / scale / rotation) is read and written at the playhead: the pin there when the overlay has keyframes — its own
  // values are hidden then and must never be edited silently — otherwise its own values (`editOverlayAt` is the plain update then).
  const base = overlayBaseAt(overlay, playhead);
  // Captions have no keyframes and `editOverlayAt` refuses them: they keep the plain update.
  const place = (p: Parameters<typeof editOverlayAt>[3]) =>
    apply((x) => (overlay.kind === "caption" ? updateOverlayShared(x, id, p) : editOverlayAt(x, id, useEditorStore.getState().playhead, p)));
  // The style section: a switch / colour is one undo step; a slider drag is one too (beginTransaction, then transient updates).
  const patchStyle = (sp: Partial<TextStyle>) => apply((x) => setTextStyle(x, id, sp));
  const patchStyleTransient = (sp: Partial<TextStyle>) => applyTransient((x) => setTextStyle(x, id, sp));
  const slider = (key: "fontScale" | "opacity") => ({
    onSlidingStart: () => beginTransaction(),
    onValueChange: (v: number) => applyTransient((x) => updateOverlay(x, id, key === "fontScale" ? { fontScale: v } : { background: { color: overlay.background?.color ?? CONTENT_BLACK, opacity: v } })),
  });

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Text" bodyTestID="text-panel-scroll">
      <TextInput accessibilityLabel="Overlay text" multiline autoFocus value={overlay.text} onFocus={beginTyping} onChangeText={type}
        style={{ ...field, minHeight: 64, textAlignVertical: "top" }} placeholder="Your text" placeholderTextColor={theme.colors.textMuted} />
      {/* Templates are for texts only (`applyTextTemplate` refuses captions, which have their own presets). */}
      {overlay.kind === "text" && <TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={(templateId) => apply((x) => applyTextTemplate(x, id, templateId))} />}
      <FontStrip value={overlay.fontId} onChange={(fontId) => patch({ fontId })} />
      <View><Body muted>Size {Math.round(overlay.fontScale * 100)}%</Body>
        <Slider testID="size-slider" minimumValue={OVERLAY_LIMITS.fontScale[0]} maximumValue={OVERLAY_LIMITS.fontScale[1]} value={overlay.fontScale} {...slider("fontScale")} minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} /></View>
      <ColorRow value={overlay.color} onChange={(color) => patch({ color })} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body>Background</Body>
        <Switch accessibilityLabel="Background" value={!!overlay.background} onValueChange={(on) => patch({ background: on ? { color: CONTENT_BLACK, opacity: 0.6 } : null })} trackColor={{ true: theme.colors.accent }} />
      </View>
      {overlay.background && (<>
        <ColorRow value={overlay.background.color} onChange={(color) => patch({ background: { color, opacity: overlay.background!.opacity } })} />
        <Slider testID="opacity-slider" minimumValue={0.2} maximumValue={1} value={overlay.background.opacity} {...slider("opacity")} minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
      </>)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space.md }}>
        {(["left", "center", "right"] as Align[]).map((a) => <Chip key={a} label={`Align ${a}`} selected={overlay.align === a} onPress={() => patch({ align: a })} />)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body>Outline</Body>
        <Switch accessibilityLabel="Outline" value={overlay.outline} onValueChange={(outline) => patch({ outline })} trackColor={{ true: theme.colors.accent }} />
      </View>
      <CollapsibleTextStyle style={overlay.style} outline={overlay.outline} onBegin={beginTransaction} onPatch={patchStyle} onPatchTransient={patchStyleTransient} />
      <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Body style={{ color: theme.colors.sea }}>Fine-tune</Body>
        <Body style={{ color: theme.colors.sea }}>{fine ? "▲" : "▼"}</Body>
      </Pressable>
      {fine && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
          <NumField label="X %" value={Math.round(base.x * 100)} onCommit={(v) => place({ x: v / 100 })} />
          <NumField label="Y %" value={Math.round(base.y * 100)} onCommit={(v) => place({ y: v / 100 })} />
          <NumField label="Scale" value={Number(base.scale.toFixed(2))} step={0.01} onCommit={(v) => place({ scale: v })} />
          <NumField label="Rotation °" value={Math.round(base.rotation)} onCommit={(v) => place({ rotation: v })} />
          <NumField label="Start s" value={Number(overlay.start.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ start: v })} />
          <NumField label="End s" value={Number(overlay.end.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ end: v })} />
        </View>
      )}
      <View style={{ flexDirection: "row", gap: theme.space.md }}>
        {/* Not while the text is empty: the host removes an empty text as the panel leaves it — that would be a second undo step. */}
        <SecondaryButton title="Duplicate" disabled={overlay.text.trim().length === 0} onPress={() => {
          apply((x) => duplicateOverlay(x, id));
          const overlays = useEditorStore.getState().project?.overlays ?? [];
          const dup = overlays[overlays.findIndex((o) => o.id === id) + 1];
          if (dup) { selectOverlay(dup.id); onRetarget?.(dup.id); }
        }} />
        <SecondaryButton danger title="Delete" onPress={() => { apply((x) => deleteOverlay(x, id)); onClose(); }} />
      </View>
    </ToolPanel>
  );
}
