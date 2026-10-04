import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { layersAt } from "@/src/editor/model/timeline";
import { isPhoto } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AdjustLayer } from "./AdjustLayer";
import { ClipFrame, clipFrameMotion } from "./ClipFrame";
import { FilterLayer } from "./FilterLayer";
import { LayerVideo } from "./LayerVideo";

const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/**
 * The layers on screen at the playhead, drawn in list order (later = on top) over the main picture in a frame of
 * `frameW`×`frameH`. Each is a see-through `ClipFrame` placed by its own motion at `playhead − layer.start`, holding a photo or
 * a `LayerVideo` (its own player); its filter / adjust layers sit inside its picture box, so its mask and opacity apply to them.
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
        const offset = playhead - layer.start;
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
              {!isPhoto(layer) && !missing.includes(layer.sourceUri) && <LayerVideo layer={layer} offset={offset} />}
            </ClipFrame>
          </View>
        );
      })}
    </View>
  );
}
