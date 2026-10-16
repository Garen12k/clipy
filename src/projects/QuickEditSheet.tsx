import { useState } from "react";
import { ScrollView, View } from "react-native";
import { BUNDLED_TRACKS } from "@/src/editor/music";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { QUICK_RECIPE_IDS, QUICK_RECIPES, type QuickRecipeId } from "./quickEdit";
import { StyleTile } from "./StyleTile";
import { styleMusic, type UserStyle } from "./userStyles";

const PER_ROW = 3;
const ROWS = Array.from({ length: Math.ceil(QUICK_RECIPE_IDS.length / PER_ROW) }, (_, i) => QUICK_RECIPE_IDS.slice(i * PER_ROW, (i + 1) * PER_ROW));
const songOf = (id: QuickRecipeId): string => BUNDLED_TRACKS.find((t) => t.id === QUICK_RECIPES[id].trackId)?.title ?? "";

/** What was picked: a built-in style, or one of the owner's by its id. */
export type QuickPick = QuickRecipeId | { mine: string };

type Props = {
  visible: boolean;
  /** Closed without choosing: nothing is picked or created. */ onClose: () => void;
  /** The style to make a draft in; the caller closes the sheet and opens the library. */ onChoose: (pick: QuickPick) => void;
  /** The owner's styles (none = the sheet as it always was). */ mine?: readonly UserStyle[];
  /** Touch and hold on one of the owner's styles: Rename / Delete. */ onStyleMenu?: (s: UserStyle) => void;
};

const mineKey = (id: string) => `mine:${id}`;
/** The note's music line for a style of the owner's: its song, or none. */
const musicOf = (s: UserStyle): string => {
  const m = styleMusic(s);   // a bundled song no longer shipped is none: never "Music: ."
  if (m === null) return "No music.";
  const title = m.kind === "own" ? m.title : BUNDLED_TRACKS.find((t) => t.id === m.trackId)?.title ?? "";
  return `Music: ${title}.`;
};

/**
 * Quick edit, step one: pick a style. Travel is preselected every time the sheet opens. Nothing exists until media is picked. With
 * styles of the owner's, a row "Your styles" stands above the six (then headed "Styles"); without, the sheet is exactly as it was.
 */
export function QuickEditSheet({ visible, onClose, onChoose, mine = [], onStyleMenu }: Props) {
  const [key, setKey] = useState<string>(QUICK_RECIPE_IDS[0]);
  // Reset as the sheet opens, during that very render (React re-renders before anything is drawn): an effect would show the style
  // picked last time for one frame. Not reset on closing, so the selection does not jump while the sheet fades out.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setKey(QUICK_RECIPE_IDS[0]);
  }
  // A style of the owner's that is gone (deleted from its menu) leaves Travel picked.
  const own = mine.find((s) => mineKey(s.id) === key) ?? null;
  const recipe: QuickRecipeId = (QUICK_RECIPE_IDS as readonly string[]).includes(key) ? (key as QuickRecipeId) : QUICK_RECIPE_IDS[0];
  const music = own ? musicOf(own) : `Music: ${songOf(recipe)}.`;
  return (
    <Sheet visible={visible} onClose={onClose} title="Quick edit">
      {mine.length > 0 ? (
        <View style={{ gap: theme.space.xs }}>
          <Body accessibilityRole="header" muted style={{ fontSize: theme.type.small }}>Your styles</Body>
          <ScrollView testID="my-styles" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
            {mine.map((s) => <StyleTile key={s.id} name={s.name} selected={own?.id === s.id} onPress={() => setKey(mineKey(s.id))} onLongPress={() => onStyleMenu?.(s)} />)}
          </ScrollView>
          <Body accessibilityRole="header" muted style={{ fontSize: theme.type.small }}>Styles</Body>
        </View>
      ) : null}
      <View testID="quick-styles" style={{ gap: theme.space.sm }}>
        {ROWS.map((row) => (
          <View key={row[0]} style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {row.map((r) => <Tile key={r} label={QUICK_RECIPES[r].label} icon={QUICK_RECIPES[r].icon} selected={!own && r === recipe} onPress={() => setKey(r)} />)}
          </View>
        ))}
      </View>
      <Body muted style={{ fontSize: theme.type.small, textAlign: "center" }}>{`${music} Pick a style, then your photos and videos. You get a finished draft that you can change afterwards.`}</Body>
      <PrimaryButton title="Choose Photos and Videos" onPress={() => onChoose(own ? { mine: own.id } : recipe)} />
    </Sheet>
  );
}
