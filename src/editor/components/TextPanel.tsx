import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { overlayBaseAt } from "@/src/editor/model/motion";
import { applyTextTemplate, deleteOverlay, duplicateOverlay, editOverlayAt, setTextStyle, updateOverlay, updateOverlayShared } from "@/src/editor/model/ops";
import { isTextOverlay, OVERLAY_LIMITS, type Align, type Project, type TextStyle } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { NumField } from "@/src/ui/NumField";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Slider } from "@/src/ui/Slider";
import { Body, ValueLabel } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { ColorRow } from "./ColorRow";
import { FontStrip } from "./FontStrip";
import { ReadAloudSection } from "./ReadAloudSection";
import { TemplateStrip, TEXT_TEMPLATE_TILES } from "./TemplateStrip";
import { TextStyleSection } from "./TextStyleSection";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void; onRetarget?: (id: string) => void };
const field = { backgroundColor: theme.elevation.tile, color: theme.colors.text, borderRadius: theme.radius.field, padding: theme.space.md, fontSize: 16, minWidth: 72 } as const;
const ALIGN_LABEL: Record<Align, string> = { left: "Align Left", center: "Align Center", right: "Align Right" };

export function TextPanel({ overlayId, visible, onClose, onRetarget }: Props) {
  const found = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  // The playhead, followed only while the overlay has keyframes (else nothing shown here depends on it).
  const playhead = useEditorStore((s) => ((s.project?.overlays.find((o) => o.id === overlayId)?.keyframes.length ?? 0) > 0 ? s.playhead : 0));
  const [fine, setFine] = useState(false);
  // The typing undo step that is open: the overlay it belongs to, and the project as its last keystroke left it (see `type`).
  const typing = useRef<{ id: string; left: Project | null } | null>(null);
  if (!found || !isTextOverlay(found)) return null;
  const overlay = found;
  const id = overlay.id;
  const patch = (p: Parameters<typeof updateOverlay>[2]) => apply((x) => updateOverlay(x, id, p));
  const patchShared = (p: Parameters<typeof updateOverlayShared>[2]) => apply((x) => updateOverlayShared(x, id, p));
  // An unbroken run of keystrokes is one undo step, begun by its FIRST keystroke (focusing the field makes none). The panel is
  // inline: Undo / Redo, the other controls and the preview stay reachable while the field keeps focus. So a keystroke continues
  // the open step only on the same overlay and while the project is still the object the last keystroke left; after anything else
  // (a colour, a template, Undo, Redo, another text, an edit from elsewhere) it begins a new step, which clears Redo as any edit does.
  // Redo being armed is checked too: undoing the edit made right after the typing brings that very object back.
  const type = (t: string) => {
    if (t === overlay.text) return;
    const open = typing.current;
    const { project, future } = useEditorStore.getState();
    if (!open || open.id !== id || open.left !== project || future.length > 0) beginTransaction();
    applyTransient((x) => updateOverlay(x, id, { text: t }));
    typing.current = { id, left: useEditorStore.getState().project };
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
  const sizeSlider = { onSlidingStart: () => beginTransaction(), onValueChange: (v: number) => applyTransient((x) => updateOverlay(x, id, { fontScale: v })) };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Text" bodyTestID="text-panel-scroll">
      <TextInput accessibilityLabel="Overlay text" multiline autoFocus value={overlay.text} onChangeText={type}
        style={{ ...field, minHeight: 64, textAlignVertical: "top" }} placeholder="Your text" placeholderTextColor={theme.colors.textMuted} />
      {/* Templates are for texts only (`applyTextTemplate` refuses captions, which have their own presets). */}
      {overlay.kind === "text" && <TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={(templateId) => apply((x) => applyTextTemplate(x, id, templateId))} />}
      {/* Read aloud is for texts only: a caption is already somebody speaking. */}
      {overlay.kind === "text" && <ReadAloudSection overlayId={id} />}
      <FontStrip value={overlay.fontId} onChange={(fontId) => patch({ fontId })} />
      <TextStyleSection style={overlay.style} outline={overlay.outline} background={overlay.background} boxOpacityTestID="opacity-slider"
        onBegin={beginTransaction} onPatch={patchStyle} onPatchTransient={patchStyleTransient}
        onOutline={(outline) => patch({ outline })} onBackground={(background) => patch({ background })}
        onBackgroundTransient={(background) => applyTransient((x) => updateOverlay(x, id, { background }))} />
      <View><ValueLabel label="Size" value={`${Math.round(overlay.fontScale * 100)}%`} />
        <Slider testID="size-slider" minimumValue={OVERLAY_LIMITS.fontScale[0]} maximumValue={OVERLAY_LIMITS.fontScale[1]} value={overlay.fontScale} {...sizeSlider} /></View>
      <ColorRow value={overlay.color} onChange={(color) => patch({ color })} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space.md }}>
        {(["left", "center", "right"] as Align[]).map((a) => <Chip key={a} label={ALIGN_LABEL[a]} selected={overlay.align === a} onPress={() => patch({ align: a })} />)}
      </View>
      <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button" hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs }}>
        <Body style={{ color: theme.colors.accent }}>Fine-tune</Body>
        <Body style={{ color: theme.colors.accent }}>{fine ? "▲" : "▼"}</Body>
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
