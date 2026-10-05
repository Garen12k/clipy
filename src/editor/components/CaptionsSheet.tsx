import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { useEditorStore } from "@/src/editor/store";
import { rekeyStrip } from "@/src/editor/toolStrip";
import { useCaptions } from "@/src/editor/useCaptions";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { CaptionStyleSheet } from "./CaptionStyleSheet";

type Props = { visible: boolean; onClose: () => void };

export function CaptionsSheet({ visible, onClose }: Props) {
  const { state, run, cancel, reset } = useCaptions();
  const hasCaptions = useEditorStore((s) => s.project?.overlays.some((o) => o.kind === "caption") ?? false);
  const project = useEditorStore((s) => s.project);
  const clipIds = project?.clips.map((c) => c.id) ?? [];
  const clipCount = clipIds.length;
  const [styling, setStyling] = useState(false);

  // Closing mid-run cancels it, so captions never land after the panel is gone.
  const close = () => { if (state.status === "running") cancel(); reset(); onClose(); };
  // Hidden by the host (another selection, Export): the same clean-up, and the next opening starts on Captions.
  useEffect(() => {
    if (visible) return;
    if (state.status === "running") cancel();
    reset();
    setStyling(false);
  }, [visible]);
  // The captions are about to be replaced: a selected one would vanish and close this panel with it. Deselect it and re-key first.
  const start = () => {
    const s = useEditorStore.getState();
    if (s.selectedOverlayId && s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind === "caption") { s.selectOverlay(null); rekeyStrip(); }
    return run();
  };

  return (
    <>
      <ToolPanel visible={visible && !styling} onClose={close} title="Captions" size="compact">
        {state.status === "unavailable" && (
          <View style={{ gap: theme.space.sm }}>
            <Body>Captions need the native build</Body>
            <Body muted>Transcription runs on your iPhone with Apple&apos;s speech recognizer, which Expo Go can&apos;t load.</Body>
            {/* The looks can still be tried here: the style panel previews them on its sample. */}
            <SecondaryButton title="Style captions" onPress={() => setStyling(true)} />
          </View>
        )}

        {state.status === "idle" && hasCaptions && (
          <View style={{ gap: theme.space.md }}>
            <Body>Replace existing captions?</Body>
            {/* Stacked like the "done" branch: three uppercase buttons don't fit one row in a panel. All three compact (36): the card
                is then 162 pt (a line of text + 3 gaps of 12 + 3 × 36) in a body that shows 171, so nothing scrolls; at 48 it would be 198. */}
            <PrimaryButton compact title="Replace" onPress={start} />
            <SecondaryButton compact title="Style captions" onPress={() => setStyling(true)} />
            <QuietButton compact title="Cancel" onPress={close} />
          </View>
        )}

        {state.status === "idle" && !hasCaptions && (
          <View style={{ gap: theme.space.sm }}>
            <PrimaryButton title="Transcribe" onPress={start} />
            <Body muted>Uses on-device speech recognition. Clips: {clipCount}</Body>
          </View>
        )}

        {state.status === "running" && (
          <View style={{ gap: theme.space.md }}>
            <Body>Transcribing clip {state.clipIndex + 1} of {state.clipCount}…</Body>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.accent, width: `${state.clipCount ? ((state.clipIndex + 1) / state.clipCount) * 100 : 0}%` }} />
            </View>
            <SecondaryButton title="Cancel" onPress={cancel} />
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
            <SecondaryButton title="Style captions" onPress={() => setStyling(true)} />
          </View>
        )}

        {state.status === "error" && (
          <View style={{ gap: theme.space.md }}>
            <Body>{state.message}</Body>
            {state.code === "E_SPEECH_DENIED"
              ? <PrimaryButton title="Open Settings" onPress={() => { Linking.openSettings(); }} />
              : <PrimaryButton title="Try again" onPress={start} />}
          </View>
        )}
      </ToolPanel>
      <CaptionStyleSheet visible={visible && styling} onClose={() => setStyling(false)} />
    </>
  );
}
