import { Icon } from "@/src/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, Text, View } from "react-native";
import { COVER_FONT } from "@/src/editor/coverFont";
import { PLATFORM_LABELS } from "@/src/editor/model/types";
import { editedLabel, formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; /** A tap on the picture or on the words under it. */ onPress: () => void; onLongPress: () => void; /** The "…" button. */ onMore: () => void };

const LONG_PRESS_MS = 350;
/** The words under the picture: the name's line and room for a status of two lines ("Posted · YouTube, TikTok" wraps beside the More button), so every row is the same height whatever its cards say. */
const WORDS = { name: theme.text.subhead.leading, status: theme.text.footnote.leading } as const;
const CAPTION_MIN = theme.space.sm + WORDS.name + 2 * WORDS.status;

/**
 * One project on the home screen. The PICTURE is clean: its cover, the length top right and — when the cover has one — the cover's
 * own title at the bottom over a dark fade. The NAME and the status line sit under it, with the More button ("…") trailing.
 *
 * Three touch targets, none inside another: the picture (THE button VoiceOver reads, labelled with the name; it dips when pressed),
 * the words (the same tap and long press, but not a second button: `accessible={false}`, so VoiceOver reads them as plain text), and
 * More (its own button, 44 pt around a small circle). So a tap on More can never also open the project.
 *
 * It has no animation of its own: the LIST eases in once (app/index.tsx), so a card that scrolls back into view or a refreshed list
 * never replays anything. Depth is colour and the fade — no shadow.
 */
export function ProjectCard({ summary, onPress, onLongPress, onMore }: Props) {
  const edited = summary.updatedAt ? editedLabel(summary.updatedAt) : "";
  const status = summary.postedTo.length ? `Posted · ${summary.postedTo.map((id) => PLATFORM_LABELS[id]).join(", ")}` : edited;
  return (
    <View testID="project-card-cell" style={{ width: "50%", padding: theme.space.sm }}>
      <PressableScale accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={LONG_PRESS_MS}
        style={{ aspectRatio: 3 / 4, borderRadius: theme.radius.cover, overflow: "hidden", backgroundColor: theme.screen.tile,
          borderWidth: summary.broken ? 2 : 0, borderColor: summary.broken ? theme.colors.danger : "transparent" }}>
        {summary.broken ? (
          <View testID="project-damaged" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.xs }}>
            <Icon plain name="warning-outline" size={theme.size.icon.xl} color={theme.colors.danger} />
            <Body weight="semi" style={{ color: theme.screen.dangerText }}>Damaged</Body>
          </View>
        ) : summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Body muted>No preview</Body></View>}
        {summary.broken ? null : (
          <View testID="project-length" style={{ position: "absolute", top: theme.space.sm, right: theme.space.sm, height: theme.size.badge, justifyContent: "center", paddingHorizontal: theme.space.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong }}>
            <Body weight="semi" style={{ fontSize: theme.type.small, fontVariant: ["tabular-nums"] }}>{formatDuration(summary.durationSec)}</Body>
          </View>
        )}
        {summary.coverTitle && !summary.broken ? (
          <LinearGradient testID="project-card-fade" colors={["transparent", theme.colors.scrimStrong]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.space.md, paddingTop: theme.space.xxl }}>
            {/* The cover's own font, as typed. Content, not interface text. */}
            <Text testID="project-cover-title" numberOfLines={2} style={{ fontFamily: COVER_FONT, fontSize: theme.type.headline, color: theme.colors.text }}>{summary.coverTitle}</Text>
          </LinearGradient>
        ) : null}
      </PressableScale>
      <View testID="project-card-caption" style={{ minHeight: CAPTION_MIN, flexDirection: "row", alignItems: "flex-start" }}>
        <Pressable testID="project-card-words" accessible={false} onPress={onPress} onLongPress={onLongPress} delayLongPress={LONG_PRESS_MS}
          style={{ flex: 1, minWidth: 0, paddingTop: theme.space.sm, paddingLeft: theme.space.xs }}>
          <Body weight="semi" numberOfLines={1} style={{ lineHeight: WORDS.name, color: summary.broken ? theme.screen.dangerText : theme.colors.text }}>{summary.name}</Body>
          <Body muted numberOfLines={2} style={{ fontSize: theme.type.label, lineHeight: WORDS.status }}>{status}</Body>
        </Pressable>
        {/* 44 pt to touch; the circle is drawn at its trailing edge, in line with the picture's. */}
        <PressableScale accessibilityRole="button" accessibilityLabel={`More for ${summary.name}`} onPress={onMore}
          style={{ width: theme.size.touch, height: theme.size.touch, alignItems: "flex-end", justifyContent: "center" }}>
          <View testID="project-more-circle" style={{ width: theme.size.more, height: theme.size.more, borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar, alignItems: "center", justifyContent: "center" }}>
            <Icon plain name="ellipsis-horizontal-outline" size={theme.size.icon.md} color={theme.colors.text} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
