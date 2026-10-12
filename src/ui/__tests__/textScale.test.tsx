import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Chip } from "../Chip";
import { DoneButton } from "../DoneButton";
import { IconButton } from "../IconButton";
import { PrimaryButton } from "../PrimaryButton";
import { QuietButton } from "../QuietButton";
import { ScreenBar } from "../ScreenBar";
import { SecondaryButton } from "../SecondaryButton";
import { Segmented } from "../Segmented";
import { KitGallery } from "../testing/kitGallery";
import { textSize, texts, unruled } from "../testing/textSize";
import { Body, KitInput, KitText, Title, ValueLabel } from "../Text";
import { fitProps, largeContent, shownScale, textCap } from "../textScale";
import { Tile } from "../Tile";
import { ToneContext } from "../tone";
import { ToolButton } from "../ToolButton";

const E = theme.textScale.editor, S = theme.textScale.screen, R = theme.textScale.reading;
const XL = 1.118, XXXL = 1.353, AX5 = 3.571;
const editor = (ui: React.ReactElement) => <ToneContext.Provider value="editor">{ui}</ToneContext.Provider>;
const nothing = () => {};
const cap = (text: string) => screen.getByText(text).props.maxFontSizeMultiplier;
afterEach(() => textSize(1));

test("the caps: the editor's for anything in the editor, the screen's or the reading one outside it, none for fixed", () => {
  expect(theme.textScale).toEqual({ editor: 1.16, screen: 1.35, reading: 1.65 });
  expect([textCap("screen", "chrome"), textCap("screen", "reading"), textCap("editor", "chrome"), textCap("editor", "reading")]).toEqual([S, R, E, E]);
  expect(textCap("screen", "fixed")).toBe(1);
  expect([shownScale(1, S), shownScale(XL, E), shownScale(AX5, E), shownScale(AX5, S), shownScale(0.823, S)]).toEqual([1, XL, E, S, 0.823]);
});

test("a kit text is capped by the tone it is drawn in; reading grows further on a screen only; fixed never scales", async () => {
  await render(<><KitText>on a screen</KitText><KitText scale="reading">a paragraph</KitText><KitText scale="fixed">a mark</KitText>
    {editor(<><KitText>in the editor</KitText><KitText scale="reading">editor paragraph</KitText></>)}</>);
  expect(cap("on a screen")).toBe(S);
  expect(cap("a paragraph")).toBe(R);
  expect(cap("in the editor")).toBe(E);
  expect(cap("editor paragraph")).toBe(E);
  expect(screen.getByText("a mark").props.allowFontScaling).toBe(false);
  expect(screen.getByText("a mark").props.maxFontSizeMultiplier).toBeUndefined();
  expect(unruled()).toEqual([]);
});

test("at the default size a text gets its cap and nothing else — line limits and shrink-to-fit pass through as written", async () => {
  await render(<><KitText numberOfLines={2}>two lines</KitText><KitText fit>a label</KitText><KitText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>a tool</KitText></>);
  expect(screen.getByText("two lines").props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: S });
  expect(screen.getByText("two lines").props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText("two lines").props.minimumFontScale).toBeUndefined();
  expect(screen.getByText("a label").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("a label").props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText("a label").props).not.toHaveProperty("fit");
  expect(screen.getByText("a label").props).not.toHaveProperty("scale");
  expect(screen.getByText("a tool").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
});

test("above the default a line-limited text fits back: it may shrink, at most to the size it has at the default", async () => {
  await render(<><KitText numberOfLines={2}>two lines</KitText><KitText fit>a label</KitText><KitText fit={2}>two at most</KitText><KitText>free</KitText>
    {editor(<KitText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>a tool</KitText>)}</>);
  await textSize(XL);
  expect(screen.getByText("two lines").props).toMatchObject({ numberOfLines: 2, adjustsFontSizeToFit: true });
  expect(screen.getByText("two lines").props.minimumFontScale).toBeCloseTo(1 / XL, 6);
  await textSize(AX5);
  expect(screen.getByText("two lines").props.minimumFontScale).toBeCloseTo(1 / S, 6);                 // the phone asks for 3.571; the text is shown at 1.35
  expect(screen.getByText("a label").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
  expect(screen.getByText("a label").props.minimumFontScale).toBeCloseTo(1 / S, 6);
  expect(screen.getByText("two at most").props.numberOfLines).toBe(2);
  expect(screen.getByText("a tool").props.minimumFontScale).toBeCloseTo(0.85 / E, 6);                 // the same 10.2 pt floor as today
  expect(screen.getByText("free").props.numberOfLines).toBeUndefined();                               // a text with no limit wraps and grows
  expect(screen.getByText("free").props.adjustsFontSizeToFit).toBeUndefined();
  await textSize(0.823);
  expect(screen.getByText("two lines").props.adjustsFontSizeToFit).toBeUndefined();                   // smaller than the default: as written
  expect(screen.getByText("a label").props.numberOfLines).toBeUndefined();
});

test("fitProps: nothing at or below the default; the floor is the text's own, divided by the scale shown", () => {
  expect(fitProps(1, { numberOfLines: 1 })).toBeNull();
  expect(fitProps(0.9, {}, true)).toBeNull();
  expect(fitProps(1.2, {})).toBeNull();                                                               // no limit, no fit: nothing to fit into
  expect(fitProps(1.25, { numberOfLines: 3 })).toEqual({ numberOfLines: 3, adjustsFontSizeToFit: true, minimumFontScale: 0.8 });
  expect(fitProps(1.25, { minimumFontScale: 0.5 }, true)).toEqual({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.4 });
  expect(fitProps(1.25, { numberOfLines: 2 }, true)).toMatchObject({ numberOfLines: 2 });             // the caller's own limit wins
});

test("Body, Title and ValueLabel are that text: they take the role and hand it to their span", async () => {
  await render(<><Body>body</Body><Title>title</Title><Body scale="reading">read me</Body><ValueLabel label="Opacity" value="40 %" /><ValueLabel scale="fixed" label="Fixed" value="1" /></>);
  expect(cap("body")).toBe(S);
  expect(cap("title")).toBe(S);
  expect(cap("read me")).toBe(R);
  expect(screen.getByText("40 %").props.maxFontSizeMultiplier).toBe(S);
  expect(screen.getByText("1").props.allowFontScaling).toBe(false);
  expect(unruled()).toEqual([]);
});

test("a text field is capped by tone too", async () => {
  await render(<><KitInput accessibilityLabel="Caption" value="hi" />{editor(<KitInput accessibilityLabel="Length" value="2" />)}</>);
  expect(screen.getByLabelText("Caption").props.maxFontSizeMultiplier).toBe(S);
  expect(screen.getByLabelText("Length").props.maxFontSizeMultiplier).toBe(E);
});

test("every text the kit draws has a rule, in both families, at any size — and the marks are fixed", async () => {
  await textSize(AX5);
  await render(<><KitGallery />{editor(<KitGallery />)}</>);
  expect(unruled()).toEqual([]);
  const caps = new Set(texts().map((t) => t.props.maxFontSizeMultiplier).filter((c) => c !== undefined));
  expect([...caps].sort()).toEqual([E, S]);
  for (const mark of ["🏝️", "40%"]) for (const t of texts().filter((x) => x.text === mark)) expect(t.props.allowFontScaling).toBe(false);
});

test("buttons and chips are one line that fits back; a tile and a tool keep their 0.85 floor in points", async () => {
  await textSize(AX5);
  await render(<><PrimaryButton title="Export" onPress={nothing} /><SecondaryButton title="Quick Edit" onPress={nothing} /><QuietButton title="Skip" onPress={nothing} />
    <Chip label="Curve" selected={false} onPress={nothing} /><Tile label="Rounded" selected={false} onPress={nothing} icon="color-wand-outline" />
    {editor(<ToolButton variant="bar" label="Speed" icon="speedometer-outline" onPress={nothing} />)}</>);
  for (const label of ["Export", "Quick Edit", "Skip", "Curve"]) {
    expect(screen.getByText(label).props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    expect(screen.getByText(label).props.minimumFontScale).toBeCloseTo(1 / S, 6);
  }
  expect(screen.getByText("Rounded").props.minimumFontScale).toBeCloseTo(0.85 / S, 6);
  expect(screen.getByText("Speed").props.minimumFontScale).toBeCloseTo(0.85 / E, 6);
});

test("capped controls offer the large-content viewer with their name", async () => {
  expect(largeContent("Speed")).toEqual({ accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: "Speed" });
  await render(<View>
    <ToolButton label="Filter" icon="color-filter-outline" onPress={nothing} />
    <ToolButton variant="bar" label="Speed" icon="speedometer-outline" onPress={nothing} />
    <ToolButton variant="group" label="Basics" icon="albums-outline" onPress={nothing} />
    <Tile label="Rounded" selected={false} onPress={nothing} icon="color-wand-outline" />
    <Chip label="Curve" selected={false} onPress={nothing} />
    <PrimaryButton title="Export" onPress={nothing} /><SecondaryButton title="Quick Edit" onPress={nothing} /><QuietButton title="Skip" onPress={nothing} />
    <Segmented options={[{ value: "a", label: "1080p" }, { value: "b", label: "4K" }]} value="a" onChange={nothing} />
    <IconButton name="close-outline" accessibilityLabel="Close" onPress={nothing} />
    <DoneButton onPress={nothing} />
    <ScreenBar title="Accounts" leading="back" onLeading={nothing} />
  </View>);
  for (const name of ["Filter", "Speed", "Basics", "Rounded", "Curve", "Export", "Quick Edit", "Skip", "1080p", "4K", "Close", "Done", "Back"]) {
    expect(screen.getByRole("button", { name }).props).toMatchObject({ accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: name });
  }
});
