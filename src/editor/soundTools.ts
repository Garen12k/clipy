import type { EqId, VoiceId } from "./model/types";
import type { IoniconName } from "./toolGroups";

/** What each voice tile shows. The numbers behind a voice are in model/sound.ts. */
export const VOICES: Record<VoiceId, { label: string; icon: IoniconName }> = {
  deep: { label: "Deep", icon: "arrow-down-outline" },
  high: { label: "High", icon: "arrow-up-outline" },
  chipmunk: { label: "Chipmunk", icon: "paw-outline" },
  robot: { label: "Robot", icon: "hardware-chip-outline" },
  echo: { label: "Echo", icon: "repeat-outline" },
  hall: { label: "Hall", icon: "business-outline" },
  telephone: { label: "Telephone", icon: "call-outline" },
};

/** What each equaliser tile shows. */
export const EQS: Record<EqId, { label: string; icon: IoniconName }> = {
  bassBoost: { label: "Bass boost", icon: "pulse-outline" },
  clearVoice: { label: "Clear voice", icon: "chatbubble-outline" },
  warm: { label: "Warm", icon: "flame-outline" },
  bright: { label: "Bright", icon: "sunny-outline" },
};
