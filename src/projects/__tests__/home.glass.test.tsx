// THE GLASS TRIAL on Home (GLASS.home): the header pill and Quick Edit. The app on a build that has the glass module, on a phone
// that draws Liquid Glass; Reduce Transparency is `phone`. New Project (the gold) and the "making" capsule are never glass.
// (The loader itself — the build's module, the phone's two checks — is systemGlass.ts, tested in src/ui/__tests__/Glass*.test.tsx.)
jest.mock("@/src/ui/systemGlass", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  const GlassView = (p: object) => createElement(View, { ...p, accessibilityHint: "system glass" });
  return { glassView: () => GlassView, isGlassAvailable: () => true };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { GLASS, GLASS_TINT, theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { reduceTransparencyPhone } from "@/src/ui/testing/glassPhone";
import { ShownContext } from "@/src/ui/tone";

const list = storage.listProjects as jest.Mock;
const pick = pickMedia as jest.Mock;
const make = makeQuickEdit as jest.Mock;
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }];
const phone = reduceTransparencyPhone();
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); make.mockReset(); list.mockReset(); list.mockResolvedValue([BEACH]);
  GLASS.home = true; GLASS.editor = true; phone.start(false);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); jest.restoreAllMocks(); });

const home = async (appearance: "dark" | "light" = "dark") => {
  const view = await render(<ShownContext.Provider value={appearance}><ProjectsScreen /></ShownContext.Provider>);
  await screen.findByText("Beach");
  await phone.settle();
  return view;
};
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const quick = () => StyleSheet.flatten(screen.getByRole("button", { name: "Quick Edit" }).props.style);
const glassIds = () => screen.queryAllByHintText("system glass").map((g) => g.props.testID);

// What these surfaces were before glass: the boxes nothing may move.
const NAVY = theme.screens.dark;
const PILL = { height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.xs, borderRadius: theme.radius.pill, opacity: 1 };
const BACKING = { borderRadius: theme.radius.pill };

test("glass on, on a phone that draws it: the pill and Quick Edit are glass in their old boxes — and nothing else on Home is", async () => {
  await home();
  expect(glassIds()).toEqual(["home-header-actions-glass", "home-quick-backing-glass"]);
  expect(flat("home-header-actions")).toEqual(PILL);                      // the box as it was, without the solid colour
  expect(flat("home-quick-backing")).toEqual(BACKING);
  for (const id of ["home-header-actions-glass", "home-quick-backing-glass"]) {
    const glass = screen.getByTestId(id);
    expect(glass).toHaveProp("tintColor", GLASS_TINT.dark);
    expect(glass).toHaveProp("colorScheme", "dark");
    expect(glass).toHaveProp("glassEffectStyle", "regular");
    expect(glass).toHaveProp("pointerEvents", "none");
  }
  // A capsule's corner is half its height: 22 for the 44-pt pill, 24 for the 48-pt button.
  expect(flat("home-header-actions-glass").borderRadius).toBe(theme.size.touch / 2);
  expect(flat("home-quick-backing-glass").borderRadius).toBe(theme.size.control / 2);
  // The two buttons are where they were, with their labels and their ink; Quick Edit has no fill of its own — the glass is its fill.
  expect(within(screen.getByTestId("home-header-actions")).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Post a video", "Accounts"]);
  expect(quick().backgroundColor).toBeUndefined();
  expect(quick()).toMatchObject({ height: theme.size.control, borderRadius: theme.radius.pill });
  expect(screen.getByText("Quick Edit")).toHaveStyle({ color: NAVY.text });
  // The main action is never glass: a solid gold fill.
  expect(screen.getByRole("button", { name: "New Project" })).toHaveStyle({ backgroundColor: theme.colors.accent });
});

test("glass OFF (one word) and glass that may not be drawn (Reduce Transparency) are the same tree: the solid pixels Home had", async () => {
  GLASS.home = false;
  const off = await home();
  expect(glassIds()).toEqual([]);
  expect(flat("home-header-actions")).toEqual({ ...PILL, backgroundColor: NAVY.bar });
  expect(flat("home-quick-backing")).toEqual({ ...BACKING, backgroundColor: NAVY.bar });
  expect(quick().backgroundColor).toBe(NAVY.lifted);
  const offTree = JSON.stringify(off.toJSON());
  const offQuick = quick();
  await off.unmount();

  GLASS.home = true; phone.start(true);
  const reduced = await home();
  expect(glassIds()).toEqual([]);
  expect(JSON.stringify(reduced.toJSON())).toBe(offTree);
  // And switching the transparency back on moves nothing: the same boxes, glass behind them.
  await phone.change(false);
  expect(glassIds()).toHaveLength(2);
  expect({ ...flat("home-header-actions"), backgroundColor: NAVY.bar }).toEqual({ ...PILL, backgroundColor: NAVY.bar });
  expect({ ...quick(), backgroundColor: NAVY.lifted }).toEqual(offQuick);
});

test("the editor's switch is not Home's: with only the editor on, Home is solid", async () => {
  GLASS.home = false; GLASS.editor = true;
  await home();
  expect(glassIds()).toEqual([]);
});

test("light: the glass and its tint are the cream family's, with the navy ink on it", async () => {
  await home("light");
  const CREAM = theme.screens.light;
  for (const id of ["home-header-actions-glass", "home-quick-backing-glass"]) {
    expect(screen.getByTestId(id)).toHaveProp("tintColor", GLASS_TINT.light);
    expect(screen.getByTestId(id)).toHaveProp("colorScheme", "light");
  }
  expect(screen.getByText("Quick Edit")).toHaveStyle({ color: CREAM.text });
  await phone.change(true);
  expect(flat("home-header-actions").backgroundColor).toBe(CREAM.bar);
  expect(flat("home-quick-backing").backgroundColor).toBe(CREAM.bar);
});

test("while a project is made nothing on Home is glass: the dimmed pill is the solid colour (glass is never under an opacity), and it is glass again after", async () => {
  let finish: (v: unknown) => void = () => {};
  pick.mockResolvedValueOnce(PICKED);
  make.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  await home();
  await fireEvent.press(screen.getByRole("button", { name: "Quick Edit" }));
  const pressed = fireEvent.press(await screen.findByRole("button", { name: "Choose Photos and Videos" }));
  await screen.findByTestId("home-making");
  expect(glassIds()).toEqual([]);
  expect(flat("home-header-actions")).toEqual({ ...PILL, opacity: DISABLED_OPACITY, backgroundColor: NAVY.bar });   // exactly the busy pill Home had
  expect(screen.getByTestId("home-header-actions")).toHaveProp("pointerEvents", "none");
  expect(screen.getByTestId("home-making")).toHaveStyle({ backgroundColor: NAVY.bar, height: theme.size.control });
  await act(async () => { finish({ id: "q1", failed: 0 }); await pressed; });
  expect(screen.queryByTestId("home-making")).toBeNull();
  expect(glassIds()).toEqual(["home-header-actions-glass", "home-quick-backing-glass"]);
  expect(flat("home-header-actions")).toEqual(PILL);
});
