import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { shownCutout, useCutoutFiles } from "@/src/editor/cutoutFiles";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { itemOffsetAt, layersAt } from "@/src/editor/model/timeline";
import { isPhoto, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AdjustLayer } from "./AdjustLayer";
import { ClipFrame, clipFrameMotion } from "./ClipFrame";
import { FilterLayer } from "./FilterLayer";
import { LayerVideo } from "./LayerVideo";

const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/**
 * A video layer's one player. Remove background: once the layer's cut-out copy is ready the player is handed the layer with the
 * copy's uri instead (the copy has the layer's timing and its sound), so it loads that file in place — the same player, never a
 * second one. The selector returns the uri itself, so a render's progress draws nothing here; without a ready copy the layer is
 * passed on as it is.
 */
function LayerPicture({ layer, offset }: { layer: LayerClip; offset: number }) {
  const cut = useCutoutFiles((s) => (CUTOUT_PREVIEW.layerVideo ? shownCutout(s.files, layer) : null));
  const played = useMemo(() => (cut !== null ? { ...layer, sourceUri: cut } : layer), [layer, cut]);
  return <LayerVideo layer={played} offset={offset} />;
}

/**
 * The layers on screen at the playhead, drawn in list order (later = on top) over the main picture in a frame of
 * `frameW`×`frameH`. Each is a see-through `ClipFrame` placed by its own motion at its offset under the playhead (`itemOffsetAt` —
 * the one formula the preview's hit test uses too, so a layer is tapped where it is drawn), holding a photo or
 * a `LayerVideo` (its own player, through `LayerPicture`: its cut-out copy once that is ready); its filter / adjust layers sit inside its picture box, so its mask and opacity apply to them.
 * Keyed by layer id: a layer entering or leaving the playhead mounts / unmounts only itself. Nothing here takes touches.
 * `style` is the timeline-effect transform of the picture, so the layers shake / zoom with it. Renders nothing without layers.
 */
export function LayerStack({ frameW, frameH, style }: { frameW: number; frameH: number; style?: StyleProp<ViewStyle> }) {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const layers = useMemo(() => (project ? layersAt(project, playhead) : []), [project, playhead]);
  if (layers.length === 0 || !(frameW > 0) || !(frameH > 0)) return null;

  return (
    <View testID="layer-stack" pointerEvents="none" style={[fill, style]}>
      {layers.map((layer) => {
        const offset = (project && itemOffsetAt(project, layer.id, playhead)) ?? 0;
        const motion = clipFrameMotion(layer, offset);
        return (
          <View key={layer.id} testID={`layer-${layer.id}`} pointerEvents="none" style={fill}>
            <ClipFrame
              clip={layer} frameW={frameW} frameH={frameH} transparent transform={motion.transform} opacity={motion.opacity}
              overlayChildren={<>
                <FilterLayer filter={layer.filter} intensity={layer.filterIntensity} />
                <AdjustLayer adjust={layer.adjust} />
              </>}>
              {/* A missing file is never loaded: the layer keeps its place but shows nothing. */}
              {!isPhoto(layer) && !missing.includes(layer.sourceUri) && <LayerPicture layer={layer} offset={offset} />}
            </ClipFrame>
          </View>
        );
      })}
    </View>
  );
}
