import { fireEvent, render, screen } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";

// The phone's Modal keeps drawing while it fades out; Jest's draws nothing once `visible` is false. This Sheet always draws its
// rows, so a test can see what the fade shows.
jest.mock("@/src/ui/Sheet", () => ({ Sheet: ({ children }: { children: unknown }) => children }));
import { ProjectActionsSheet } from "../ProjectActionsSheet";
import type { ProjectSummary } from "../storage";

const project: ProjectSummary = { id: "a", name: "Beach", durationSec: 65, updatedAt: "", createdAt: "", thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const sheet = (over: Partial<Parameters<typeof ProjectActionsSheet>[0]> = {}) => (
  <ProjectActionsSheet project={project} onClose={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()} onSaveCopy={jest.fn()} onSaveStyle={jest.fn()} onDelete={jest.fn()} {...over} />
);
const names = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
const btn = (name: string) => screen.getByRole("button", { name });

test("without onPin the sheet is as it was: no Pin", async () => {
  await render(sheet());
  expect(names()).toEqual(["Rename", "Duplicate", "Save As Style", "Save a Copy", "Delete"]);
});

test("Pin comes first, a grey button, and runs at once after closing (no alert follows it)", async () => {
  const onClose = jest.fn(), onPin = jest.fn();
  await render(sheet({ onClose, onPin, isPinned: () => false }));
  expect(names()).toEqual(["Pin", "Rename", "Duplicate", "Save As Style", "Save a Copy", "Delete"]);
  expect(btn("Pin")).toHaveStyle({ backgroundColor: theme.screen.lifted });
  await fireEvent.press(btn("Pin"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPin).toHaveBeenCalledWith(project);
});

test("a pinned project says Unpin", async () => {
  await render(sheet({ onPin: jest.fn(), isPinned: (id) => id === "a" }));
  expect(names()[0]).toBe("Unpin");
});

test("a damaged project offers no Pin", async () => {
  await render(sheet({ project: { ...project, broken: true }, onPin: jest.fn(), isPinned: () => false }));
  expect(names()).toEqual(["Delete"]);
});

test("the label stays as the sheet opened with while it fades out after Pin (the pin has already flipped)", async () => {
  let pinned = false;
  const onPin = jest.fn(() => { pinned = true; });
  await render(sheet({ onPin, isPinned: () => pinned }));
  await fireEvent.press(btn("Pin"));
  await screen.rerender(sheet({ project: null, onPin, isPinned: () => pinned }));   // fading out: the last project is still drawn
  expect(names()[0]).toBe("Pin");
  await screen.rerender(sheet({ onPin, isPinned: () => pinned }));                  // opened again: the label is read afresh
  expect(names()[0]).toBe("Unpin");
});
