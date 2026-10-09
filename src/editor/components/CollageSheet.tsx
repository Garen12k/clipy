import { View } from "react-native";
import { collageCells, isCellInPlace } from "@/src/editor/model/collage";
import { relayCollage } from "@/src/editor/model/collageOps";
import { COLLAGE_CELLS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, frameAspect, type CollageCorner, type CollageLayoutId } from "@/src/editor/model/types";
import { COLLAGE_LAYOUTS, CORNER_LABELS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { useClipMedia } from "@/src/editor/useClipMedia";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Tile } from "@/src/ui/Tile";
import { Spinner } from "@/src/ui/Spinner";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { StripSlider, StripTiles } from "@/src/ui/ToolStrip";

/** The square a tile draws its layout in (points), and the border it is drawn with so the cells read as separate. */
const DIAGRAM = 26;
const DIAGRAM_BORDER = 0.06;
/** How far the frame's shape may be from the one a collage was laid out for before "Fit to frame" is offered. */
const SAME_SHAPE = 1e-6;

/** A layout drawn small, from the same cells the collage is made of, in the frame's orientation (a tall frame stacks Big and two). The inset's small cell is drawn lighter so it shows on the big one. */
function LayoutDiagram({ layout, selected, aspect }: { layout: CollageLayoutId; selected: boolean; aspect: number }) {
  return (
    <View testID={`collage-diagram-${layout}`} style={{ width: DIAGRAM, height: DIAGRAM }}>
      {collageCells(layout, aspect, DIAGRAM_BORDER).map((c, i) => (
        <View key={i} style={{ position: "absolute", left: c.x * DIAGRAM, top: c.y * DIAGRAM, width: c.w * DIAGRAM, height: c.h * DIAGRAM,
          backgroundColor: layout === "inset" && i === 1 ? theme.colors.text : selected ? theme.colors.accent : theme.colors.textMuted }} />
      ))}
    </View>
  );
}

/**
 * The Collage panel. With nothing selected (opened from the main bar) a tile makes a collage: it opens the picker for that layout's
 * number of cells. With a collage cell selected the panel edits that collage: the tiles are the layouts it can turn into, Border
 * and Corner re-lay its cells (one undo step per drag), and "Fit to frame" appears when the frame's shape has changed since.
 * Only cells still in their place follow (`relayCollage`); what is shown as current is the selected cell's own tag, so a cell moved
 * by hand keeps showing the values it stopped at. Rows have explicit heights; the body does not scroll.
 */
export function CollageSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { makeCollage, busy } = useClipMedia();
  const aspect = useEditorStore((s) => (s.project ? frameAspect(s.project) : 1));
  const tag = clip?.collage ?? null;
  const group = tag?.group ?? null;
  // A cell that "Fit to frame" would move: in its place, and laid out for another frame shape. (A cell moved by hand never is: it
  // would keep the button up for good.)
  const stale = useEditorStore((s) => {
    if (!s.project || group === null) return false;
    const aspect = frameAspect(s.project);
    return s.project.layers.some((l) => l.collage?.group === group && Math.abs(l.collage.aspect - aspect) > SAME_SHAPE && isCellInPlace(l));
  });
  const layouts = tag ? COLLAGE_LAYOUT_IDS.filter((id) => COLLAGE_CELLS[id] === COLLAGE_CELLS[tag.layout]) : COLLAGE_LAYOUT_IDS;

  const pick = (id: CollageLayoutId) => {
    if (!tag) { if (!busy) void makeCollage(id); return; }
    if (busy) return;
    haptic("light");   // a re-lay that changes nothing (every cell already there) is the same project: `apply` adds no undo step
    apply((p) => relayCollage(p, tag.group, { layout: id }));
  };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Collage" size="compact" scroll={false}
      action={tag && stale ? { label: "Fit to Frame", onPress: () => { haptic("light"); apply((p) => relayCollage(p, tag.group, {})); } } : undefined}>
      {/* A fixed slot over the header's free middle: the spinner shows in it while the collage is being made, and nothing moves. */}
      <View testID="collage-busy-slot" pointerEvents="none" style={{ position: "absolute", top: -PANEL.header, left: 0, right: 0, height: PANEL.header, alignItems: "center", justifyContent: "center" }}>
        {busy ? <Spinner label="Making the collage" /> : null}
      </View>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles>
          {layouts.map((id) => {
            const selected = tag?.layout === id;
            return (
              <Tile key={id} label={COLLAGE_LAYOUTS[id].label} selected={selected} onPress={() => pick(id)}>
                <LayoutDiagram layout={id} selected={selected} aspect={aspect} />
              </Tile>
            );
          })}
        </StripTiles>
        <StripSlider label="Border" value={`${Math.round((tag?.border ?? 0) * 1000) / 10} %`}>
          <Slider
            testID="collage-border"
            minimumValue={COLLAGE_LIMITS.border[0]} maximumValue={COLLAGE_LIMITS.border[1]} step={COLLAGE_LIMITS.borderStep}
            value={tag?.border ?? 0}
            disabled={!tag}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => { if (tag) applyTransient((p) => relayCollage(p, tag.group, { border: v })); }}
          />
        </StripSlider>
        <StripSlider label="Corner" value={CORNER_LABELS[tag?.corner ?? 0]}>
          <Slider
            testID="collage-corner"
            minimumValue={0} maximumValue={2} step={1}
            value={tag?.corner ?? 0}
            disabled={!tag}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => { if (tag) applyTransient((p) => relayCollage(p, tag.group, { corner: Math.min(2, Math.max(0, Math.round(v))) as CollageCorner })); }}
          />
        </StripSlider>
      </View>
    </ToolPanel>
  );
}
