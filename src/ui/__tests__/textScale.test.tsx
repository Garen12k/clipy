import { render, screen } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";
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
  expect(StyleSheet.flatten(screen.getByText("a label").props.style) ?? {}).not.toHaveProperty("flexShrink");
  expect(screen.getByText("two lines").props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: S });
  expect(screen.getByText("two lines").props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText("two lines").props.minimumFontScale).toBeUndefined();
  expect(screen.getByText("a label").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("a label").props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText("a label").props).not.toHaveProperty("fit");
  expect(screen.getByText("a label").props).not.toHaveProperty("scale");
  expect(screen.getByText("a tool").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
});

// Jest has no layout: these tests see the PROPS a text is given, never a drawn size. On the phone shrink-to-fit has NO floor of ours —
// iOS (the new architecture) does not read `minimumFontScale` and stops at 4 pt — which is why only `fit` asks for it.
test("above the default only a `fit` label may shrink to its lines; a line-limited text without it keeps its dots", async () => {
  await render(<><KitText numberOfLines={2}>two lines</KitText><KitText numberOfLines={1}>a name the user typed</KitText><KitText fit>a label</KitText><KitText fit={2}>two at most</KitText>
    <KitText fit numberOfLines={2}>its own two</KitText><KitText fit={false}>not this one</KitText><KitText>free</KitText>
    {editor(<KitText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>a tool</KitText>)}</>);
  for (const size of [XL, XXXL, AX5]) {
    await textSize(size);
    for (const kept of ["two lines", "a name the user typed"]) {
      expect(screen.getByText(kept).props.adjustsFontSizeToFit).toBeUndefined();                      // it ends in dots, as it always did
      expect(screen.getByText(kept).props.minimumFontScale).toBeUndefined();
      expect(screen.getByText(kept).props.maxFontSizeMultiplier).toBe(S);
    }
    expect(screen.getByText("two lines").props.numberOfLines).toBe(2);
    expect(screen.getByText("a name the user typed").props.numberOfLines).toBe(1);
    expect(screen.getByText("a label").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: S });
    expect(screen.getByText("a label").props.minimumFontScale).toBeUndefined();                       // nothing is promised that iOS does not keep
    expect(StyleSheet.flatten(screen.getByText("a label").props.style)).toMatchObject({ flexShrink: 1 }); // so a row can offer it less than it asks for
    expect(screen.getByText("two at most").props.numberOfLines).toBe(2);
    expect(screen.getByText("its own two").props).toMatchObject({ numberOfLines: 2, adjustsFontSizeToFit: true });
    expect(screen.getByText("not this one").props.adjustsFontSizeToFit).toBeUndefined();
    expect(screen.getByText("not this one").props.numberOfLines).toBeUndefined();
    expect(screen.getByText("a tool").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85, maxFontSizeMultiplier: E });   // as written, at every size
    expect(screen.getByText("free").props.numberOfLines).toBeUndefined();                             // a text with no limit wraps and grows
    expect(screen.getByText("free").props.adjustsFontSizeToFit).toBeUndefined();
  }
  await textSize(0.823);
  expect(screen.getByText("a label").props.numberOfLines).toBeUndefined();                            // smaller than the default: as written
  expect(screen.getByText("a label").props.adjustsFontSizeToFit).toBeUndefined();
  expect(StyleSheet.flatten(screen.getByText("a label").props.style) ?? {}).not.toHaveProperty("flexShrink");
});

test("fitProps: nothing at or below the default and nothing without `fit`; above it the lines and shrink-to-fit, and no floor", () => {
  expect(fitProps(1, 1, true)).toBeNull();
  expect(fitProps(0.9, undefined, true)).toBeNull();
  expect(fitProps(1.2, 3)).toBeNull();                                                                // a line limit alone is not a wish to shrink
  expect(fitProps(1.2, 3, false)).toBeNull();
  expect(fitProps(1.25, undefined, true)).toEqual({ numberOfLines: 1, adjustsFontSizeToFit: true });
  expect(fitProps(1.25, undefined, 2)).toEqual({ numberOfLines: 2, adjustsFontSizeToFit: true });
  expect(fitProps(1.25, 2, true)).toEqual({ numberOfLines: 2, adjustsFontSizeToFit: true });          // the caller's own limit wins
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

test("buttons, chips, segments and a bar's title are one line that fits back; a tile and a tool are as written; a chip can opt out", async () => {
  await textSize(AX5);
  await render(<><PrimaryButton title="Export" onPress={nothing} /><SecondaryButton title="Quick Edit" onPress={nothing} /><QuietButton title="Skip" onPress={nothing} />
    <Chip label="Curve" selected={false} onPress={nothing} /><Chip fit={false} label="Samantha (Enhanced)" selected={false} onPress={nothing} />
    <Segmented options={[{ value: "a", label: "1080p" }, { value: "b", label: "4K" }]} value="a" onChange={nothing} /><ScreenBar title="Accounts" leading="back" onLeading={nothing} />
    <Tile label="Rounded" selected={false} onPress={nothing} icon="color-wand-outline" />
    {editor(<ToolButton variant="bar" label="Speed" icon="speedometer-outline" onPress={nothing} />)}</>);
  for (const label of ["Export", "Quick Edit", "Skip", "Curve", "1080p", "4K", "Accounts"]) {
    expect(screen.getByText(label).props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    expect(screen.getByText(label).props.minimumFontScale).toBeUndefined();
  }
  expect(screen.getByText("Samantha (Enhanced)").props.adjustsFontSizeToFit).toBeUndefined();          // a name the phone gives, not ours: never shrunk
  expect(screen.getByText("Rounded").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
  expect(screen.getByText("Speed").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
});

test("the shrinkable gold button: only where it is asked to share a row", async () => {
  await render(<><PrimaryButton title="Export" onPress={nothing} /><PrimaryButton shrink title="New Project" onPress={nothing} /></>);
  expect(StyleSheet.flatten(screen.getByRole("button", { name: "Export" }).props.style)).not.toHaveProperty("flexShrink");
  expect(StyleSheet.flatten(screen.getByRole("button", { name: "New Project" }).props.style)).toMatchObject({ flexShrink: 1 });
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
