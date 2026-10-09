import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { AudioPreview } from "@/src/editor/components/AudioPreview";
import { EditorLayout } from "@/src/editor/components/EditorLayout";
import { EditorToolbar } from "@/src/editor/components/EditorToolbar";
import { EditorTopBar } from "@/src/editor/components/EditorTopBar";
import { MessageBar } from "@/src/editor/components/MessageBar";
import { PreviewPlayer } from "@/src/editor/components/PreviewPlayer";
import { ReorderHandle } from "@/src/editor/components/ReorderHandle";
import { Timeline } from "@/src/editor/components/Timeline";
import { TransportRow } from "@/src/editor/components/TransportRow";
import { TrimHandles } from "@/src/editor/components/TrimHandles";
import type { Project } from "@/src/editor/model/types";
import { useCutoutRenders } from "@/src/editor/cutoutRenders";
import { useSteadyRenders } from "@/src/editor/steadyRenders";
import { useSoundRenders } from "@/src/editor/soundRenders";
import { useEditorStore } from "@/src/editor/store";
import { closeForExport, openStrip } from "@/src/editor/toolStrip";
import { useAutosave } from "@/src/editor/useAutosave";
import { useLoadProject } from "@/src/editor/useLoadProject";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { Screen } from "@/src/ui/Screen";
import { Body, Title } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoadProject(id);
  const save = useCallback((p: Project) => storage.saveProject(p), []);
  useAutosave(save);
  useSoundRenders();
  useCutoutRenders();
  useSteadyRenders();
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);
  const clipById = (clipId: string) => project?.clips.find((c) => c.id === clipId);

  if (load.status === "loading") return <Screen tone="editor" style={{ justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></Screen>;
  if (load.status === "error") return (
    <Screen tone="editor" style={{ justifyContent: "center", alignItems: "center", padding: theme.space.xxl, gap: theme.space.md }}>
      <Title>Can't open project</Title><Body muted>{load.error}</Body>
    </Screen>
  );
  return (
    <Screen tone="editor">
      <EditorLayout
        top={<EditorTopBar onExport={() => { if (!closeForExport()) return; useToast.getState().clear(); useEditorStore.getState().setPlaying(false); router.push(`/editor/${id}/export`); }} />}
        preview={<>
          <PreviewPlayer onOpenPanel={(overlayId) => {
            // A double-tap on a text or a sticker: select it first, open second, so the panel's key is that overlay.
            const s = useEditorStore.getState();
            const overlay = s.project?.overlays.find((o) => o.id === overlayId);
            s.selectOverlay(overlayId);
            openStrip(overlay?.kind === "sticker" ? "stickerEdit" : "text");
          }} />
          <AudioPreview />
        </>}
        transport={<TransportRow />}
        timeline={<Timeline
          renderStripExtras={(clipId, index) => {
            if (clipId !== selectedClipId) return null;
            const clip = clipById(clipId);
            if (!clip) return null;
            return (
              <>
                <TrimHandles clip={clip} />
                <ReorderHandle clipId={clipId} index={index} />
              </>
            );
          }}
          onCutPress={(index) => {
            const clip = project?.clips[index];
            if (!clip) return;
            useEditorStore.getState().select(clip.id);
            openStrip("transition");
          }}
        />}
        toolbar={<EditorToolbar />}
      />
      {/* The editor's messages: a bar above the tools, not the toast. Last, and no ancestor of the preview or the timeline. */}
      <MessageBar />
    </Screen>
  );
}
