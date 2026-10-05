import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addTextOverlay, clipKeyframeAt, defaultOverlayRange, deleteAudioTrack, deleteClip, deleteEffect, deleteOverlay, duplicateAudioTrack, duplicateClip, duplicateEffect, duplicateLayerRefusal, overlayKeyframeAt, reorderLayer, setClipReversed, setDucking, splitClipAt, toggleClipKeyframe, toggleOverlayKeyframe } from "@/src/editor/model/ops";
import { findItem, itemOffsetAt } from "@/src/editor/model/timeline";
import { isPhoto, isTextOverlay, makeOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useClipMedia } from "@/src/editor/useClipMedia";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { useFreezeFrame } from "@/src/editor/useFreezeFrame";
import { TOOL_GROUPS, groupForSelection, type IoniconName, type ToolGroupId, type ToolId } from "@/src/editor/toolGroups";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "@/src/editor/toolStrip";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { ToolButton } from "@/src/ui/ToolButton";
import { useStripPresence } from "@/src/ui/ToolStrip";
import { useReducedMotion } from "@/src/ui/useReducedMotion";
import { AddAudioSheet } from "./AddAudioSheet";
import { AdjustSheet } from "./AdjustSheet";
import { AudioFadeSheet } from "./AudioFadeSheet";
import { AudioVolumeSheet } from "./AudioVolumeSheet";
import { BackgroundSheet } from "./BackgroundSheet";
import { BlendSheet } from "./BlendSheet";
import { BeatsSheet } from "./BeatsSheet";
import { CaptionsSheet } from "./CaptionsSheet";
import { ChromaSheet } from "./ChromaSheet";
import { ClipAnimationSheet } from "./ClipAnimationSheet";
import { CoverSheet } from "./CoverSheet";
import { CropScreen } from "./CropScreen";
import { EffectSheet } from "./EffectSheet";
import { EffectStrengthSheet } from "./EffectStrengthSheet";
import { OverlayAnimationSheet } from "./OverlayAnimationSheet";
import { RatioSheet } from "./RatioSheet";
import { SpeedSheet } from "./SpeedSheet";
import { FilterSheet } from "./FilterSheet";
import { MaskSheet } from "./MaskSheet";
import { MultiSelectBar } from "./MultiSelectBar";
import { OpacitySheet } from "./OpacitySheet";
import { StickerPanel } from "./StickerPanel";
import { StickerSheet } from "./StickerSheet";
import { TemplateSheet } from "./TemplateSheet";
import { TextPanel } from "./TextPanel";
import { TransformSheet } from "./TransformSheet";
import { TransitionSheet } from "./TransitionSheet";
import { TrimSheet } from "./TrimSheet";
import { VolumeSheet } from "./VolumeSheet";

type PanelFor = { id: string; kind: "text" | "sticker" } | null;
/** With an effect selected, the Effects group shows these instead of its normal tools (Effect stays, to add another). */
const SELECTED_EFFECT_TOOLS: ToolId[] = ["effect", "effectStrength", "effectDuplicate", "effectDelete"];
/** With an audio track selected, the Audio group shows that track's tools instead of its normal ones (Add audio stays: a second sound can be added without deselecting). */
const SELECTED_AUDIO_TOOLS: ToolId[] = ["addAudio", "audioVolume", "audioFade", "audioDuplicate", "audioDelete"];
/** With a layer selected, the Edit group shows these before its normal tools (first, so they are reachable without scrolling the row). */
const SELECTED_LAYER_TOOLS: ToolId[] = ["layerForward", "layerBack"];
/** Why a layer was not copied (`duplicateLayerRefusal`). */
const DUPLICATE_REFUSED = { limit: "You've reached the layer limit.", overlap: "Only two video layers can play at the same time.", noRoom: "There's no room after this layer." } as const;

type Props = { panelFor: PanelFor; onPanelChange: (next: PanelFor) => void; transitionFor: number | null; onTransitionChange: (index: number | null) => void };

export function EditorToolbar({ panelFor, onPanelChange, transitionFor, onTransitionChange }: Props) {
  // `selectedClipId` holds a main clip's or a layer's id. `selectedIndex` is the place on the main track (-1 for a layer): transitions only.
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const selectedIndex = useEditorStore((s) => s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1);
  const clipCount = useEditorStore((s) => s.project?.clips.length ?? 0);
  const hasClips = useEditorStore((s) => (s.project?.clips.length ?? 0) > 0);
  const apply = useEditorStore((s) => s.apply);
  const [sheet, setSheet] = useState<"ratio" | "trim" | "speed" | "addAudio" | "volume" | "filter" | "sticker" | "captions" | "templates" | "transform" | "background" | "crop" | "adjust" | "effect" | "effectStrength" | "audioVolume" | "audioFade" | "beats" | "clipAnimation" | "overlayAnimation" | "mask" | "blend" | "chroma" | "cover" | null>(null);
  const noSel = !selectedId;
  const selectedClip = useItemClip(selectedId);
  /** A layer is selected: the main-track tools (Split, Freeze, Ratio, Transition, Background) do not apply. */
  const layerSel = useIsLayer(selectedId);
  const photoSel = !!selectedClip && isPhoto(selectedClip);
  const reversed = !!selectedClip?.reversed;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { replaceMedia, addOverlay, busy: mediaBusy } = useClipMedia();
  const { freeze, busy: freezeBusy } = useFreezeFrame();
  const [group, setGroup] = useState<ToolGroupId>("edit");
  const overlayKind = useEditorStore((s) => s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind ?? null);
  const selectedEffectId = useEditorStore((s) => s.selectedEffectId);
  const selectedAudioId = useEditorStore((s) => s.selectedAudioId);
  const ducking = useEditorStore((s) => !!s.project?.ducking);
  const multi = useEditorStore((s) => s.multiSelect !== null);
  // Tool strips (Opacity so far): the closer lives here, the bottom area; the two rows give their place to a strip while one shows.
  useStripCloser();
  const strip = useToolStrip((s) => s.open);
  const stripShown = useStripPresence((s) => s.count > 0);
  useEffect(() => { setGroup((cur) => groupForSelection({ clipId: selectedId, overlayKind, effectId: selectedEffectId, audioId: selectedAudioId }, cur) ?? cur); }, [selectedId, overlayKind, selectedEffectId, selectedAudioId]);

  // Animate / Keyframe act on what the open group edits: Edit → the selected clip, Text → a selected text (not a caption), Stickers → a selected sticker.
  const motionOverlayKind = group === "text" ? "text" : group === "stickers" ? "sticker" : null;
  const selectedOverlayId = useEditorStore((s) => s.selectedOverlayId);
  const motionOverlayId = motionOverlayKind && overlayKind === motionOverlayKind ? selectedOverlayId : null;
  const canAnimate = group === "edit" ? !noSel : !!motionOverlayId;
  // "off": the playhead is not on the target; otherwise whether it sits on a pin. A primitive, so playhead ticks re-render only on a change.
  const pin = useEditorStore((s): "off" | "add" | "remove" => {
    const p = s.project;
    if (!p) return "off";
    if (group === "edit") {
      const item = s.selectedClipId ? findItem(p, s.selectedClipId) : null;
      const offset = item ? itemOffsetAt(p, item.clip.id, s.playhead) : null;
      if (!item || offset === null) return "off";
      return clipKeyframeAt(item.clip, offset) ? "remove" : "add";
    }
    const o = motionOverlayKind ? p.overlays.find((x) => x.id === s.selectedOverlayId) : undefined;
    if (!o || o.kind !== motionOverlayKind || s.playhead < o.start || s.playhead > o.end) return "off";
    return overlayKeyframeAt(o, s.playhead) ? "remove" : "add";
  });
  const toggleKeyframe = () => {
    const { project, playhead } = useEditorStore.getState();
    if (!project || pin === "off") return;
    if (group === "edit") {
      const offset = selectedId ? itemOffsetAt(project, selectedId, playhead) : null;
      if (!selectedId || offset === null) return;
      haptic("light");
      apply((p) => toggleClipKeyframe(p, selectedId, offset));
    } else if (motionOverlayId) {
      haptic("light");
      apply((p) => toggleOverlayKeyframe(p, motionOverlayId, playhead));
    }
  };

  const addText = () => {
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    const id = newId();
    const range = defaultOverlayRange(project, playhead);
    apply((x) => addTextOverlay(x, { ...makeOverlay({ id }), ...range }));
    selectOverlay(id);
    onPanelChange({ id, kind: "text" });
  };

  const textPanelFor = panelFor?.kind === "text" ? panelFor.id : null;
  const stickerPanelFor = panelFor?.kind === "sticker" ? panelFor.id : null;

  const closeText = () => {
    if (textPanelFor) {
      const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === textPanelFor);
      if (overlay && isTextOverlay(overlay) && overlay.text.trim().length === 0) apply((x) => deleteOverlay(x, textPanelFor));
    }
    onPanelChange(null);
  };

  const duplicateSelectedEffect = () => {
    if (!selectedEffectId) return;
    apply((p) => duplicateEffect(p, selectedEffectId));
    // The copy sits right after the original in the list.
    const list = useEditorStore.getState().project?.effects ?? [];
    const dup = list[list.findIndex((e) => e.id === selectedEffectId) + 1];
    if (dup) useEditorStore.getState().selectEffect(dup.id);
  };

  const duplicateSelectedAudio = () => {
    const { project, selectAudio } = useEditorStore.getState();
    if (!project || !selectedAudioId) return;
    // The op returns the same project when it refuses (the track limit).
    const next = duplicateAudioTrack(project, selectedAudioId);
    if (next === project) { useToast.getState().show("You've reached the audio track limit."); return; }
    haptic("light");
    apply(() => next);
    // The copy sits right after the original in the list.
    const dup = next.audioTracks[next.audioTracks.findIndex((t) => t.id === selectedAudioId) + 1];
    if (dup) selectAudio(dup.id);
  };
  const deleteSelectedAudio = () => {
    if (!selectedAudioId) return;
    haptic("medium");
    apply((p) => deleteAudioTrack(p, selectedAudioId));
    useEditorStore.getState().selectAudio(null);
  };

  const duplicateSelected = () => {
    const project = useEditorStore.getState().project;
    if (!project || !selectedId) return;
    // The op returns the same project when it refuses: only a layer can be refused (the layer limit, a third video at once, or no
    // room before the video's end).
    const next = duplicateClip(project, selectedId);
    if (next === project) {
      const why = duplicateLayerRefusal(project, selectedId);
      if (why) useToast.getState().show(DUPLICATE_REFUSED[why]);
      return;
    }
    apply(() => next);
  };
  const reorderSelected = (direction: "forward" | "back") => {
    const project = useEditorStore.getState().project;
    if (!project || !selectedId || reorderLayer(project, selectedId, direction) === project) return;   // already at that end: no buzz, no undo step
    haptic("light");
    apply((p) => reorderLayer(p, selectedId, direction));
  };

  const TOOLS: Record<ToolId, { label: string; icon: IoniconName; disabled?: boolean; active?: boolean; onPress: () => void }> = {
    split: { label: "Split", icon: "cut", disabled: noSel || layerSel, onPress: () => { haptic("light"); apply((p) => splitClipAt(p, useEditorStore.getState().playhead)); } },
    trim: { label: "Trim", icon: "crop", disabled: noSel, onPress: () => setSheet("trim") },
    transform: { label: "Transform", icon: "resize", disabled: noSel, onPress: () => setSheet("transform") },
    animate: { label: "Animate", icon: "play-forward-outline", disabled: !canAnimate, onPress: () => setSheet(group === "edit" ? "clipAnimation" : "overlayAnimation") },
    keyframe: { label: "Keyframe", icon: pin === "remove" ? "diamond" : "diamond-outline", disabled: pin === "off", active: pin === "remove", onPress: toggleKeyframe },
    crop: { label: "Crop", icon: "crop", disabled: noSel, onPress: () => setSheet("crop") },
    overlay: { label: "Overlay", icon: "layers", disabled: !hasClips || mediaBusy, onPress: () => { void addOverlay(); } },
    opacity: { label: "Opacity", icon: "contrast", disabled: noSel, onPress: () => openStrip("opacity") },
    mask: { label: "Mask", icon: "ellipse-outline", disabled: noSel, onPress: () => setSheet("mask") },
    blend: { label: "Blend", icon: "layers-outline", disabled: !layerSel, onPress: () => setSheet("blend") },
    chroma: { label: "Green screen", icon: "leaf-outline", disabled: noSel, onPress: () => setSheet("chroma") },
    layerForward: { label: "Forward", icon: "arrow-up", disabled: !layerSel, onPress: () => reorderSelected("forward") },
    layerBack: { label: "Back", icon: "arrow-down", disabled: !layerSel, onPress: () => reorderSelected("back") },
    replace: { label: "Replace", icon: "sync", disabled: noSel || mediaBusy, onPress: () => { if (selectedId) void replaceMedia(selectedId); } },
    reverse: { label: "Reverse", icon: "play-back", disabled: noSel || photoSel, active: reversed, onPress: () => { if (selectedId) { haptic("light"); apply((p) => setClipReversed(p, selectedId, !reversed)); } } },
    freeze: { label: "Freeze", icon: "snow", disabled: noSel || layerSel || photoSel || freezeBusy, onPress: () => { haptic("light"); void freeze(); } },
    duplicate: { label: "Duplicate", icon: "copy", disabled: noSel, onPress: duplicateSelected },
    delete: { label: "Delete", icon: "trash", disabled: noSel, onPress: () => { if (selectedId) { haptic("medium"); apply((p) => deleteClip(p, selectedId)); } } },
    select: { label: "Select", icon: "checkmark-done", disabled: clipCount < 2, onPress: () => { haptic("light"); useEditorStore.getState().enterMultiSelect(); } },
    ratio: { label: "Ratio", icon: "phone-portrait", disabled: layerSel, onPress: () => setSheet("ratio") },
    cover: { label: "Cover", icon: "image-outline", disabled: !hasClips, onPress: () => setSheet("cover") },
    filter: { label: "Filter", icon: "color-filter", disabled: noSel, onPress: () => setSheet("filter") },
    speed: { label: "Speed", icon: "speedometer", disabled: noSel || photoSel, onPress: () => setSheet("speed") },
    transition: { label: "Transition", icon: "swap-horizontal", disabled: noSel || layerSel || selectedIndex === clipCount - 1, onPress: () => onTransitionChange(selectedIndex) },
    templates: { label: "Templates", icon: "color-wand", disabled: !hasClips, onPress: () => setSheet("templates") },
    background: { label: "Background", icon: "color-palette", disabled: noSel || layerSel, onPress: () => setSheet("background") },
    adjust: { label: "Adjust", icon: "options", disabled: noSel, onPress: () => setSheet("adjust") },
    effect: { label: "Effect", icon: "flash", onPress: () => setSheet("effect") },
    effectStrength: { label: "Strength", icon: "speedometer", disabled: !selectedEffectId, onPress: () => setSheet("effectStrength") },
    effectDuplicate: { label: "Duplicate", icon: "copy", disabled: !selectedEffectId, onPress: duplicateSelectedEffect },
    effectDelete: { label: "Delete", icon: "trash", disabled: !selectedEffectId, onPress: () => { if (selectedEffectId) { haptic("medium"); apply((p) => deleteEffect(p, selectedEffectId)); } } },
    text: { label: "Text", icon: "text", disabled: !hasClips, onPress: addText },
    captions: { label: "Captions", icon: "chatbox-ellipses", disabled: !hasClips, onPress: () => setSheet("captions") },
    sticker: { label: "Sticker", icon: "happy", disabled: !hasClips, onPress: () => setSheet("sticker") },
    addAudio: { label: "Add audio", icon: "musical-notes", onPress: () => setSheet("addAudio") },
    volume: { label: "Volume", icon: "volume-high", disabled: noSel || photoSel || !!selectedClip?.reversed, onPress: () => setSheet("volume") },
    // A preference, not an action on a track: enabled even before there is a voice-over.
    ducking: { label: "Ducking", icon: "volume-low", active: ducking, onPress: () => { haptic("light"); apply((p) => setDucking(p, !ducking)); } },
    beats: { label: "Beats", icon: "pulse", disabled: !hasClips, onPress: () => setSheet("beats") },
    audioVolume: { label: "Volume", icon: "volume-medium", disabled: !selectedAudioId, onPress: () => setSheet("audioVolume") },
    audioFade: { label: "Fade", icon: "trending-up", disabled: !selectedAudioId, onPress: () => setSheet("audioFade") },
    audioDuplicate: { label: "Duplicate", icon: "copy", disabled: !selectedAudioId, onPress: duplicateSelectedAudio },
    audioDelete: { label: "Delete", icon: "trash", disabled: !selectedAudioId, onPress: deleteSelectedAudio },
  };
  const active = TOOL_GROUPS.find((g) => g.id === group)!;
  const tools = group === "effects" && selectedEffectId ? SELECTED_EFFECT_TOOLS : group === "audio" && selectedAudioId ? SELECTED_AUDIO_TOOLS
    : group === "edit" && layerSel ? [...SELECTED_LAYER_TOOLS, ...active.tools] : active.tools;

  // Multi-select: the action bar takes the toolbar's place. This component stays mounted, so the open group survives the mode.
  if (multi) return <MultiSelectBar />;

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: Math.max(insets.bottom, theme.space.sm) }}>
      {stripShown ? null : (
        <>
          <Animated.View key={group} entering={reduced ? undefined : FadeIn.duration(150)}
            style={{ paddingVertical: theme.space.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.surfaceAlt }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
              {tools.map((id) => <ToolButton key={id} {...TOOLS[id]} />)}
            </ScrollView>
          </Animated.View>
          <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: theme.space.xs }}>
            {TOOL_GROUPS.map((g) => <ToolButton key={g.id} role="tab" label={g.label} icon={g.icon} active={g.id === group} onPress={() => { if (g.id !== group) haptic("light"); setGroup(g.id); }} />)}
          </View>
        </>
      )}
      <RatioSheet visible={sheet === "ratio"} onClose={() => setSheet(null)} />
      <CoverSheet visible={sheet === "cover"} onClose={() => setSheet(null)} />
      <TrimSheet clipId={selectedId} visible={sheet === "trim"} onClose={() => setSheet(null)} />
      <SpeedSheet clipId={selectedId} visible={sheet === "speed"} onClose={() => setSheet(null)} />
      <FilterSheet clipId={selectedId} visible={sheet === "filter"} onClose={() => setSheet(null)} />
      <TemplateSheet clipId={selectedId} visible={sheet === "templates"} onClose={() => setSheet(null)} />
      <TransformSheet clipId={selectedId} visible={sheet === "transform"} onClose={() => setSheet(null)} />
      <ClipAnimationSheet clipId={selectedId} visible={sheet === "clipAnimation"} onClose={() => setSheet(null)} />
      <OverlayAnimationSheet overlayId={selectedOverlayId} visible={sheet === "overlayAnimation"} onClose={() => setSheet(null)} />
      <AdjustSheet clipId={selectedId} visible={sheet === "adjust"} onClose={() => setSheet(null)} />
      <EffectSheet visible={sheet === "effect"} onClose={() => setSheet(null)} />
      <EffectStrengthSheet effectId={selectedEffectId} visible={sheet === "effectStrength"} onClose={() => setSheet(null)} />
      <BackgroundSheet clipId={selectedId} visible={sheet === "background"} onClose={() => setSheet(null)} />
      <CropScreen clipId={selectedId} visible={sheet === "crop"} onClose={() => setSheet(null)} />
      <OpacitySheet clipId={selectedId} visible={strip?.id === "opacity"} onClose={closeStrip} />
      <MaskSheet clipId={selectedId} visible={sheet === "mask"} onClose={() => setSheet(null)} />
      <BlendSheet clipId={selectedId} visible={sheet === "blend"} onClose={() => setSheet(null)} />
      <ChromaSheet clipId={selectedId} visible={sheet === "chroma"} onClose={() => setSheet(null)} />
      <AddAudioSheet visible={sheet === "addAudio"} onClose={() => setSheet(null)} />
      <BeatsSheet visible={sheet === "beats"} onClose={() => setSheet(null)} />
      <AudioVolumeSheet trackId={selectedAudioId} visible={sheet === "audioVolume"} onClose={() => setSheet(null)} />
      <AudioFadeSheet target={selectedAudioId ? { type: "track", id: selectedAudioId } : null} visible={sheet === "audioFade"} onClose={() => setSheet(null)} />
      <VolumeSheet clipId={selectedId} visible={sheet === "volume"} onClose={() => setSheet(null)} />
      <StickerSheet visible={sheet === "sticker"} onClose={() => setSheet(null)} onAdded={() => {}} />
      <CaptionsSheet visible={sheet === "captions"} onClose={() => setSheet(null)} />
      <TransitionSheet clipIndex={transitionFor ?? 0} visible={transitionFor !== null} onClose={() => onTransitionChange(null)} />
      <TextPanel overlayId={textPanelFor} visible={!!textPanelFor} onClose={closeText} onRetarget={(id) => onPanelChange({ id, kind: "text" })} />
      <StickerPanel overlayId={stickerPanelFor} visible={!!stickerPanelFor} onClose={() => onPanelChange(null)} onRetarget={(id) => onPanelChange({ id, kind: "sticker" })} />
    </View>
  );
}
