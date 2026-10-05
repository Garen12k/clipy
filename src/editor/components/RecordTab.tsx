import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { View } from "react-native";
import { useVoiceRecorder } from "@/src/editor/useVoiceRecorder";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";

const BUTTON = 84;

/** Asked by the host before it closes or switches away: true means "not now" (a recording is being stopped and saved, or is busy). */
export type RecordCloseGuard = { current: (() => boolean) | null };

/**
 * The Add audio panel's Record tab: one round button that starts a voice-over (the video plays, its sound muted) and stops it.
 * `onDone` is called when the panel should close: after a recording was saved, and before any message is shown.
 */
export function RecordTab({ onDone, closeGuard }: { onDone: () => void; closeGuard?: RecordCloseGuard }) {
  const { state, elapsed, start, stop } = useVoiceRecorder({ onDismiss: onDone });
  const active = state === "recording" || state === "saving";
  const disabled = state === "starting" || state === "saving";

  useEffect(() => {
    if (!closeGuard) return;
    closeGuard.current = () => {
      if (state === "idle") return false;
      if (state === "recording") void stop();   // same as pressing stop: it saves, then closes through onDone
      return true;
    };
    return () => { closeGuard.current = null; };
  }, [closeGuard, state, stop]);

  return (
    <View style={{ alignItems: "center", gap: theme.space.md, paddingVertical: theme.space.sm }}>
      <Body weight="bold" style={{ fontSize: 28, fontVariant: ["tabular-nums"] }}>{formatDuration(elapsed)}</Body>
      <PressableScale accessibilityRole="button" accessibilityLabel={active ? "Stop recording" : "Start recording"} accessibilityState={{ disabled }}
        disabled={disabled} onPress={() => { void (active ? stop() : start()); }}
        style={{ width: BUTTON, height: BUTTON, borderRadius: theme.radius.pill, backgroundColor: theme.colors.danger, borderWidth: 3, borderColor: theme.colors.text,
          alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
        <Ionicons name={active ? "stop" : "mic"} size={36} color={theme.colors.text} />
      </PressableScale>
      <Body>{state === "recording" ? "Recording…" : state === "saving" ? "Saving…" : " "}</Body>
      <Body muted style={{ textAlign: "center" }}>Plays your video while you talk. Other sound is muted while recording.</Body>
    </View>
  );
}
