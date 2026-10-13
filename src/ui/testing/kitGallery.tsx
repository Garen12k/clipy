import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Chip } from "../Chip";
import { DoneButton } from "../DoneButton";
import { EmptyState } from "../EmptyState";
import { Field } from "../Field";
import { Group } from "../Group";
import { IconButton } from "../IconButton";
import { NumField } from "../NumField";
import { PrimaryButton } from "../PrimaryButton";
import { ProgressRing } from "../ProgressRing";
import { QuietButton } from "../QuietButton";
import { ScreenBar } from "../ScreenBar";
import { SecondaryButton } from "../SecondaryButton";
import { Segmented } from "../Segmented";
import { Body, Title, ValueLabel } from "../Text";
import { Tile } from "../Tile";
import { ToolButton } from "../ToolButton";
import { StripNote, StripSlider, StripTiles, ToolStrip } from "../ToolStrip";

const nothing = () => {};
/** Tests only: one of everything in the kit that draws text. The default-tree PROOF photographs it; the text-size tests walk it. */
export function KitGallery() {
  return (
    <View>
      <Title>Ready to sail</Title>
      <Title size={theme.type.headline} numberOfLines={1}>Export</Title>
      <Body>Plain body</Body>
      <Body muted numberOfLines={2}>A muted note that may take two lines</Body>
      <ValueLabel label="Opacity" value="40 %" />
      <Chip label="Curve" selected={false} onPress={nothing} />
      <Chip label="Normal" selected compact onPress={nothing} />
      <PrimaryButton title="Export" onPress={nothing} />
      <PrimaryButton tone="plain" compact title="Replace" onPress={nothing} />
      <SecondaryButton title="Quick Edit" onPress={nothing} />
      <QuietButton compact title="Reset" onPress={nothing} />
      <Segmented options={[{ value: "a", label: "1080p" }, { value: "b", label: "4K" }]} value="a" onChange={nothing} />
      <Field accessibilityLabel="Caption" value="hi" />
      <NumField label="Start" value={1} onCommit={nothing} />
      <ScreenBar title="Accounts" leading="back" onLeading={nothing} />
      <Group label="Account"><Body>Signed in</Body></Group>
      <Tile label="Rounded" selected={false} onPress={nothing} icon="color-wand-outline" />
      <Tile label="Circle" selected onPress={nothing} icon="color-wand-outline" />
      <ToolButton label="Filter" icon="color-filter-outline" onPress={nothing} />
      <ToolButton variant="bar" label="Speed" icon="speedometer-outline" onPress={nothing} />
      <ToolButton variant="bar" danger label="Delete" icon="trash-outline" onPress={nothing} />
      <ToolButton variant="group" label="Basics" icon="albums-outline" onPress={nothing} />
      <IconButton name="close-outline" accessibilityLabel="Close" onPress={nothing} />
      <DoneButton onPress={nothing} />
      <EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos" />
      <EmptyState icon="boat-outline" title="No clips yet" hint="Pick some videos" pointer="New Project, below" />
      <ProgressRing progress={0.4} size={theme.size.ring} />
      <ToolStrip visible onClose={nothing} title="Volume" action={{ label: "Reset", onPress: nothing }} note={<StripNote lines={2}>Above 100% only applies in the exported video.</StripNote>}>
        <StripTiles lead={<Chip compact label="All" selected onPress={nothing} />}>
          <Tile label="None" selected onPress={nothing} icon="color-wand-outline" />
        </StripTiles>
        <StripSlider label="Volume" value="100%"><View /></StripSlider>
      </ToolStrip>
    </View>
  );
}
