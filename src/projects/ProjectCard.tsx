import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";
import { PLATFORM_LABELS } from "@/src/editor/model/types";
import { editedLabel, formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body, Title } from "@/src/ui/Text";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; onPress: () => void; onLongPress: () => void };

/** The length badge's height. */
const BADGE = 20;
/** The cover title as on the cover itself (CoverFrame): its size, and how far above the card's bottom edge it sits (clear of the name). */
const COVER_TITLE = { size: 15, bottom: 56 } as const;

/**
 * One project on the home screen: its cover picture, the length top right, and the name over a dark fade at the bottom.
 * It dips when pressed (PressableScale) and has no animation of its own: the LIST eases in once (app/index.tsx), so a card
 * that scrolls back into view or a refreshed list never replays anything. Depth is colour and the fade — no shadow.
 */
export function ProjectCard({ summary, onPress, onLongPress }: Props) {
  const edited = summary.updatedAt ? editedLabel(summary.updatedAt) : "";
  const secondLine = summary.postedTo.length ? `Posted · ${summary.postedTo.map((id) => PLATFORM_LABELS[id]).join(", ")}` : edited;
  return (
    <View testID="project-card-cell" style={{ width: "50%", padding: theme.space.sm }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
        style={{ aspectRatio: 3 / 4, borderRadius: theme.radius.cover, overflow: "hidden", backgroundColor: theme.elevation.tile,
          borderWidth: summary.broken ? 1.5 : 1, borderColor: summary.broken ? theme.colors.danger : theme.colors.hairline }}>
        {summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Body muted>{summary.broken ? "Damaged" : "No preview"}</Body></View>}
        {summary.broken ? null : (
          <View style={{ position: "absolute", top: theme.space.sm, right: theme.space.sm, height: BADGE, justifyContent: "center", paddingHorizontal: theme.space.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong }}>
            <Body weight="semi" style={{ fontSize: theme.type.small, fontVariant: ["tabular-nums"] }}>{formatDuration(summary.durationSec)}</Body>
          </View>
        )}
        {summary.coverTitle ? (
          // Drawn as on the cover itself (CoverFrame): the title font, as typed.
          <Title testID="project-cover-title" size={COVER_TITLE.size} numberOfLines={2}
            style={{ position: "absolute", left: theme.space.sm, right: theme.space.sm, bottom: COVER_TITLE.bottom, textAlign: "center", textTransform: "none", letterSpacing: 0 }}>{summary.coverTitle}</Title>
        ) : null}
        <LinearGradient colors={["transparent", theme.colors.scrim, theme.colors.scrimStrong]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.space.md, paddingTop: theme.space.xxl }}>
          <Body weight="semi" numberOfLines={1} style={{ fontSize: theme.type.body, color: summary.broken ? theme.colors.danger : theme.colors.text }}>{summary.name}</Body>
          <Body muted numberOfLines={1} style={{ fontSize: theme.type.small }}>{secondLine}</Body>
        </LinearGradient>
      </PressableScale>
    </View>
  );
}
