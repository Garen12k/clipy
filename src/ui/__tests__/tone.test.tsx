import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";
import { Card } from "../Card";
import { Chip } from "../Chip";
import { Field } from "../Field";
import { NumField } from "../NumField";
import { ProgressRing } from "../ProgressRing";
import { QuietButton } from "../QuietButton";
import { Screen } from "../Screen";
import { SecondaryButton } from "../SecondaryButton";
import { Body } from "../Text";
import { Tile } from "../Tile";
import { useSurfaces, useTone } from "../tone";

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } };
const NAVY = theme.surfaces.screen, NEUTRAL = theme.surfaces.editor;

/** One of everything the kit draws on both sides. */
function Kit() {
  return (<>
    <Card testID="card"><Body muted>muted</Body></Card>
    <SecondaryButton title="Second" onPress={() => {}} />
    <SecondaryButton danger title="Remove" onPress={() => {}} />
    <QuietButton danger title="Delete" onPress={() => {}} />
    <Field accessibilityLabel="Name" placeholder="Name" />
    <NumField label="X" value={1} onCommit={() => {}} />
    <Chip label="On" selected onPress={() => {}} /><Chip label="Off" selected={false} onPress={() => {}} />
    <Tile label="Picked" selected boxTestID="tile-on" onPress={() => {}} /><Tile label="Other" selected={false} boxTestID="tile-off" onPress={() => {}} />
  </>);
}
const page = () => screen.getByTestId("probe").parent!;
const btn = (name: string) => screen.getByRole("button", { name });
function expectFamily(s: typeof NAVY) {
  expect(page()).toHaveStyle({ flex: 1, backgroundColor: s.page });
  expect(screen.getByTestId("card")).toHaveStyle({ backgroundColor: s.bar, borderColor: s.separator });
  expect(screen.getByText("muted")).toHaveStyle({ color: s.muted });
  expect(btn("Second")).toHaveStyle({ backgroundColor: s.lifted });
  expect(screen.getByText("Second")).toHaveStyle({ color: theme.colors.text });        // the label colour is shared
  expect(screen.getByText("Remove")).toHaveStyle({ color: s.dangerText });
  expect(screen.getByText("Delete")).toHaveStyle({ color: s.dangerText });
  expect(screen.getByLabelText("Name")).toHaveStyle({ backgroundColor: s.tile });
  expect(screen.getByLabelText("Name")).toHaveProp("placeholderTextColor", s.muted);
  expect(screen.getByLabelText("X")).toHaveStyle({ backgroundColor: s.tile });
  expect(btn("On")).toHaveStyle({ backgroundColor: s.lifted, ...theme.ring });
  expect(btn("Off")).toHaveStyle({ backgroundColor: s.tile });
  expect(screen.getByTestId("tile-on")).toHaveStyle({ backgroundColor: s.lifted });
  expect(screen.getByTestId("tile-off")).toHaveStyle({ backgroundColor: s.tile });
}

test("a screen is navy: the page and everything of the kit on it take the screen family — with no word from the screen", async () => {
  await render(<SafeAreaProvider initialMetrics={metrics}><Screen><Text testID="probe" /><Kit /></Screen></SafeAreaProvider>);
  expectFamily(NAVY);
  expect(NAVY.page).toBe("#0A1B33");
});

test("the editor says \"editor\" once, on its Screen, and the SAME kit parts are the hue-free neutrals", async () => {
  await render(<SafeAreaProvider initialMetrics={metrics}><Screen tone="editor"><Text testID="probe" /><Kit /></Screen></SafeAreaProvider>);
  expectFamily(NEUTRAL);
  expect(NEUTRAL.page).toBe("#000000");
  expect(NEUTRAL).toMatchObject(theme.elevation);
});

test("with no Screen above it a part is on a screen (the Export sheet's toast host is one); the gold and the label colour are the same in both", async () => {
  const seen: string[] = [];
  const Probe = () => { seen.push(useTone()); expect(useSurfaces()).toBe(theme.surfaces[useTone()]); return null; };
  await render(<><Probe /><SecondaryButton title="Bare" onPress={() => {}} /><ProgressRing progress={0.5} /></>);
  expect(seen[0]).toBe("screen");
  expect(btn("Bare")).toHaveStyle({ backgroundColor: NAVY.lifted });
});

test("the tone is a constant for the life of a screen: re-rendering the Screen hands the kit the very same surfaces object, and its page view stays the same view", async () => {
  const got: unknown[] = [];
  const Probe = () => { got.push(useSurfaces()); return <Text testID="probe" />; };
  const ui = (pad: number) => <SafeAreaProvider initialMetrics={metrics}><Screen tone="editor" style={{ paddingLeft: pad }}><Probe /></Screen></SafeAreaProvider>;
  const view = await render(ui(0));
  const first = page();
  await view.rerender(ui(4));
  expect(new Set(got).size).toBe(1);
  expect(got[0]).toBe(NEUTRAL);
  expect(page()).toBe(first);                 // not remounted: the provider adds no view and no key
});
