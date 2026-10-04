import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { PLATFORM_LABELS } from "@/src/editor/model/types";
import { editedLabel, formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body, Title } from "@/src/ui/Text";
import { useReducedMotion } from "@/src/ui/useReducedMotion";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; index: number; onPress: () => void; onLongPress: () => void };

export function ProjectCard({ summary, index, onPress, onLongPress }: Props) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => { t.value = reduced ? 1 : withDelay(Math.min(index, 8) * theme.motion.stagger, withTiming(1, { duration: theme.motion.fade })); }, [index, reduced, t]);
  const enter = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * 8 }] }));
  const edited = summary.updatedAt ? editedLabel(summary.updatedAt) : "";
  const secondLine = summary.postedTo.length ? `Posted · ${summary.postedTo.map((id) => PLATFORM_LABELS[id]).join(", ")}` : edited;
  return (
    <Animated.View testID="project-card-cell" style={[{ width: "50%", padding: theme.space.sm }, enter]}>
      <PressableScale accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
        style={{ borderRadius: theme.radius.card, borderWidth: 1.5, borderColor: summary.broken ? theme.colors.danger : theme.colors.hairline, backgroundColor: theme.colors.surface, overflow: "hidden", aspectRatio: 3 / 4 }}>
        {summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Body muted>{summary.broken ? "Damaged" : "No preview"}</Body></View>}
        {summary.broken ? null : (
          <View style={{ position: "absolute", top: theme.space.sm, right: theme.space.sm, backgroundColor: theme.colors.scrimStrong, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.sm, paddingVertical: 2 }}>
            <Body weight="semi" style={{ fontSize: 11, color: theme.colors.accent }}>{formatDuration(summary.durationSec)}</Body>
          </View>
        )}
        {summary.coverTitle ? (
          // Drawn as on the cover itself (CoverFrame): the title font, as typed.
          <Title testID="project-cover-title" size={15} numberOfLines={2}
            style={{ position: "absolute", left: theme.space.sm, right: theme.space.sm, bottom: 56, textAlign: "center", textTransform: "none", letterSpacing: 0 }}>{summary.coverTitle}</Title>
        ) : null}
        <LinearGradient colors={["transparent", theme.colors.scrimStrong]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.space.md, paddingTop: theme.space.xl }}>
          <Body weight="semi" numberOfLines={1} style={{ color: summary.broken ? theme.colors.danger : theme.colors.text }}>{summary.name}</Body>
          <Body muted style={{ fontSize: 11 }}>{secondLine}</Body>
        </LinearGradient>
      </PressableScale>
    </Animated.View>
  );
}
