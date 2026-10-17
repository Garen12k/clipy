import { View } from "react-native";
import type { FillerPlan } from "@/src/editor/model/fillers";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body } from "@/src/ui/Text";

/** Every sentence of the row (spec §2.5–2.6). */
export const FILLER_WORDS = {
  title: "Filler words",
  none: "None found",
  note: "um, uh, erm, hmm — cut from the video and the captions",
  englishOnly: "Filler words are found in English captions only.",
  /** The same sentence as Remove pauses' `PAUSE_WORDS.notRemoved` (not imported: the strip's module pulls in the native wrappers; pinned equal in fillerWords.pauseWords.test.ts). */
  notRemoved: "Nothing was removed.",
} as const;
/** Said when Remove is tapped on a plan the project no longer gives. */
export const FILLER_CHANGED = "The captions have changed. Nothing was removed.";
export const fillersFound = (n: number): string => (n === 0 ? FILLER_WORDS.none : `${n} found`);
export const fillersCannot = (n: number): string => (n === 1 ? "1 is over a part that can't be cut." : `${n} are over parts that can't be cut.`);
export const fillerButton = (n: number): string => (n === 1 ? "Remove 1 Filler Word" : `Remove ${n} Filler Words`);
export const fillersRemoved = (n: number): string => (n === 1 ? "1 filler word removed" : `${n} filler words removed`);

/** The Captions panel's first row: what was found, what it does, and — when something can be cut — the white main button. */
export function FillerWordsRow({ plan, english, onRemove }: { plan: FillerPlan; english: boolean; onRemove: () => void }) {
  return (
    <View testID="filler-words" style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Body style={{ flex: 1 }}>{FILLER_WORDS.title}</Body>
        {english ? <Body muted>{fillersFound(plan.found)}</Body> : null}
      </View>
      <Body muted style={{ fontSize: theme.type.small }}>{english ? FILLER_WORDS.note : FILLER_WORDS.englishOnly}</Body>
      {english && plan.cannot > 0 ? <Body muted style={{ fontSize: theme.type.small }}>{fillersCannot(plan.cannot)}</Body> : null}
      {english && plan.removable > 0 ? <PrimaryButton compact tone="plain" title={fillerButton(plan.removable)} onPress={onRemove} /> : null}
    </View>
  );
}
