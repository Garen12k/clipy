import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { PRESETS, presetLine, presetValues } from "@/src/export/presets";
import { TransferCard } from "@/src/projects/TransferCard";
import { theme } from "@/src/theme/theme";
import { shrinks, textSize, unruled } from "@/src/ui/testing/textSize";
import { Tile } from "@/src/ui/Tile";

// Where the next build's three features meet: the text-size rules on what export presets and project files draw.
const XXXL = 1.353, AX5 = 3.571;
const LONG = "My very long holiday project name that never ends";
afterEach(() => textSize(1));

test("the transfer card at a large text size: every text capped as a screen's; the project's name keeps its dots and never shrinks", async () => {
  await textSize(AX5);
  await render(<TransferCard transfer={{ kind: "save", name: LONG, bytes: 2.1e9, done: 1e9 }} onCancel={() => {}} />);
  expect(unruled()).toEqual([]);
  const detail = screen.getByText(`${LONG} · 2.1 GB`);
  expect(detail.props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: theme.textScale.screen });
  expect(detail.props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText("Saving a copy").props.maxFontSizeMultiplier).toBe(theme.textScale.screen);
  // Only the button's own title may shrink: a short fixed label.
  expect(shrinks()).toEqual(['Text "Cancel"']);
});

test("a preset tile at a large text size: capped as a screen's; its small line fits by the kit's opt-in, and at the default nothing is added", async () => {
  const line = presetLine(presetValues("message", true));
  const row = () => <View><Tile fill label={PRESETS.message.label} icon={PRESETS.message.icon} note={line} selected={false} onPress={() => {}} /></View>;
  const view = await render(row());
  expect(screen.getByText(line).props.adjustsFontSizeToFit).toBeUndefined();
  expect(screen.getByText(line).props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: theme.textScale.screen });
  await textSize(XXXL);
  await view.rerender(row());
  expect(unruled()).toEqual([]);
  expect(screen.getByText(line).props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: theme.textScale.screen });
  expect(screen.getByText(line).props.minimumFontScale).toBeUndefined();
});
