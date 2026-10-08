import { useEffect, useRef } from "react";
import { Switch, View } from "react-native";
import { isSoundAvailable } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { EQ_IDS, NO_SOUND, type EqId, type Project } from "@/src/editor/model/types";
import { runNoiseProbe } from "@/src/editor/noiseProbe";
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
  // The noise-reduction test (noiseProbe.ts): a development session only, once per install, to the dev log; never on screen.
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
