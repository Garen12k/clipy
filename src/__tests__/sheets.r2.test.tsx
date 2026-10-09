import { render, screen, within } from "@testing-library/react-native";
import { ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { PostOptionsSheet } from "@/src/publish/components/PostOptionsSheet";
import { theme } from "@/src/theme/theme";

const project = { id: "a", name: "Beach", durationSec: 65, updatedAt: "", thumbUri: null, broken: false, postedTo: [], coverTitle: "" };

test("project actions: Rename and Duplicate are the grey secondary buttons, Delete is text only and red; no gold button", async () => {
  await render(<ProjectActionsSheet project={project} onClose={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()} onDelete={jest.fn()} />);
  for (const n of ["Rename", "Duplicate"]) expect(screen.getByRole("button", { name: n })).toHaveStyle({ backgroundColor: theme.screen.lifted });
  const del = screen.getByRole("button", { name: "Delete" });
  expect(del).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
  expect(within(del).getByText("Delete")).toHaveStyle({ color: theme.screen.dangerText });
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});

test("post options: the title is the kit field, its counter is small, the chips keep their state", async () => {
  await render(<PostOptionsSheet platform="youtube" options={{ title: "Beach day", privacy: "public" }} onChange={jest.fn()} onClose={jest.fn()} />);
  const title = screen.getByLabelText("YouTube title");
  expect(title).toHaveStyle({ backgroundColor: theme.screen.tile, fontSize: theme.type.input, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md });
  expect(title).toHaveProp("placeholder", "Uses your caption");
  expect(screen.getByText("9 / 100")).toHaveStyle({ fontSize: theme.type.small });
  expect(screen.getByRole("button", { name: "Public" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Private" })).not.toBeSelected();
});
