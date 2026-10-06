import { useState } from "react";
import { View } from "react-native";
import { transitionProgress } from "@/src/editor/model/timeline";
import { slantCurtain, transitionCurtain, type TransitionCurtain } from "@/src/editor/model/transitionMath";
import { useEditorStore } from "@/src/editor/store";

const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
type Shaped = Exclude<TransitionCurtain, { kind: "dip" }>;

/** One shaped curtain in a frame of w × h points: a single view of a fixed size; only its transform follows the playhead. */
function Shape({ curtain: c, w, h }: { curtain: Shaped; w: number; h: number }) {
  const radius = Math.hypot(w, h) / 2;             // the frame's half-diagonal: a circle of this radius reaches the corners
  switch (c.kind) {
    case "panel":
      return <View testID="transition-shape" style={{ ...fill, backgroundColor: c.color, transform: [{ translateX: c.dx * w }, { translateY: c.dy * h }] }} />;
    case "disc":
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - radius, top: h / 2 - radius, width: 2 * radius, height: 2 * radius, borderRadius: radius, backgroundColor: c.color, transform: [{ scale: c.scale }] }} />;
    case "ring":
      // A clear circle of `radius` inside a border one radius thick: scaled by s, the hole has the radius s × radius and the border still reaches past the corners (s ≥ 0.5).
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - 2 * radius, top: h / 2 - 2 * radius, width: 4 * radius, height: 4 * radius, borderRadius: 2 * radius, borderWidth: radius, borderColor: c.color, transform: [{ scale: c.scale }] }} />;
    case "slant": {
      const g = slantCurtain(c.edge, c.side, w, h);
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - g.size / 2, top: h / 2 - g.size / 2, width: g.size, height: g.size, backgroundColor: c.color,
        transform: [{ translateX: g.dx }, { translateY: g.dy }, { rotate: `${g.angle}rad` }] }} />;
    }
  }
}

/**
 * What a transition lays over the preview's one picture across its window (`transitionCurtain`): a dip to black — every older type,
 * and the two the preview cannot draw —, a dip to white, or a black shape standing for the clip that is not playing.
 * It measures the frame itself (the preview player hands it nothing); a shape waits for that.
 */
export function TransitionLayer() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const tp = project ? transitionProgress(project, playhead) : null;
  if (!project || !tp) return null;
  const curtain = transitionCurtain(project.clips[tp.index].transitionOut.type, tp.progress);
  if (!curtain) return null;
  if (curtain.kind === "dip") {
    // The element every transition had before 2026-10-06, unchanged.
    return <View pointerEvents="none" testID="transition-layer" style={{ position: "absolute", inset: 0, backgroundColor: curtain.color, opacity: curtain.opacity }} />;
  }
  return (
    <View pointerEvents="none" testID="transition-layer" style={fill}
      onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; setFrame((was) => (was.w === w && was.h === h ? was : { w, h })); }}>
      {frame.w > 0 && frame.h > 0 ? <Shape curtain={curtain} w={frame.w} h={frame.h} /> : null}
    </View>
  );
}
