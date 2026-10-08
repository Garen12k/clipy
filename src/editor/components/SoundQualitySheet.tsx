import { useEffect, useRef } from "react";
import { Switch, View } from "react-native";
import { isSoundAvailable } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { EQ_IDS, NO_SOUND, NOISE_LIMITS, type EqId, type Project } from "@/src/editor/model/types";
import { runNoiseProbe } from "@/src/editor/noiseProbe";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { holdSounds, noiseRefusal, SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { STRIP, StripNote, StripSlider, StripTiles } from "@/src/ui/ToolStrip";

/** What the line under Reduce noise says: where it works and where it does not. */
export const NOISE_HINT = "Best on speech. Music can sound odd.";
/** The Reduce noise row: the switch row's height and one more step of the scale, for its second line. */
const NOISE_ROW = STRIP.slider + theme.space.md;
const SWITCH_ROW = { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter } as const;

/**
 * The Sound panel of a sound bar ("Sound quality"): None or one of four equaliser presets, Even out loudness, and Reduce noise with
 * its Strength. All are stored on the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts — never during a
 * Strength drag: the slider holds the renders in this track's name from slide start to slide complete (and the hold is let go when
 * the panel is hidden, or its track goes, mid-drag). A tile is one undo step, a switch one, a drag one.
 * Without the engine (Expo Go, an older build) a tap changes nothing and the reason is said once; Reduce noise has its own reason
 * (`noiseRefusal`: a build or an iPhone without it) and says it on every tap. Switching it off always works: the key is taken away.
 * Rows have explicit heights (72 + 36 + 48 + 36 of the 195 the body has); the body does not scroll.
 */
export function SoundQualitySheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const told = useRef(false);
  const sourceUri = track?.sourceUri ?? null;
  const here = !!track;
  // The noise-reduction test (noiseProbe.ts): a development session only, once per install, to the dev log; never on screen.
  useEffect(() => { if (visible && sourceUri) runNoiseProbe(sourceUri); }, [visible, sourceUri]);
  // Whether the Strength slider holds the renders right now (a ref: nothing is drawn from it).
  const held = useRef(false);
  const release = () => { if (!held.current) return; held.current = false; holdSounds(null); };
  // The slider can go while it is held (the panel is hidden, the selection changed, the track was removed, the editor is left):
  // slide complete never comes then, and the renders must not stay held.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => release, [visible, trackId, here]);
  if (!track) return null;
  const sound = track.sound ?? NO_SOUND;
  // Strength 0 is ON (the lightest); off is no `noise` at all.
  const noiseOn = typeof sound.noise === "number";
  const noise = sound.noise ?? NOISE_LIMITS.defaultStrength;

  /** Whether the engine is there; without it the reason is said once and the caller changes nothing. */
  const engine = (): boolean => {
    if (isSoundAvailable()) return true;
    if (!told.current) useToast.getState().show(SOUND_UNAVAILABLE);
    told.current = true;
    return false;
  };
  /** One tap = one undo step; nothing at all without the engine. */
  const write = (op: (p: Project) => Project, buzz: boolean) => {
    if (!engine()) return;
    if (buzz) haptic("light");
    apply(op);
  };
  const pick = (eq: EqId | null) => {
    if (sound.eq === eq) return;   // already ringed: no buzz, no undo step
    write((p) => setTrackSound(p, track.id, { eq }), true);
  };
  /** Off always works (the key is taken away). On needs the engine, and the build and the phone to have the unit. */
  const setNoise = (on: boolean) => {
    if (!on) { apply((p) => setTrackSound(p, track.id, { noise: undefined })); return; }
    if (!engine()) return;
    const why = noiseRefusal();
    if (why) { useToast.getState().show(why); return; }
    apply((p) => setTrackSound(p, track.id, { noise: NOISE_LIMITS.defaultStrength }));
  };
  // The hold comes first: the manager must not see a drag's first value as a setting to render.
  const start = () => { if (!noiseOn) return; holdSounds(track.id); held.current = true; beginTransaction(); };
  const change = (v: number) => { if (held.current) applyTransient((p) => setTrackSound(p, track.id, { noise: v })); };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Sound quality" size="compact" scroll={false}>
      {/* A fixed slot over the header's free middle: the spinner shows in it while the copy is rendered, and nothing moves. */}
      <View testID="sound-busy-slot" pointerEvents="none" style={{ position: "absolute", top: -PANEL.header, left: 0, right: 0, height: PANEL.header, alignItems: "center", justifyContent: "center" }}>
        {busy ? <Spinner label="Preparing the sound" /> : null}
      </View>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles>
          <Tile label="None" icon="ban-outline" selected={sound.eq === null} onPress={() => pick(null)} />
          {EQ_IDS.map((id) => <Tile key={id} label={EQS[id].label} icon={EQS[id].icon} selected={sound.eq === id} onPress={() => pick(id)} />)}
        </StripTiles>
        <View testID="sound-level-row" style={{ ...SWITCH_ROW, height: STRIP.slider }}>
          <Body style={{ fontSize: theme.type.small }}>Even out loudness</Body>
          <Switch accessibilityLabel="Even out loudness" value={sound.level} onValueChange={(on) => write((p) => setTrackSound(p, track.id, { level: on }), false)} trackColor={{ true: theme.colors.accent }} />
        </View>
        {/* The line under the name is always there, in the row's own height: nothing moves when the switch does. */}
        <View testID="sound-noise-row" style={{ ...SWITCH_ROW, height: NOISE_ROW }}>
          <View style={{ flex: 1, height: NOISE_ROW, justifyContent: "center" }}>
            <Body style={{ fontSize: theme.type.small }}>Reduce noise</Body>
            <StripNote>{NOISE_HINT}</StripNote>
          </View>
          <Switch accessibilityLabel="Reduce noise" value={noiseOn} onValueChange={setNoise} trackColor={{ true: theme.colors.accent }} />
        </View>
        <StripSlider label="Strength" value={`${Math.round(noise * 100)} %`}>
          <Slider
            testID="noise-strength"
            minimumValue={NOISE_LIMITS.strength[0]} maximumValue={NOISE_LIMITS.strength[1]} step={0.05}
            value={noise}
            disabled={!noiseOn}
            detents={[NOISE_LIMITS.defaultStrength]}
            onSlidingStart={start}
            onValueChange={change}
            onSlidingComplete={release}
          />
        </StripSlider>
      </View>
    </ToolPanel>
  );
}
