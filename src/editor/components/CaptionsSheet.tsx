import { useState } from "react";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { useEditorStore } from "@/src/editor/store";
import { useCaptions } from "@/src/editor/useCaptions";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { Chip } from "@/src/ui/Chip";
import { CaptionStyleSheet } from "./CaptionStyleSheet";

type Props = { visible: boolean; onClose: () => void };

export function CaptionsSheet({ visible, onClose }: Props) {
  const { state, run, cancel, reset } = useCaptions();
  const hasCaptions = useEditorStore((s) => s.project?.overlays.some((o) => o.kind === "caption") ?? false);
  const project = useEditorStore((s) => s.project);
  const clipIds = project?.clips.map((c) => c.id) ?? [];
  const clipCount = clipIds.length;
  const [styling, setStyling] = useState(false);

  const close = () => { reset(); onClose(); };

  return (
    <Sheet visible={visible} onClose={close} title="Captions">
      <View style={{ gap: theme.space.lg }}>
        {state.status === "unavailable" && (
          <View style={{ gap: theme.space.sm }}>
            <Body>Captions need the native build</Body>
            <Body muted>Transcription runs on your iPhone with Apple&apos;s speech recognizer, which Expo Go can&apos;t load.</Body>
          </View>
        )}

        {state.status === "idle" && hasCaptions && (
          <View style={{ gap: theme.space.md }}>
            <Body>Replace existing captions?</Body>
            <View style={{ flexDirection: "row", gap: theme.space.md }}>
              <PrimaryButton title="Replace" onPress={run} />
              <Chip label="Cancel" selected={false} onPress={close} />
            </View>
          </View>
        )}

        {state.status === "idle" && !hasCaptions && (
          <View style={{ gap: theme.space.sm }}>
            <PrimaryButton title="Transcribe" onPress={run} />
            <Body muted>Uses on-device speech recognition. Clips: {clipCount}</Body>
          </View>
        )}

        {state.status === "running" && (
          <View style={{ gap: theme.space.md }}>
            <Body>Transcribing clip {state.clipIndex + 1} of {state.clipCount}…</Body>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.accent, width: `${state.clipCount ? ((state.clipIndex + 1) / state.clipCount) * 100 : 0}%` }} />
            </View>
            <Chip label="Cancel" selected={false} onPress={cancel} />
          </View>
        )}

        {state.status === "done" && (
          <View style={{ gap: theme.space.md }}>
            <Body>Added captions.</Body>
            {state.skipped.length > 0 && (
              <Body muted>
                No speech found in: {state.skipped.map((id) => `clip ${clipIds.indexOf(id) + 1}`).join(", ")}
              </Body>
            )}
            <PrimaryButton title="Style captions" onPress={() => setStyling(true)} />
            <Chip label="Done" selected={false} onPress={close} />
          </View>
        )}

        {state.status === "error" && (
          <View style={{ gap: theme.space.md }}>
            <Body>{state.message}</Body>
            <PrimaryButton title="Try again" onPress={run} />
          </View>
        )}
      </View>
      <CaptionStyleSheet visible={styling} onClose={() => setStyling(false)} />
    </Sheet>
  );
}
