import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { Group } from "../Group";
import { ToneContext } from "../tone";

test("a small muted label, read as a header, above one rounded card with a quiet line between its rows", async () => {
  await render(<Group label="Platforms" testID="g"><Text>one</Text><Text>two</Text><Text>three</Text></Group>);
  expect(screen.getByRole("header", { name: "Platforms" })).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.muted });
  expect(screen.getByTestId("g")).toHaveStyle({ backgroundColor: theme.screen.bar, borderColor: theme.screen.separator, borderRadius: theme.radius.card, paddingVertical: theme.space.xs });
  expect(screen.getByText("one").parent).not.toHaveStyle({ borderTopWidth: 1 });
  for (const t of ["two", "three"]) expect(screen.getByText(t).parent).toHaveStyle({ borderTopWidth: 1, borderTopColor: theme.screen.separator });
});

test("without a label there is only the card; a missing row draws no line", async () => {
  await render(<Group testID="g">{null}<Text>only</Text>{false}</Group>);
  expect(screen.queryByRole("header")).toBeNull();
  expect(screen.getByText("only").parent).not.toHaveStyle({ borderTopWidth: 1 });
});

test("in the editor's tone it wears the slate", async () => {
  await render(<ToneContext.Provider value="editor"><Group label="A" testID="g"><Text>one</Text><Text>two</Text></Group></ToneContext.Provider>);
  expect(screen.getByTestId("g")).toHaveStyle({ backgroundColor: theme.surfaces.editor.bar });
  expect(screen.getByText("two").parent).toHaveStyle({ borderTopColor: theme.surfaces.editor.separator });
});
