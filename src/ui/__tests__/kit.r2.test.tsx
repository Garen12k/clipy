import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { Card, cardStyle } from "../Card";
import { EmptyState } from "../EmptyState";
import { Field, fieldStyle } from "../Field";
import { Spinner } from "../Spinner";

test("Field: the one text-field look; the caller's style is added and its props pass through", async () => {
  await render(<Field accessibilityLabel="Caption" value="hi" placeholder="Write a caption…" multiline style={{ minHeight: 96 }} />);
  const f = screen.getByLabelText("Caption");
  expect(f).toHaveStyle({ backgroundColor: theme.elevation.tile, color: theme.colors.text, fontSize: theme.type.input,
    borderRadius: theme.radius.field, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md, minHeight: 96 });
  expect(f).toHaveProp("value", "hi");
  expect(f).toHaveProp("placeholder", "Write a caption…");
  expect(f).toHaveProp("placeholderTextColor", theme.colors.textMuted);
  expect(fieldStyle.minHeight).toBe(theme.size.touch);
});

test("Card: a bar-coloured surface with the hairline, the card radius and lg padding; the caller's style is added", async () => {
  await render(<Card testID="c" style={{ gap: theme.space.sm }}><Text>in</Text></Card>);
  expect(cardStyle).toEqual({ backgroundColor: theme.elevation.bar, borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radius.card, padding: theme.space.lg });
  expect(screen.getByTestId("c")).toHaveStyle({ ...cardStyle, gap: theme.space.sm });
  expect(screen.getByText("in")).toBeTruthy();
});

test("Spinner: says what it waits for when told", async () => {
  await render(<><Spinner label="Working on YouTube" /><Spinner /></>);
  expect(screen.getByLabelText("Working on YouTube")).toBeTruthy();
});

test("EmptyState: the title is shown as typed (sentence case), centred, in the title font", async () => {
  await render(<EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos" />);
  expect(screen.getByText("No clips yet")).toHaveStyle({ fontWeight: theme.weight.bold, fontSize: theme.type.title, textAlign: "center" });
  expect(screen.getByText("Pick some videos")).toHaveStyle({ textAlign: "center" });
});
