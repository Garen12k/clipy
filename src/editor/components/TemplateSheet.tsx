import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { applyTemplate } from "@/src/editor/model/ops";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { pickRandomTemplate, TEMPLATE_IDS, TEMPLATES, type Template, type TemplateId } from "@/src/editor/templates";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";

type Scope = "clip" | "project";
const TILE_W = 72;
const TILE_H = 72;

export function TemplateSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const hasClip = useEditorStore((s) => !!clipId && !!s.project?.clips.some((c) => c.id === clipId));
  const apply = useEditorStore((s) => s.apply);
  const undo = useEditorStore((s) => s.undo);
  const [scope, setScope] = useState<Scope>(hasClip ? "clip" : "project");
  const [lastId, setLastId] = useState<TemplateId | null>(null);
  const project = useEditorStore((s) => s.project);
  // The project as this panel's last template left it. Undo and the preview are reachable while the panel is open: a re-roll may
  // only undo that template while nothing else has happened since.
  const applied = useRef<Project | null>(null);
  const current = lastId !== null && project === applied.current ? lastId : null;

  // Re-rolls within one open panel replace each other: undo the previous template before applying the next, so
  // titles/stickers don't pile up and the whole session stays one Undo away. Forget it once the panel closes.
  useEffect(() => { if (visible) setScope(hasClip ? "clip" : "project"); else setLastId(null); }, [visible, hasClip]);

  const effective: Scope = hasClip ? scope : "project";
  const use = (t: Template) => {
    haptic("light");
    if (current !== null) undo();
    apply((p) => applyTemplate(p, t, effective, clipId));
    applied.current = useEditorStore.getState().project;
    setLastId(t.id);
  };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Templates" lead={<>
      <Chip label="This clip" selected={effective === "clip"} disabled={!hasClip} onPress={() => setScope("clip")} />
      <Chip label="Whole project" selected={effective === "project"} onPress={() => setScope("project")} />
    </>}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Random template" onPress={() => use(pickRandomTemplate(current))}
          style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}>
          <View style={[{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, backgroundColor: theme.elevation.tile, alignItems: "center", justifyContent: "center" }, theme.ringClear]}>
            <Text style={{ fontSize: 30 }}>🎲</Text>
          </View>
          <Body style={{ fontSize: theme.type.small }}>Random</Body>
        </PressableScale>
        {TEMPLATE_IDS.map((id) => {
          const t = TEMPLATES[id];
          const selected = current === id;
          return (
            <PressableScale key={id} lifted={selected} accessibilityRole="button" accessibilityLabel={`Template ${t.label}`} accessibilityState={{ selected }}
              onPress={() => use(t)} style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}>
              <View style={[{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, overflow: "hidden" }, selected ? theme.ring : theme.ringClear]}>
                <View style={{ flex: 1, backgroundColor: t.swatch[0] }} />
                <View style={{ flex: 1, backgroundColor: t.swatch[1] }} />
              </View>
              <Body style={{ fontSize: theme.type.small }}>{t.label}</Body>
            </PressableScale>
          );
        })}
      </View>
      {current ? <Body muted style={{ fontSize: 13 }}>{`Applied ${TEMPLATES[current].label} · tap Undo to revert`}</Body> : null}
    </ToolPanel>
  );
}
