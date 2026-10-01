import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { applyTemplate } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { pickRandomTemplate, TEMPLATE_IDS, TEMPLATES, type Template, type TemplateId } from "@/src/editor/templates";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

type Scope = "clip" | "project";
const TILE_W = 72;
const TILE_H = 72;

export function TemplateSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const hasClip = useEditorStore((s) => !!clipId && !!s.project?.clips.some((c) => c.id === clipId));
  const apply = useEditorStore((s) => s.apply);
  const [scope, setScope] = useState<Scope>(hasClip ? "clip" : "project");
  const [lastId, setLastId] = useState<TemplateId | null>(null);

  useEffect(() => { if (visible) setScope(hasClip ? "clip" : "project"); }, [visible, hasClip]);

  const effective: Scope = hasClip ? scope : "project";
  const use = (t: Template) => {
    apply((p) => applyTemplate(p, t, effective, clipId));
    setLastId(t.id);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Templates">
      <View style={{ flexDirection: "row", gap: theme.space.sm }}>
        <Chip label="This clip" selected={effective === "clip"} disabled={!hasClip} onPress={() => setScope("clip")} />
        <Chip label="Whole project" selected={effective === "project"} onPress={() => setScope("project")} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Random template" onPress={() => use(pickRandomTemplate(lastId))}
          style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}>
          <View style={{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.straw }}>
            <Text style={{ fontSize: 30 }}>🎲</Text>
          </View>
          <Body style={{ fontSize: 12 }}>Random</Body>
        </Pressable>
        {TEMPLATE_IDS.map((id) => {
          const t = TEMPLATES[id];
          const selected = lastId === id;
          return (
            <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Template ${t.label}`} accessibilityState={{ selected }}
              onPress={() => use(t)} style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}>
              <View style={{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, overflow: "hidden", borderWidth: 2, borderColor: selected ? theme.colors.highlight : "transparent" }}>
                <View style={{ flex: 1, backgroundColor: t.swatch[0] }} />
                <View style={{ flex: 1, backgroundColor: t.swatch[1] }} />
              </View>
              <Body style={{ fontSize: 12 }}>{t.label}</Body>
            </Pressable>
          );
        })}
      </View>
      {lastId ? <Body style={{ fontSize: 13, color: theme.colors.textMuted }}>{`Applied ${TEMPLATES[lastId].label} · tap Undo to revert`}</Body> : null}
    </Sheet>
  );
}
