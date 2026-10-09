import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { applyPreset, CROP_PRESETS, panToCorner, panToMove, type CropCorner, type CropPresetId } from "@/src/editor/model/cropBox";
import { setClipCrop } from "@/src/editor/model/ops";
import { itemOffsetAt, outputToSource } from "@/src/editor/model/timeline";
import { FULL_CROP, isPhoto, type Clip, type CropRect } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Title } from "@/src/ui/Text";
import { getThumb } from "./thumbnails";

/** Corner handles' touch target; the picture is inset by half of it so handles on its edges stay on screen. */
const HANDLE = 44;
const MARGIN = HANDLE / 2;
const HANDLE_MARK = 14;
const CORNERS: { id: CropCorner; label: string }[] = [
  { id: "tl", label: "Top-left corner" }, { id: "tr", label: "Top-right corner" },
  { id: "bl", label: "Bottom-left corner" }, { id: "br", label: "Bottom-right corner" },
];

const THIRDS = ["33.333%", "66.667%"] as const;

type GesturePart = "move" | CropCorner;
type Rect = { left: number; top: number; width: number; height: number };

/** The source picture drawn `contain` inside `area`, inset by the handle margin. */
function drawnRect(area: { width: number; height: number }, sourceAspect: number): Rect | null {
  const aw = area.width - 2 * MARGIN, ah = area.height - 2 * MARGIN;
  if (aw <= 0 || ah <= 0 || !(sourceAspect > 0)) return null;
  const width = aw / ah > sourceAspect ? ah * sourceAspect : aw;
  const height = width / sourceAspect;
  return { left: (area.width - width) / 2, top: (area.height - height) / 2, width, height };
}

/** The still the box sits on: the photo itself, or a thumbnail of the video at the playhead (or its first frame). */
function useStill(clip: Clip): string | null {
  const photo = isPhoto(clip);
  const [thumb, setThumb] = useState<string | null>(null);
  const [time] = useState(() => {
    const s = useEditorStore.getState();
    const offset = s.project ? itemOffsetAt(s.project, clip.id, s.playhead) : null;
    return offset !== null ? outputToSource(clip, offset) : clip.trimStart;
  });
  useEffect(() => {
    if (photo) return;
    let alive = true;
    getThumb(clip.sourceUri, time).then((uri) => { if (alive) setThumb(uri); }).catch(() => {});
    return () => { alive = false; };
  }, [photo, clip.sourceUri, time]);
  return photo ? clip.sourceUri : thumb;
}

/**
 * Full-screen crop tool for one clip or layer: a draggable box over an unrotated, unflipped still of the clip.
 * Pan inside the box moves it; pan on a corner resizes it (locked to the chosen preset's shape). The working
 * crop is local; `Done` applies it as one undo step (none when unchanged), `Cancel` discards it.
 */
export function CropScreen({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  // A new editor per opening (key bumped while rendering, so the first frame is already fresh): the working
  // crop always starts from the clip's current crop. The content itself stays mounted while the Modal
  // slides away — the Modal keeps rendering it until the native dismissal finishes.
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }
  if (!clip) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* A Modal is a separate native root: give its gestures their own root view. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CropEditor key={session} clip={clip} onClose={onClose} />
      </GestureHandlerRootView>
    </Modal>
  );
}

function CropEditor({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const apply = useEditorStore((s) => s.apply);
  const [crop, setCrop] = useState<CropRect>(() => ({ ...clip.crop }));
  const [preset, setPreset] = useState<CropPresetId>("free");
  const [area, setArea] = useState({ width: 0, height: 0 });
  const still = useStill(clip);
  const sourceAspect = clip.width / clip.height;
  const pic = drawnRect(area, sourceAspect);
  const ratio = CROP_PRESETS.find((p) => p.id === preset)?.ratio ?? null;

  const cropRef = useRef(crop);
  cropRef.current = crop;
  const startsRef = useRef<Partial<Record<GesturePart, CropRect>>>({});
  const picW = pic?.width ?? 0, picH = pic?.height ?? 0;

  const gestures = useMemo(() => {
    if (picW <= 0 || picH <= 0) return null;
    // Each gesture keeps its own snapshot of the crop it started with and recomputes from it, so updates never
    // compound and a second finger on another part never overwrites this one's starting point. The snapshot is a
    // property of a ref'd object, never a reassigned local: the worklets Babel plugin copies the captured
    // variables of gesture callbacks, so a reassigned `let` would not be seen by the other callback.
    const pan = (part: GesturePart, next: (start: CropRect, tx: number, ty: number) => CropRect) => {
      const starts = startsRef.current;
      return Gesture.Pan().maxPointers(1).minDistance(1)
        .onStart(() => { starts[part] = cropRef.current; })
        .onUpdate((e) => setCrop(next(starts[part] ?? cropRef.current, e.translationX, e.translationY)))
        .runOnJS(true);
    };
    const corner = (id: CropCorner) => pan(id, (s, tx, ty) => panToCorner(s, id, tx, ty, picW, picH, ratio, sourceAspect));
    return { move: pan("move", (s, tx, ty) => panToMove(s, tx, ty, picW, picH)), tl: corner("tl"), tr: corner("tr"), bl: corner("bl"), br: corner("br") };
  }, [picW, picH, ratio, sourceAspect]);

  const choose = (id: CropPresetId, r: number | null) => {
    haptic("light");
    const next = applyPreset(crop, r, sourceAspect);
    // A shape this picture cannot hold comes back as the same object: stay Free rather than lock to it.
    if (r !== null && next === crop) { setPreset("free"); return; }
    setPreset(id);
    setCrop(next);
  };
  const reset = () => { haptic("light"); setPreset("free"); setCrop({ ...FULL_CROP }); };
  const done = () => { apply((p) => setClipCrop(p, clip.id, crop)); onClose(); };

  const box = pic ? { left: crop.x * pic.width, top: crop.y * pic.height, width: crop.w * pic.width, height: crop.h * pic.height } : null;

  return (
    <Screen tone="editor" edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.lg, gap: theme.space.md }}>
        <SecondaryButton title="Cancel" onPress={onClose} />
        <Title size={theme.type.headline} accessibilityRole="header">Crop</Title>
        <PrimaryButton title="Done" compact onPress={done} />
      </View>

      <View testID="crop-area" style={{ flex: 1 }} onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {pic && box && gestures ? (
          <View testID="crop-picture" style={{ position: "absolute", ...pic, backgroundColor: theme.colors.surfaceAlt }}>
            {still ? <Image testID="crop-still" source={{ uri: still }} resizeMode="stretch" style={StyleSheet.absoluteFill} /> : null}
            <Dim pic={pic} box={box} />
            <GestureDetector gesture={gestures.move}>
              <View testID="crop-box" accessibilityLabel="Crop box"
                style={{ position: "absolute", ...box, borderWidth: 2, borderColor: theme.colors.accent }}>
                <Grid />
              </View>
            </GestureDetector>
            {CORNERS.map(({ id, label }) => (
              <GestureDetector key={id} gesture={gestures[id]}>
                <View testID={`crop-handle-${id}`} accessibilityLabel={label}
                  style={{
                    position: "absolute", width: HANDLE, height: HANDLE, alignItems: "center", justifyContent: "center",
                    left: box.left + (id.endsWith("r") ? box.width : 0) - HANDLE / 2,
                    top: box.top + (id.startsWith("b") ? box.height : 0) - HANDLE / 2,
                  }}>
                  <View style={{ width: HANDLE_MARK, height: HANDLE_MARK, borderRadius: theme.radius.tile / 2, backgroundColor: theme.colors.accent }} />
                </View>
              </GestureDetector>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: theme.space.md, paddingTop: theme.space.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, flexGrow: 1, justifyContent: "center" }}>
          {CROP_PRESETS.map((p) => <Chip key={p.id} label={p.label} selected={preset === p.id} onPress={() => choose(p.id, p.ratio)} />)}
        </ScrollView>
        <View style={{ alignItems: "center" }}>
          <SecondaryButton title="Reset" onPress={reset} />
        </View>
      </View>
    </Screen>
  );
}

/** Darkens the picture outside the box (four strips), so the kept area reads at a glance. */
function Dim({ pic, box }: { pic: Rect; box: Rect }) {
  const shade = { position: "absolute" as const, backgroundColor: theme.colors.scrimStrong };
  const right = box.left + box.width, bottom = box.top + box.height;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ ...shade, left: 0, top: 0, width: pic.width, height: box.top }} />
      <View style={{ ...shade, left: 0, top: bottom, width: pic.width, height: pic.height - bottom }} />
      <View style={{ ...shade, left: 0, top: box.top, width: box.left, height: box.height }} />
      <View style={{ ...shade, left: right, top: box.top, width: pic.width - right, height: box.height }} />
    </View>
  );
}

/** Rule-of-thirds lines inside the box. */
function Grid() {
  const line = { position: "absolute" as const, backgroundColor: theme.colors.textMuted };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {THIRDS.map((at) => <View key={`v${at}`} style={{ ...line, left: at, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }} />)}
      {THIRDS.map((at) => <View key={`h${at}`} style={{ ...line, top: at, left: 0, right: 0, height: StyleSheet.hairlineWidth }} />)}
    </View>
  );
}
