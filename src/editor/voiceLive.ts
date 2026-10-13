import { create } from "zustand";

type VoiceLive = {
  /** The Record tab is counting down (3 … 1): not a recording, but the editor is not standing still either (soundPeaks.ts's `idle`). */
  counting: boolean;
  /** How many of the meter's bars are lit: 0 outside a recording. */
  bars: number;
  /** The microphone has heard nothing for a while (model/voiceLevel.ts): false outside a recording. */
  quiet: boolean;
  setCounting(counting: boolean): void;
  setLevel(bars: number, quiet: boolean): void;
  reset(): void;
};

/**
 * What changes many times a second while a voice-over is made, kept OUT of the recorder hook's state: a level sample must draw the
 * meter again and nothing else — not the Record tab, not the panel, not the preview or the timeline. Written only by
 * `useVoiceRecorder`; read by the meter and the line under the record button (each its own small component with its own selector)
 * and, without a subscription, by soundPeaks.ts. A value that did not change is not set again.
 */
export const useVoiceLive = create<VoiceLive>((set, get) => ({
  counting: false, bars: 0, quiet: false,
  setCounting: (counting) => { if (get().counting !== counting) set({ counting }); },
  setLevel: (bars, quiet) => { const s = get(); if (s.bars !== bars || s.quiet !== quiet) set({ bars, quiet }); },
  reset: () => { const s = get(); if (s.counting || s.bars !== 0 || s.quiet) set({ counting: false, bars: 0, quiet: false }); },
}));
