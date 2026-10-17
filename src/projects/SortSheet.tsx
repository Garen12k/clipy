import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Icon } from "@/src/ui/Icon";
import { PressableScale } from "@/src/ui/PressableScale";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { largeContent } from "@/src/ui/textScale";
import { useSurfaces } from "@/src/ui/tone";
import { HOME_SORTS, type HomeSort } from "./homeOrder";
import { FIND_WORDS } from "./homeFindWords";

/** "Sort by": the four orders as rows, the picked one ticked (the mark — never colour alone). A tap on any row picks it; the caller closes. */
export function SortSheet({ visible, sort, onPick, onClose }: { visible: boolean; sort: HomeSort; onPick: (s: HomeSort) => void; onClose: () => void }) {
  const s = useSurfaces();
  return (
    <Sheet visible={visible} onClose={onClose} title={FIND_WORDS.sortTitle}>
      <View testID="sort-options">
        {HOME_SORTS.map((k, i) => {
          const picked = k === sort;
          const label = FIND_WORDS.sorts[k];
          return (
            <PressableScale key={k} testID={`sort-${k}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: picked }} {...largeContent(label)} onPress={() => onPick(k)}
              style={{ minHeight: theme.size.row, flexDirection: "row", alignItems: "center", gap: theme.space.md, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: s.separator }}>
              <Body style={{ flex: 1 }}>{label}</Body>
              {picked ? <Icon testID="sort-check" name="checkmark-outline" size={theme.size.icon.md} color={s.accentInk} /> : null}
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}
