import Slider from "@react-native-community/slider";
import { updateAudioTrackById } from "@/src/editor/model/ops";
import { AUDIO_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

export type FadePatch = { fadeIn?: number; fadeOut?: number };
/** What the fade sheet edits. */
export type FadeTarget = { type: "track"; id: string };

/** The longest fade the sliders offer for something `length` seconds long: half of it, at most AUDIO_LIMITS.fade's top. */
export const fadeCap = (length: number): number => Math.max(0, Math.min(AUDIO_LIMITS.fade[1], length / 2));

type SlidersProps = { fadeIn: number; fadeOut: number; length: number; onStart: () => void; onChange: (patch: FadePatch) => void };

/** The "Fade in" / "Fade out" pair, shared by the track's fade sheet and the clip's Volume sheet. `onStart` opens the drag's undo step. */
export function FadeSliders({ fadeIn, fadeOut, length, onStart, onChange }: SlidersProps) {
  const cap = fadeCap(length);
  const slider = (key: "fadeIn" | "fadeOut", label: string, testID: string, value: number) => (
    <>
      <Body muted>{label} {Math.min(value, cap).toFixed(1)} s</Body>
      <Slider testID={testID} minimumValue={AUDIO_LIMITS.fade[0]} maximumValue={cap} step={0.05} value={Math.min(value, cap)} disabled={cap <= 0}
        onSlidingStart={onStart} onValueChange={(v) => onChange({ [key]: Math.max(0, Math.min(v, cap)) })}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
    </>
  );
  return (
    <>
      {slider("fadeIn", "Fade in", "fade-in", fadeIn)}
      {slider("fadeOut", "Fade out", "fade-out", fadeOut)}
    </>
  );
}

/** Fade in / fade out of the selected audio track; one undo step per drag. */
export function AudioFadeSheet({ target, visible, onClose }: { target: FadeTarget | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => (target ? s.project?.audioTracks.find((t) => t.id === target.id) ?? null : null));
  const { beginTransaction, applyTransient } = useEditorStore.getState();
  if (!track) return null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Fade">
      <FadeSliders fadeIn={track.fadeIn} fadeOut={track.fadeOut} length={track.trimEnd - track.trimStart}
        onStart={beginTransaction} onChange={(patch) => applyTransient((p) => updateAudioTrackById(p, track.id, patch))} />
    </Sheet>
  );
}
