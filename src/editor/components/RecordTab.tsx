import { Icon } from "@/src/ui/Icon";
import { memo, useEffect } from "react";
import { AccessibilityInfo, View } from "react-native";
import { VOICE_LEVEL } from "@/src/editor/model/voiceLevel";
import { useVoiceRecorder, type VoiceRecorderState } from "@/src/editor/useVoiceRecorder";
import { useVoiceLive } from "@/src/editor/voiceLive";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";

const BUTTON = 84;
/** The level meter: a row `height` tall that is ALWAYS there (so nothing moves when a recording starts or ends), with bars `bar` wide while recording. */
export const METER = { height: 16, bar: 6 } as const;
const BARS = Array.from({ length: VOICE_LEVEL.bars }, (_, i) => i);

/** Asked by the host before it closes or switches away: true means "not now" (a recording is being stopped and saved, or is busy). */
export type RecordCloseGuard = { current: (() => boolean) | null };

/**
 * The microphone's level while recording: bars up to the level lit, the rest dim. The ONLY part drawn again for a level sample (at
 * most ten a second): it reads the level from its own store, and a change is a plain colour value — nothing is animated.
 */
const VoiceMeter = memo(function VoiceMeter({ on }: { on: boolean }) {
  const lit = useVoiceLive((s) => s.bars);
  return (
    <View testID="voice-meter" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ height: METER.height, flexDirection: "row", alignItems: "center", gap: theme.space.xs }}>
      {on ? BARS.map((i) => (
        <View key={i} testID={`voice-meter-bar-${i}`} style={{ width: METER.bar, height: METER.height, borderRadius: theme.radius.pill, backgroundColor: i < lit ? theme.colors.text : theme.colors.track }} />
      )) : null}
    </View>
  );
});

/** The line under the meter. Only while recording does it listen to the level's verdict, so only then can a sample draw it again. */
const RecordLine = memo(function RecordLine({ state }: { state: VoiceRecorderState }) {
  const quiet = useVoiceLive((s) => state === "recording" && s.quiet);
  return <Body>{state === "counting" ? "Get ready" : state === "recording" ? (quiet ? "Too quiet — check the microphone" : "Recording…") : state === "saving" ? "Saving…" : " "}</Body>;
});

/**
 * The Add audio panel's Record tab: one round button. A tap counts 3, 2, 1 (the number in place of the mic, the button a red ring)
 * and then starts a voice-over (the video plays, its sound muted); a tap during the countdown cancels it, a tap while recording stops.
 * `onDone` is called when the panel should close: after a recording was saved, and before any message is shown.
 */
export function RecordTab({ onDone, closeGuard }: { onDone: () => void; closeGuard?: RecordCloseGuard }) {
  const { state, elapsed, count, begin, cancelCount, stop } = useVoiceRecorder({ onDismiss: onDone });
  const counting = state === "counting";
  const active = state === "recording" || state === "saving";
  const disabled = state === "starting" || state === "saving";

  useEffect(() => {
    if (!closeGuard) return;
    closeGuard.current = () => {
      if (state === "idle") return false;
      if (state === "counting") { cancelCount(); return false; }   // a countdown is not a recording: it ends, and the host may close
      if (state === "recording") void stop();   // same as pressing stop: it saves, then closes through onDone
      return true;
    };
    return () => { closeGuard.current = null; };
  }, [closeGuard, state, stop, cancelCount]);

  // VoiceOver hears each number as it appears (a plain text change is not read by itself).
  useEffect(() => { if (counting && count > 0) AccessibilityInfo.announceForAccessibility(String(count)); }, [counting, count]);

  return (
    <View style={{ alignItems: "center", gap: theme.space.md, paddingVertical: theme.space.sm }}>
      <Body weight="bold" muted={counting} style={{ fontSize: 28, fontVariant: ["tabular-nums"] }}>{formatDuration(elapsed)}</Body>
      <PressableScale testID="record-button" accessibilityRole="button" accessibilityLabel={counting ? "Cancel countdown" : active ? "Stop recording" : "Start recording"} accessibilityState={{ disabled }}
        disabled={disabled} onPress={() => { if (counting) cancelCount(); else if (active) void stop(); else begin(); }}
        style={{ width: BUTTON, height: BUTTON, borderRadius: theme.radius.pill, backgroundColor: counting ? "transparent" : theme.colors.danger, borderWidth: 3, borderColor: counting ? theme.colors.danger : theme.colors.text,
          alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
        {counting
          ? <Body weight="bold" style={{ fontSize: 36, fontVariant: ["tabular-nums"] }}>{count}</Body>
          : <Icon name={active ? "stop" : "mic"} size={36} color={theme.colors.text} />}
      </PressableScale>
      <VoiceMeter on={state === "recording"} />
      <RecordLine state={state} />
      <Body muted style={{ textAlign: "center" }}>Plays your video while you talk. Other sound is muted while recording.</Body>
    </View>
  );
}
