import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import { addTextOverlay, clipKeyframeAt, defaultOverlayRange, deleteAudioTrack, deleteClip, deleteEffect, deleteOverlay, duplicateAudioTrack, duplicateClip, duplicateEffect, duplicateLayerRefusal, duplicateOverlay, overlayKeyframeAt, reorderLayer, setClipReversed, setDucking, splitClipAt, toggleClipKeyframe, toggleOverlayKeyframe } from "@/src/editor/model/ops";
import { clipAt, findItem, itemOffsetAt } from "@/src/editor/model/timeline";
import { isTextOverlay, makeOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useClipMedia } from "@/src/editor/useClipMedia";
import { useItemClip } from "@/src/editor/useItem";
import { useFreezeFrame } from "@/src/editor/useFreezeFrame";
import { TOOL_META, type IoniconName } from "@/src/editor/toolGroups";
import { contextFor, selectionKey, type Section, type SelectionState, type ToolbarSelection, type ToolId } from "@/src/editor/toolbarContext";
import { closeStrip, openStrip, rekeyStrip, useStripCloser, useToolStrip } from "@/src/editor/toolStrip";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { IconButton } from "@/src/ui/IconButton";
import { useToast } from "@/src/ui/Toast";
import { ToolButton } from "@/src/ui/ToolButton";
import { panelHeight, usePanelPresence } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP, useStripPresence } from "@/src/ui/ToolStrip";
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

/** Why a layer was not copied (`duplicateLayerRefusal`). */
const DUPLICATE_REFUSED = { limit: "You've reached the layer limit.", overlap: "Only two video layers can play at the same time.", noRoom: "There's no room after this layer." } as const;
/** What `contextFor` reads: the store's selection plus the toolbar's own section. */
const selOf = (s: SelectionState, section: Section): ToolbarSelection => ({ clipId: s.selectedClipId, overlayId: s.selectedOverlayId, effectId: s.selectedEffectId, audioId: s.selectedAudioId, section });

/**
 * The editor's bottom area: ONE bar whose tools follow the selection (`contextFor` decides which bar and which tools; this component
 * only gives each tool its action), a back arrow on every bar but the main one, and — in the bar's place — the open tool strip.
 * A tool that does not apply is not on the bar; the only disabled buttons are momentary (Keyframe off its item, Replace / Overlay
 * during a pick, Freeze during a capture). The height is explicit; while a strip shows the area grows upwards over the timeline's
 * lowest lanes (a negative top margin) instead of pushing the preview. The root must stay a direct child of the screen, after the timeline.
 * A tall panel (`ToolPanel`) takes the bar's place too, at its own explicit height and without a lift: the editor's layout hides the timeline then.
 */
export function EditorToolbar() {
  // `selectedClipId` holds a main clip's or a layer's id. `selectedIndex` is its place on the main track now (-1 for a layer): the
  // Transition strip's cut, read on every render so a reorder or an undo while it is open cannot leave it on another clip's cut.
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const selectedOverlayId = useEditorStore((s) => s.selectedOverlayId);
  const selectedEffectId = useEditorStore((s) => s.selectedEffectId);
  const selectedAudioId = useEditorStore((s) => s.selectedAudioId);
  const overlayKind = useEditorStore((s) => s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind ?? null);
  const selectedIndex = useEditorStore((s) => s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1);
  const apply = useEditorStore((s) => s.apply);
  // A main-bar entry that opens a bar without a selection (Audio, Text). Toolbar state: any change of the selection leaves it, and
  // so does the project losing its last clip (else the Text bar would come back by itself with the next clip).
  const [section, setSection] = useState<Section>(null);
  // The two tools that are still modal (Cover is a sheet, Crop a full screen); every other tool lives in the tool store.
  const [sheet, setSheet] = useState<"crop" | "cover" | null>(null);
  const key = useEditorStore(selectionKey);
  const hasClips = useEditorStore((s) => (s.project?.clips.length ?? 0) > 0);
  useEffect(() => { setSection(null); }, [key]);
  useEffect(() => { if (!hasClips) setSection(null); }, [hasClips]);
  const bar = useEditorStore((s) => (s.project ? contextFor(selOf(s, section), s.project).bar : "main"));
  const tools = useEditorStore(useShallow((s) => (s.project ? contextFor(selOf(s, section), s.project).tools : [])));
  // Tool strips: the closer lives here, the bottom area; the bar gives its place to a strip while one shows.
  useStripCloser();
  const strip = useToolStrip((s) => s.open);
  const stripShown = useStripPresence((s) => s.count > 0);
  const panelSize = usePanelPresence((s) => (s.count > 0 ? s.size : null));
  const { height: windowH } = useWindowDimensions();
  const toolShown = stripShown || panelSize !== null;
  // The text panel closing — by ✓, by the closer or by Export — removes a text left empty (as closing the sheet did).
  const textOpenFor = strip?.id === "text" ? selectedOverlayId : null;
  const lastText = useRef<string | null>(null);
  useEffect(() => {
    const was = lastText.current;
    lastText.current = textOpenFor;
    if (!was || was === textOpenFor) return;
    const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === was);
    if (overlay && isTextOverlay(overlay) && overlay.text.trim().length === 0) apply((x) => deleteOverlay(x, was));
  }, [textOpenFor, apply]);
  const reversed = !!useItemClip(selectedId)?.reversed;
  const ducking = useEditorStore((s) => !!s.project?.ducking);
  const multi = useEditorStore((s) => s.multiSelect !== null);
  const insets = useSafeAreaInsets();
  const { replaceMedia, addOverlay, busy: mediaBusy } = useClipMedia();
  const { freeze, busy: freezeBusy } = useFreezeFrame();

  // Keyframe acts on the selected text / sticker, else on the selected clip / layer.
  // "off": the playhead is not on it (or it is a caption); otherwise whether it sits on a pin. A primitive, so playhead ticks re-render only on a change.
  const pin = useEditorStore((s): "off" | "add" | "remove" => {
    const p = s.project;
    if (!p) return "off";
    if (s.selectedOverlayId) {
      const o = p.overlays.find((x) => x.id === s.selectedOverlayId);
      if (!o || o.kind === "caption" || s.playhead < o.start || s.playhead > o.end) return "off";
      return overlayKeyframeAt(o, s.playhead) ? "remove" : "add";
    }
    const item = s.selectedClipId ? findItem(p, s.selectedClipId) : null;
    const offset = item ? itemOffsetAt(p, item.clip.id, s.playhead) : null;
    if (!item || offset === null) return "off";
    return clipKeyframeAt(item.clip, offset) ? "remove" : "add";
  });
  const toggleKeyframe = () => {
    const { project, playhead } = useEditorStore.getState();
    if (!project || pin === "off") return;
    if (selectedOverlayId) {
      haptic("light");
      apply((p) => toggleOverlayKeyframe(p, selectedOverlayId, playhead));
    } else {
      const offset = selectedId ? itemOffsetAt(project, selectedId, playhead) : null;
      if (!selectedId || offset === null) return;
      haptic("light");
      apply((p) => toggleClipKeyframe(p, selectedId, offset));
    }
  };

  /** Clears whichever selection is active, and the section: the main bar shows. */
  const back = () => {
    const s = useEditorStore.getState();
    s.select(null); s.selectOverlay(null); s.selectEffect(null); s.selectAudio(null);
    setSection(null);
  };
  /** The main bar's clip tools act on the main clip under the playhead: select it first, open second (so a strip's key is that clip). */
  const onPlayheadClip = (then: () => void) => {
    const { project, playhead, select } = useEditorStore.getState();
    const hit = project ? clipAt(project, playhead) : null;
    if (!hit) return;
    select(hit.clip.id);
    then();
  };

  const addText = () => {
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    const id = newId();
    const range = defaultOverlayRange(project, playhead);
    apply((x) => addTextOverlay(x, { ...makeOverlay({ id }), ...range }));
    selectOverlay(id);
    openStrip("text");
  };

  const duplicateSelectedOverlay = () => {
    const { project, selectOverlay } = useEditorStore.getState();
    if (!project || !selectedOverlayId) return;
    // The op returns the same project when it refuses: no buzz, no undo step.
    const next = duplicateOverlay(project, selectedOverlayId);
    if (next === project) return;
    haptic("light");
    apply(() => next);
    // The copy sits right after the original in the list.
    const dup = next.overlays[next.overlays.findIndex((o) => o.id === selectedOverlayId) + 1];
    if (dup) selectOverlay(dup.id);
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

  // What each tool does. Labels and icons come from TOOL_META (`icon` here overrides); `disabled` is only ever momentary.
  const ACTIONS: Record<ToolId, { onPress: () => void; disabled?: boolean; active?: boolean; icon?: IoniconName }> = {
    edit: { onPress: () => onPlayheadClip(() => {}) },
    audioMenu: { onPress: () => setSection("audio") },
    textMenu: { onPress: () => setSection("text") },
    sticker: { onPress: () => openStrip("sticker") },
    overlay: { disabled: mediaBusy, onPress: () => { void addOverlay(); } },
    effect: { onPress: () => openStrip("effect") },
    filter: { onPress: () => (bar === "main" ? onPlayheadClip(() => openStrip("filter")) : openStrip("filter")) },
    adjust: { onPress: () => (bar === "main" ? onPlayheadClip(() => openStrip("adjust")) : openStrip("adjust")) },
    ratio: { onPress: () => openStrip("ratio") },
    background: { onPress: () => (bar === "main" ? onPlayheadClip(() => openStrip("background")) : openStrip("background")) },
    cover: { onPress: () => setSheet("cover") },
    templates: { onPress: () => openStrip("templates") },
    split: { onPress: () => { haptic("light"); apply((p) => splitClipAt(p, useEditorStore.getState().playhead)); } },
    trim: { onPress: () => openStrip("trim") },
    speed: { onPress: () => openStrip("speed") },
    volume: { onPress: () => openStrip("volume") },
    animate: { onPress: () => openStrip(bar === "clip" || bar === "layer" ? "clipAnimation" : "overlayAnimation") },
    crop: { onPress: () => setSheet("crop") },
    transform: { onPress: () => openStrip("transform") },
    opacity: { onPress: () => openStrip("opacity") },
    mask: { onPress: () => openStrip("mask") },
    blend: { onPress: () => openStrip("blend") },
    chroma: { onPress: () => openStrip("chroma") },
    keyframe: { icon: pin === "remove" ? "diamond" : undefined, disabled: pin === "off", active: pin === "remove", onPress: toggleKeyframe },
    transition: { onPress: () => openStrip("transition") },
    layerForward: { onPress: () => reorderSelected("forward") },
    layerBack: { onPress: () => reorderSelected("back") },
    replace: { disabled: mediaBusy, onPress: () => { if (selectedId) void replaceMedia(selectedId); } },
    reverse: { active: reversed, onPress: () => { if (selectedId) { haptic("light"); apply((p) => setClipReversed(p, selectedId, !reversed)); } } },
    freeze: { disabled: freezeBusy, onPress: () => { haptic("light"); void freeze(); } },
    duplicate: { onPress: duplicateSelected },
    delete: { onPress: () => { if (selectedId) { haptic("medium"); apply((p) => deleteClip(p, selectedId)); } } },
    select: { onPress: () => { haptic("light"); useEditorStore.getState().enterMultiSelect(); } },
    overlayEdit: { onPress: () => { if (selectedOverlayId) openStrip(overlayKind === "sticker" ? "stickerEdit" : "text"); } },
    overlayDuplicate: { onPress: duplicateSelectedOverlay },
    // The store clears the selection once the overlay is gone.
    overlayDelete: { onPress: () => { if (selectedOverlayId) { haptic("medium"); apply((p) => deleteOverlay(p, selectedOverlayId)); } } },
    text: { onPress: addText },
    captions: { onPress: () => openStrip("captions") },
    addAudio: { onPress: () => openStrip("addAudio") },
    // A preference, not an action on a track: there even before there is a voice-over.
    ducking: { active: ducking, onPress: () => { haptic("light"); apply((p) => setDucking(p, !ducking)); } },
    beats: { onPress: () => openStrip("beats") },
    audioVolume: { onPress: () => openStrip("audioVolume") },
    audioFade: { onPress: () => openStrip("audioFade") },
    audioDuplicate: { onPress: duplicateSelectedAudio },
    audioDelete: { onPress: deleteSelectedAudio },
    effectStrength: { onPress: () => openStrip("effectStrength") },
    effectDuplicate: { onPress: duplicateSelectedEffect },
    effectDelete: { onPress: () => { if (selectedEffectId) { haptic("medium"); apply((p) => deleteEffect(p, selectedEffectId)); } } },
  };

  // Multi-select: the action bar takes the toolbar's place. This component stays mounted (its strip closer too).
  if (multi) return <MultiSelectBar />;

  const pad = Math.max(insets.bottom, theme.space.sm);
  const area = panelSize ? panelHeight(panelSize, windowH) : stripShown ? STRIP.height : BAR_HEIGHT;

  return (
    <View testID="editor-toolbar" style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: pad,
      height: area + pad, marginTop: stripShown ? -STRIP.lift : 0 }}>
      {toolShown ? null : (
        <View testID="toolbar-row" style={{ height: BAR_HEIGHT - 1, flexDirection: "row", alignItems: "center" }}>
          {bar === "main" ? null : <IconButton name="chevron-back" accessibilityLabel="Back to main tools" onPress={back} />}
          {/* Keyed by the bar: another bar starts again from the left; the same bar keeps its scroll position through re-renders. */}
          <ScrollView key={bar} testID="toolbar-scroll" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            {tools.map((id) => <ToolButton key={id} label={TOOL_META[id].label} icon={ACTIONS[id].icon ?? TOOL_META[id].icon} disabled={ACTIONS[id].disabled} active={ACTIONS[id].active} onPress={ACTIONS[id].onPress} />)}
          </ScrollView>
        </View>
      )}
      <CoverSheet visible={sheet === "cover"} onClose={() => setSheet(null)} />
      <CropScreen clipId={selectedId} visible={sheet === "crop"} onClose={() => setSheet(null)} />
      {/* Opened and closed through the tool store, like the strips. */}
      <TrimSheet clipId={selectedId} visible={strip?.id === "trim"} onClose={closeStrip} />
      <TemplateSheet clipId={selectedId} visible={strip?.id === "templates"} onClose={closeStrip} />
      <EffectSheet visible={strip?.id === "effect"} onClose={closeStrip} />
      <AddAudioSheet visible={strip?.id === "addAudio"} onClose={closeStrip} />
      <BeatsSheet visible={strip?.id === "beats"} onClose={closeStrip} />
      <StickerSheet visible={strip?.id === "sticker"} onClose={closeStrip} onAdded={() => {}} />
      <CaptionsSheet visible={strip?.id === "captions"} onClose={closeStrip} />
      {/* The text panel and the sticker editor edit the selected overlay; Duplicate selects the copy, then re-keys the panel onto it. */}
      <TextPanel overlayId={selectedOverlayId} visible={strip?.id === "text"} onClose={closeStrip} onRetarget={rekeyStrip} />
      <StickerPanel overlayId={selectedOverlayId} visible={strip?.id === "stickerEdit"} onClose={closeStrip} onRetarget={rekeyStrip} />
      {/* The tool strips: opened and closed through the strip store, so the cut marker and the ratio pill open the same ones. */}
      <RatioSheet visible={strip?.id === "ratio"} onClose={closeStrip} />
      <SpeedSheet clipId={selectedId} visible={strip?.id === "speed"} onClose={closeStrip} />
      <FilterSheet clipId={selectedId} visible={strip?.id === "filter"} onClose={closeStrip} />
      <TransformSheet clipId={selectedId} visible={strip?.id === "transform"} onClose={closeStrip} />
      <ClipAnimationSheet clipId={selectedId} visible={strip?.id === "clipAnimation"} onClose={closeStrip} />
      <OverlayAnimationSheet overlayId={selectedOverlayId} visible={strip?.id === "overlayAnimation"} onClose={closeStrip} />
      <AdjustSheet clipId={selectedId} visible={strip?.id === "adjust"} onClose={closeStrip} />
      <EffectStrengthSheet effectId={selectedEffectId} visible={strip?.id === "effectStrength"} onClose={closeStrip} />
      <BackgroundSheet clipId={selectedId} visible={strip?.id === "background"} onClose={closeStrip} />
      <OpacitySheet clipId={selectedId} visible={strip?.id === "opacity"} onClose={closeStrip} />
      <MaskSheet clipId={selectedId} visible={strip?.id === "mask"} onClose={closeStrip} />
      <BlendSheet clipId={selectedId} visible={strip?.id === "blend"} onClose={closeStrip} />
      <ChromaSheet clipId={selectedId} visible={strip?.id === "chroma"} onClose={closeStrip} />
      <AudioVolumeSheet trackId={selectedAudioId} visible={strip?.id === "audioVolume"} onClose={closeStrip} />
      <AudioFadeSheet target={selectedAudioId ? { type: "track", id: selectedAudioId } : null} visible={strip?.id === "audioFade"} onClose={closeStrip} />
      <VolumeSheet clipId={selectedId} visible={strip?.id === "volume"} onClose={closeStrip} />
      <TransitionSheet clipIndex={selectedIndex} visible={strip?.id === "transition"} onClose={closeStrip} />
    </View>
  );
}
