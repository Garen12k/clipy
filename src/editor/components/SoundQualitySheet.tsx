import { useEffect, useRef } from "react";
import { Switch, View } from "react-native";
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { EQ_IDS, NO_SOUND, type EqId, type Project } from "@/src/editor/model/types";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

/** The noise-reduction test has run in this app session. */
let probed = false;
/** Tests only. */
export function resetNoiseProbe(): void { probed = false; }
/** The one line the test writes to the dev-server log: `[noise-probe] {"ok":…,"stage":"…","detail":"…"}`. */
const logProbe = (answer: unknown): void => console.log("[noise-probe]", JSON.stringify(answer));
const probeFailed = (e: unknown) => ({ ok: false, stage: "call", detail: e instanceof Error ? e.message : String(e) });
/**
 * The noise-reduction TEST (spec §9): asks the engine once per app start whether Apple's sound isolation unit can render this
 * recording, and writes the answer to the dev-server log. A development session only; nothing on screen, nothing stored, nothing
 * waited for. Neither a wrapper that throws at once (a build without the function) nor a rejected call reaches React.
 */
function runNoiseProbe(uri: string): void {
  if (probed || !__DEV__ || !isSoundAvailable()) return;
  probed = true;
  try {
    probeNoiseReduction(uri).then(logProbe, (e: unknown) => logProbe(probeFailed(e)));
  } catch (e) {
    logProbe(probeFailed(e));
  }
}

/**
 * The Sound strip of a sound bar ("Sound quality"): None or one of four equaliser presets, and Even out loudness. Both are stored on
 * the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts. A tile is one undo step, the switch one.
 * Without the engine (Expo Go, an older build) a tap changes nothing and the reason is said once.
 */
export function SoundQualitySheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const apply = useEditorStore((s) => s.apply);
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const told = useRef(false);
  const sourceUri = track?.sourceUri ?? null;
  useEffect(() => { if (visible && sourceUri) runNoiseProbe(sourceUri); }, [visible, sourceUri]);
  if (!track) return null;
  const sound = track.sound ?? NO_SOUND;

  /** One tap = one undo step; nothing at all without the engine. */
  const write = (op: (p: Project) => Project, buzz: boolean) => {
    if (!isSoundAvailable()) {
      if (!told.current) useToast.getState().show(SOUND_UNAVAILABLE);
      told.current = true;
      return;
    }
    if (buzz) haptic("light");
    apply(op);
  };
  const pick = (eq: EqId | null) => {
    if (sound.eq === eq) return;   // already ringed: no buzz, no undo step
    write((p) => setTrackSound(p, track.id, { eq }), true);
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Sound quality" note={busy ? <Spinner label="Preparing the sound" /> : undefined}>
      <StripTiles>
        <Tile label="None" icon="ban-outline" selected={sound.eq === null} onPress={() => pick(null)} />
        {EQ_IDS.map((id) => <Tile key={id} label={EQS[id].label} icon={EQS[id].icon} selected={sound.eq === id} onPress={() => pick(id)} />)}
      </StripTiles>
      <View testID="sound-level-row" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter }}>
        <Body style={{ fontSize: theme.type.small }}>Even out loudness</Body>
        <Switch accessibilityLabel="Even out loudness" value={sound.level} onValueChange={(on) => write((p) => setTrackSound(p, track.id, { level: on }), false)} trackColor={{ true: theme.colors.accent }} />
      </View>
    </ToolStrip>
  );
}
