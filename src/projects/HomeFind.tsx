import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Field } from "@/src/ui/Field";
import { Icon } from "@/src/ui/Icon";
import { IconButton } from "@/src/ui/IconButton";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";
import { FIND_WORDS } from "./homeFindWords";

/** Room for the magnifier at the field's leading edge: the field's own padding, the icon, a gap. */
const SEARCH_INSET = theme.space.md + theme.size.icon.md + theme.space.sm;

/**
 * The top of Home's list (its ListHeaderComponent — so it scrolls with the cards and sits inside the inert wrapper): the search
 * field and the sort button. On the 16-pt gutter like the cards (8 here + the list's 8). The typed text is user input: no `fit`.
 */
export function HomeFind({ query, onQuery, onSort }: { query: string; onQuery: (q: string) => void; onSort: () => void }) {
  const s = useSurfaces();
  return (
    <View testID="home-find" style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.sm, paddingBottom: theme.space.sm }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Field testID="home-search" value={query} onChangeText={onQuery} placeholder={FIND_WORDS.search} accessibilityLabel={FIND_WORDS.search}
          returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" style={{ paddingLeft: SEARCH_INSET }} />
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: theme.space.md }}>
          <Icon name="search-outline" size={theme.size.icon.md} color={s.muted} />
        </View>
      </View>
      <IconButton name="swap-vertical-outline" accessibilityLabel={FIND_WORDS.sortButton} onPress={onSort} />
    </View>
  );
}

/** "Pinned" or the sort's name over a part of the list: the kit Group's label look, a header for VoiceOver. */
export function HomeHeading({ title }: { title: string }) {
  return (
    <Body muted accessibilityRole="header" style={{ fontSize: theme.type.label, paddingHorizontal: theme.space.sm, paddingTop: theme.space.md, paddingBottom: theme.space.xs }}>{title}</Body>
  );
}

/** A query is typed and nothing matches: one plain line and the way back. */
export function HomeNoMatch({ onClear }: { onClear: () => void }) {
  return (
    <View testID="home-no-match" style={{ alignItems: "center", gap: theme.space.sm, paddingTop: theme.space.xl }}>
      <Body muted>{FIND_WORDS.noMatch}</Body>
      <QuietButton title={FIND_WORDS.clear} onPress={onClear} />
    </View>
  );
}
