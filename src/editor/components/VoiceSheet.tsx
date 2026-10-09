import { useEffect, useMemo, useRef } from "react";
import { useWindowDimensions, View } from "react-native";
import { isSoundAvailable } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { NO_SOUND, SOUND_LIMITS, VOICE_IDS, type SoundSettings, type VoiceId } from "@/src/editor/model/types";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { holdSounds, SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { VOICES } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { STRIP, StripNote, StripSlider, StripTiles, tilesStartXIn, toolWidth } from "@/src/ui/ToolStrip";

/** Pitch 0: the slider ticks lightly when a drag reaches or passes it. */
const REST = [0] as const;
/** Why Strength does not move while no voice is picked (it is the voice that has a strength). */
export const STRENGTH_HINT = "Pick a voice to set its strength.";

/**
 * The Voice panel of a sound bar: None or one of seven voices, how strong, and a Pitch of its own (added to the voice's). The setting
 * is stored on the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts — never during a drag: a slider holds
 * the renders from slide start to slide complete, in this track's name: it alone plays its original meanwhile (and the hold is let
 * go when the panel is hidden, or its track goes, mid-drag).
 * A tile is one undo step, a drag one. Without the engine (Expo Go, an older build) the panel says so and changes nothing.
 * Rows have explicit heights; the body does not scroll.
 */
export function VoiceSheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { width: windowW } = useWindowDimensions();
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const sound = track?.sound ?? NO_SOUND;
  const here = !!track;
  // Where the row starts: the ringed tile in view (None is tile 0). Worked out when the panel opens (and for another track) — NOT
  // on every pick: a ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(sound.voice ? VOICE_IDS.indexOf(sound.voice) + 1 : 0, TILE_WIDTH, VOICE_IDS.length + 1, toolWidth(windowW)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, track?.id, windowW],
  );
  // Whether a slider of this panel holds the renders right now (a ref: nothing is drawn from it).
  const held = useRef(false);
  const release = () => { if (!held.current) return; held.current = false; holdSounds(null); };
  // The sliders can go while one is held (the panel is hidden, the selection changed, the track was removed, the editor is left):
  // slide complete never comes then, and the renders must not stay held.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => release, [visible, trackId, here]);
  if (!track) return null;
  const on = isSoundAvailable();

  const pick = (voice: VoiceId | null) => {
    if (!on || sound.voice === voice) return;   // no engine, or already ringed: no buzz, no undo step
    haptic("light");
    apply((p) => setTrackSound(p, track.id, { voice }));
  };
  // The hold comes first: the manager must not see a drag's first value as a setting to render.
  const start = (usable: boolean) => { if (!usable) return; holdSounds(track.id); held.current = true; beginTransaction(); };
  const change = (patch: Partial<SoundSettings>) => { if (held.current) applyTransient((p) => setTrackSound(p, track.id, patch)); };
  const strengthOn = on && sound.voice !== null;

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Voice" size="compact" scroll={false}>
      {/* A fixed slot over the header's free middle: the spinner shows in it while the copy is rendered, and nothing moves. */}
      <View testID="voice-busy-slot" pointerEvents="none" style={{ position: "absolute", top: -PANEL.header, left: 0, right: 0, height: PANEL.header, alignItems: "center", justifyContent: "center" }}>
        {busy ? <Spinner label="Preparing the sound" /> : null}
      </View>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles initialX={startX}>
          <Tile label="None" icon="ban-outline" selected={sound.voice === null} onPress={() => pick(null)} />
          {VOICE_IDS.map((id) => <Tile key={id} label={VOICES[id].label} icon={VOICES[id].icon} selected={sound.voice === id} onPress={() => pick(id)} />)}
        </StripTiles>
        <StripSlider label="Strength" value={`${Math.round(sound.strength * 100)} %`}>
          <Slider
            testID="voice-strength"
            minimumValue={SOUND_LIMITS.strength[0]} maximumValue={SOUND_LIMITS.strength[1]} step={0.05}
            value={sound.strength}
            disabled={!strengthOn}
            detents={[SOUND_LIMITS.defaultStrength]}
            onSlidingStart={() => start(strengthOn)}
            onValueChange={(v) => change({ strength: v })}
            onSlidingComplete={release}
          />
        </StripSlider>
        <StripSlider label="Pitch" value={`${sound.pitch > 0 ? "+" : ""}${sound.pitch}`}>
          <Slider
            testID="voice-pitch"
            minimumValue={SOUND_LIMITS.pitch[0]} maximumValue={SOUND_LIMITS.pitch[1]} step={1}
            value={sound.pitch}
            disabled={!on}
            detents={REST}
            onSlidingStart={() => start(on)}
            onValueChange={(v) => change({ pitch: v })}
            onSlidingComplete={release}
          />
        </StripSlider>
        {/* Said once, in a row of its own height under the sliders (the body has the room: 195 pt for 72 + 36 + 36 + 36). */}
        {on ? null : (
          <View testID="voice-unavailable" style={{ height: STRIP.slider, justifyContent: "center", paddingHorizontal: theme.space.gutter }}>
            <StripNote lines={2}>{SOUND_UNAVAILABLE}</StripNote>
          </View>
        )}
        {/* The same row, for the other reason a slider is off: Strength has nothing to act on until a voice is picked. It is the
            last row of a body with an explicit height, so nothing above it moves when it comes or goes. */}
        {on && sound.voice === null ? (
          <View testID="voice-strength-hint" style={{ height: STRIP.slider, justifyContent: "center", paddingHorizontal: theme.space.gutter }}>
            <StripNote>{STRENGTH_HINT}</StripNote>
          </View>
        ) : null}
      </View>
    </ToolPanel>
  );
}
