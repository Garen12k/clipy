import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { theme } from "@/src/theme/theme";
import { Icon, type IconName } from "@/src/ui/Icon";
import { wizardDrawTo, wizardPopTo, wizardStepTo } from "@/src/ui/motion";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";
import { isReducedMotion } from "@/src/ui/useReducedMotion";

/**
 * The wizard's pictures: the app's mark (page 1) and the four small scenes of page 2. Plain views and two svg paths — no image, no
 * video. Each plays ONCE, when `play` first turns true (its page has become the current one), from the builders in motion.ts; only
 * opacity and transform are driven. With Reduce Motion every value starts at its end, so the finished picture is simply there.
 */
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;
const clamp = Extrapolation.CLAMP;

/** Runs `start` once, the first time `play` is true. */
function useOnce(play: boolean, start: () => void): void {
  const played = useRef(false);
  // `play` alone: a shared value is never a dependency (the Jest mock hands out a new one on every render).
  useEffect(() => { if (!play || played.current) return; played.current = true; start(); }, [play]);
}

// ── The mark. The icon's own geometry (docs/design/icon, a 1024 box): the play triangle with 32-unit corners and the four-point spark
// above its tip, cropped to the box that holds both. ──
const BOX = { x: 290, y: 170, w: 600, h: 620 };
const SPARK = { x: 616, y: 186, side: 252 };
const TRIANGLE_PATH = "M372 300 L372 724 L743 512 Z";
const SPARK_PATH = "M742 190 L772 282 L862 312 L772 342 L742 434 L712 342 L622 312 L712 282 Z";
export const MARK_WIDTH = 150;
const K = MARK_WIDTH / BOX.w;
const MARK_HEIGHT = BOX.h * K;

/** The app's mark: the gold play triangle scales in, then its spark pops in. The spark is the page's text colour — white on navy, navy on cream. */
export function WizardMark({ play }: { play: boolean }) {
  const s = useSurfaces();
  const still = isReducedMotion() ? 1 : 0;
  const draw = useSharedValue(still);
  const pop = useSharedValue(still);
  useOnce(play, () => { const reduced = isReducedMotion(); draw.value = wizardDrawTo(reduced); pop.value = wizardPopTo(reduced); });
  const triangle = useAnimatedStyle(() => ({ opacity: draw.value, transform: [{ scale: 0.6 + 0.4 * draw.value }] }));
  const spark = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 2), transform: [{ scale: pop.value }] }));
  return (
    <View testID="wizard-mark" {...hidden} style={{ width: MARK_WIDTH, height: MARK_HEIGHT }}>
      <Animated.View testID="wizard-mark-triangle" style={[{ position: "absolute", left: 0, top: 0, width: MARK_WIDTH, height: MARK_HEIGHT }, triangle]}>
        <Svg width={MARK_WIDTH} height={MARK_HEIGHT} viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`}>
          <Path d={TRIANGLE_PATH} fill={s.accentInk} stroke={s.accentInk} strokeWidth={64} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Animated.View testID="wizard-mark-spark" style={[{ position: "absolute", left: (SPARK.x - BOX.x) * K, top: (SPARK.y - BOX.y) * K, width: SPARK.side * K, height: SPARK.side * K }, spark]}>
        <Svg width={SPARK.side * K} height={SPARK.side * K} viewBox={`${SPARK.x} ${SPARK.y} ${SPARK.side} ${SPARK.side}`}>
          <Path d={SPARK_PATH} fill={s.text} stroke={s.text} strokeWidth={10} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ── Page 2: four tiles, each with a small scene. ──
export type FeatureId = "beats" | "cutout" | "captions" | "stabilize";
/** The tool's own icon (toolGroups.ts) and the tile's words. */
export const FEATURES: readonly { id: FeatureId; label: string; icon: IconName }[] = [
  { id: "beats", label: "Cut to the beat", icon: "pulse-outline" },
  { id: "cutout", label: "Remove background", icon: "body-outline" },
  { id: "captions", label: "Captions", icon: "chatbox-ellipses-outline" },
  { id: "stabilize", label: "Stabilize", icon: "hand-left-outline" },
];
/** A tile before its turn: there, but dim. */
const DIM = 0.4;
/** The share of a tile's turn spent lighting up; its scene plays in the rest. */
const LIT_BY = 0.25;
const SCENE_HEIGHT = 72;
const FRAME = { width: 44, height: 64 };
type Progress = SharedValue<number>;
/** The scene's own 0 → 1, out of the tile's. */
function scene(p: number): number {
  "worklet";
  return interpolate(p, [LIT_BY, 1], [0, 1], clamp);
}

/** One tile: it lights up (dim → full), then its scene plays. `index` is its place in the row of four — its turn. */
export function FeatureTile({ id, label, icon, index, play }: { id: FeatureId; label: string; icon: IconName; index: number; play: boolean }) {
  const s = useSurfaces();
  const p = useSharedValue(isReducedMotion() ? 1 : 0);
  useOnce(play, () => { p.value = wizardStepTo(isReducedMotion(), index); });
  const lit = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, LIT_BY], [DIM, 1], clamp) }));
  return (
    <Animated.View testID={`wizard-tile-${id}`} accessible accessibilityLabel={label}
      style={[{ flex: 1, gap: theme.space.sm, padding: theme.space.md, borderRadius: theme.radius.card, backgroundColor: s.bar, borderWidth: 1, borderColor: s.separator }, lit]}>
      <View testID={`wizard-scene-${id}`} {...hidden} style={{ height: SCENE_HEIGHT, alignItems: "center", justifyContent: "center" }}>
        {id === "beats" ? <BeatsScene p={p} /> : id === "cutout" ? <CutoutScene p={p} /> : id === "captions" ? <CaptionsScene p={p} /> : <StabilizeScene p={p} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.xs }}>
        <Icon name={icon} size={theme.size.icon.md} color={s.accentInk} {...hidden} />
        <Body weight="semi" style={{ flexShrink: 1, textAlign: "center" }}>{label}</Body>
      </View>
    </Animated.View>
  );
}

/** Something of the scene that appears during the stretch `from` … `to` of it (opacity only). */
function Appear({ p, from, to, style }: { p: Progress; from: number; to: number; style: object }) {
  const anim = useAnimatedStyle(() => ({ opacity: interpolate(scene(p.value), [from, to], [0, 1], clamp) }));
  return <Animated.View style={[style, anim]} />;
}

const TICKS = [0, 1, 2, 3];
/** Cut to the beat: three clips in a row, and the beat ticks appear under them one by one. */
function BeatsScene({ p }: { p: Progress }) {
  const s = useSurfaces();
  const clip = { height: 28, borderRadius: theme.radius.chip, backgroundColor: s.lifted };
  return (
    <View style={{ alignSelf: "stretch", gap: theme.space.sm }}>
      <View style={{ flexDirection: "row", gap: theme.space.xs }}>
        <View style={[clip, { flex: 3 }]} /><View style={[clip, { flex: 2 }]} /><View style={[clip, { flex: 3 }]} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {TICKS.map((i) => <Appear key={i} p={p} from={i / TICKS.length} to={(i + 1) / TICKS.length} style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: s.accentInk }} />)}
      </View>
    </View>
  );
}

/** Remove background: a person in a frame; what is behind them fades away and the bare, dashed frame is left. */
function CutoutScene({ p }: { p: Progress }) {
  const s = useSurfaces();
  const behind = useAnimatedStyle(() => ({ opacity: 1 - scene(p.value) }));
  return (
    <View style={[FRAME, { borderRadius: theme.radius.chip, borderWidth: 1, borderStyle: "dashed", borderColor: s.muted, overflow: "hidden", alignItems: "center", justifyContent: "flex-end" }]}>
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: s.lifted }, behind]} />
      <View style={{ width: 16, height: 16, borderRadius: theme.radius.pill, backgroundColor: s.text }} />
      <View style={{ width: 30, height: 24, marginTop: theme.space.xs, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: s.accentInk }} />
    </View>
  );
}

/** Captions: a frame, and two caption lines appear at its foot, one after the other. */
function CaptionsScene({ p }: { p: Progress }) {
  const s = useSurfaces();
  const line = { height: 6, borderRadius: 3 };
  return (
    <View style={[FRAME, { borderRadius: theme.radius.chip, backgroundColor: s.lifted, alignItems: "center", justifyContent: "flex-end", gap: theme.space.xs, paddingBottom: theme.space.sm }]}>
      <Appear p={p} from={0} to={0.5} style={{ ...line, width: 30, backgroundColor: s.text }} />
      <Appear p={p} from={0.5} to={1} style={{ ...line, width: 22, backgroundColor: s.accentInk }} />
    </View>
  );
}

const TILT = -10;
/** Stabilize: a tilted frame comes level. */
function StabilizeScene({ p }: { p: Progress }) {
  const s = useSurfaces();
  const level = useAnimatedStyle(() => ({ transform: [{ rotate: `${(1 - scene(p.value)) * TILT}deg` }] }));
  return <Animated.View style={[{ width: FRAME.width, height: 56, borderRadius: theme.radius.chip, backgroundColor: s.lifted, borderWidth: 2, borderColor: s.accentInk }, level]} />;
}
