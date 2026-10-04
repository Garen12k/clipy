import { fireEvent, render, screen } from "@testing-library/react-native";
import { FONTS } from "@/src/editor/fonts";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { FONT_IDS } from "@/src/editor/model/types";
import { FontStrip } from "../components/FontStrip";
import { CAPTION_PRESET_TILES, TemplateStrip, TEXT_TEMPLATE_TILES, TILE_WIDTH } from "../components/TemplateStrip";

test("twelve template tiles, each 72 pt wide with its label and an \"Aa\" sample in the template's look", async () => {
  await render(<TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={() => {}} />);
  expect(TILE_WIDTH).toBe(72);
  expect(screen.getAllByText("Aa").length).toBeGreaterThanOrEqual(12);
  for (const id of TEXT_TEMPLATE_IDS) {
    const tile = screen.getByRole("button", { name: TEXT_TEMPLATES[id].label });
    expect(tile).toHaveStyle({ width: 72 });
    expect(screen.getByText(TEXT_TEMPLATES[id].label)).toBeTruthy();
    expect(screen.getByTestId(`overlay-tile-${id}`)).toBeTruthy();
  }
  // Neon: the glow layer of OverlayText; the fill in the template's font and colour.
  expect(screen.getByTestId("overlay-glow-tile-neon", { includeHiddenElements: true })).toHaveStyle({ color: TEXT_TEMPLATES.neon.patch.style.glow!.color });
  expect(screen.getByTestId("overlay-shadow-tile-retro", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByTestId("overlay-glow-tile-subtitleBar", { includeHiddenElements: true })).toBeNull();
});

test("pressing a tile reports its id; no tile is marked selected", async () => {
  const onPick = jest.fn();
  await render(<TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={onPick} />);
  await fireEvent.press(screen.getByRole("button", { name: "Comic" }));
  expect(onPick).toHaveBeenCalledWith("comic");
  expect(screen.getByRole("button", { name: "Comic" }).props.accessibilityState?.selected).toBeUndefined();
});

test("the strip scrolls sideways without scroll handlers", async () => {
  await render(<TemplateStrip tiles={CAPTION_PRESET_TILES} onPick={() => {}} />);
  const scroll = screen.getByTestId("template-strip");
  expect(scroll.props.horizontal).toBe(true);
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
});

test("six caption preset tiles", async () => {
  await render(<TemplateStrip tiles={CAPTION_PRESET_TILES} onPick={() => {}} />);
  for (const id of CAPTION_PRESET_IDS) expect(screen.getByRole("button", { name: CAPTION_PRESETS[id].label })).toBeTruthy();
});

test("the font strip offers sixteen fonts, each drawn in its own family", async () => {
  const onChange = jest.fn();
  await render(<FontStrip value="montserrat" onChange={onChange} />);
  expect(FONT_IDS).toHaveLength(16);
  for (const id of FONT_IDS) {
    expect(screen.getByRole("button", { name: FONTS[id].label })).toBeTruthy();
    expect(screen.getByText(FONTS[id].label)).toHaveStyle({ fontFamily: FONTS[id].family });
  }
  expect(screen.getByRole("button", { name: "Montserrat" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Dancing Script" }));
  expect(onChange).toHaveBeenCalledWith("dancingScript");
});
