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

// ───────────────────────────── Light: the phone's light setting (src/ui/testing/appearance.ts) ─────────────────────────────
import { AspectRatioSheet } from "@/src/projects/AspectRatioSheet";
import { PALETTES } from "@/src/theme/theme";
import { hasSurface, leftovers, wear } from "@/src/ui/testing/appearance";

describe("in light", () => {
  afterEach(() => wear("dark"));
  const PICKED = [{ uri: "file:///a.jpg", kind: "photo" as const, durationSec: 0, width: 3024, height: 4032 }];
  const sheets = {
    "project actions": () => <ProjectActionsSheet project={project} onClose={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()} onDelete={jest.fn()} />,
    "Post options": () => <PostOptionsSheet platform="youtube" options={{ title: "Beach day", privacy: "public" }} onChange={jest.fn()} onClose={jest.fn()} />,
    "Aspect ratio": () => <AspectRatioSheet assets={PICKED} onCancel={jest.fn()} onCreate={jest.fn()} />,
  };

  test.each(Object.keys(sheets) as (keyof typeof sheets)[])("the %s sheet: a navy card in dark (the audit sees it), a cream card in light — over the same black scrim in both", async (name) => {
    const dark = await render(sheets[name]());
    expect(leftovers().length).toBeGreaterThan(3);
    expect(hasSurface(PALETTES.dark.scrim)).toBe(true);
    await dark.unmount();
    wear("light");
    await render(sheets[name]());
    expect(leftovers()).toEqual([]);
    expect(hasSurface("#FFFBF1")).toBe(true);
    expect(hasSurface(PALETTES.light.scrim)).toBe(true);
    expect(PALETTES.light.scrim).toBe(PALETTES.dark.scrim);
  });

  test("Aspect ratio in light: the picked shape wears the deep-gold ring, outline and label on the deeper cream; the others are navy on a tile", async () => {
    wear("light");
    await render(sheets["Aspect ratio"]());
    const picked = screen.getAllByRole("button").filter((b) => b.props.accessibilityState?.selected === true);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toHaveStyle({ backgroundColor: "#DDD0B4", borderWidth: 2, borderColor: "#7A5200" });
    const other = screen.getAllByRole("button").find((b) => b.props.accessibilityState?.selected === false)!;
    expect(other).toHaveStyle({ backgroundColor: "#EBE2CC", borderColor: "transparent" });
  });
});
