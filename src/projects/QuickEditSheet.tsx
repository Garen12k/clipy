import { useState } from "react";
import { View } from "react-native";
import { BUNDLED_TRACKS } from "@/src/editor/music";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { QUICK_RECIPE_IDS, QUICK_RECIPES, type QuickRecipeId } from "./quickEdit";

const PER_ROW = 3;
const ROWS = Array.from({ length: Math.ceil(QUICK_RECIPE_IDS.length / PER_ROW) }, (_, i) => QUICK_RECIPE_IDS.slice(i * PER_ROW, (i + 1) * PER_ROW));
const songOf = (id: QuickRecipeId): string => BUNDLED_TRACKS.find((t) => t.id === QUICK_RECIPES[id].trackId)?.title ?? "";

type Props = {
  visible: boolean;
  /** Closed without choosing: nothing is picked or created. */ onClose: () => void;
  /** The style to make a draft in; the caller closes the sheet and opens the library. */ onChoose: (id: QuickRecipeId) => void;
};

/** Quick edit, step one: pick a style. Travel is preselected every time the sheet opens. Nothing exists until media is picked. */
export function QuickEditSheet({ visible, onClose, onChoose }: Props) {
  const [id, setId] = useState<QuickRecipeId>(QUICK_RECIPE_IDS[0]);
  // Reset as the sheet opens, during that very render (React re-renders before anything is drawn): an effect would show the style
  // picked last time for one frame. Not reset on closing, so the selection does not jump while the sheet fades out.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setId(QUICK_RECIPE_IDS[0]);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Quick edit">
      <View testID="quick-styles" style={{ gap: theme.space.sm }}>
        {ROWS.map((row) => (
          <View key={row[0]} style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {row.map((r) => <Tile key={r} label={QUICK_RECIPES[r].label} icon={QUICK_RECIPES[r].icon} selected={r === id} onPress={() => setId(r)} />)}
          </View>
        ))}
      </View>
      <Body muted style={{ fontSize: theme.type.small, textAlign: "center" }}>{`Music: ${songOf(id)}. Pick a style, then your photos and videos. You get a finished draft that you can change afterwards.`}</Body>
      <PrimaryButton title="Choose Photos and Videos" onPress={() => onChoose(id)} />
    </Sheet>
  );
}
