// THE GLASS TRIAL in the editor (GLASS.editor): the bottom toolbar's capsule — `BarCapsule`, the one capsule the toolbar and the
// multi-select bar both draw. The app on a build that has the glass module, on a phone that draws Liquid Glass.
// (The loader itself — the build's module, the phone's two checks — is systemGlass.ts, tested in src/ui/__tests__/Glass*.test.tsx.)
jest.mock("@/src/ui/systemGlass", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  const GlassView = (p: object) => createElement(View, { ...p, accessibilityHint: "system glass" });
  return { glassView: () => GlassView, isGlassAvailable: () => true };
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { BarCapsule, BarSeparator, ToolScroll } from "@/src/editor/components/ToolbarRow";
import { GLASS, GLASS_TINT, theme } from "@/src/theme/theme";
import { reduceTransparencyPhone } from "@/src/ui/testing/glassPhone";
import { ShownContext, ToneContext } from "@/src/ui/tone";
import { TOOLBAR, ToolButton } from "@/src/ui/ToolButton";
import { BAR_HEIGHT } from "@/src/ui/ToolStrip";

const phone = reduceTransparencyPhone();
beforeEach(() => { GLASS.home = true; GLASS.editor = true; phone.start(false); });
afterEach(() => { jest.restoreAllMocks(); });

const mounts = { count: 0 };
function Tools({ group }: { group: string }) {
  useEffect(() => { mounts.count += 1; }, []);
  return <><ToolButton variant="bar" label={group} icon="cut-outline" onPress={() => {}} /><ToolButton variant="bar" label="Speed" icon="speedometer-outline" onPress={() => {}} /></>;
}
const bar = (group = "Split") => (
  <ToneContext.Provider value="editor">
    <BarCapsule testID="toolbar-row">
      <ToolScroll testID="toolbar-scroll"><Tools group={group} /></ToolScroll>
      <BarSeparator />
    </BarCapsule>
  </ToneContext.Provider>
);
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
/** The row made wider than its box: more tools follow. */
const overflow = async () => {
  await fireEvent(screen.getByTestId("toolbar-scroll"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 198, height: TOOLBAR.tool } } });
  await fireEvent(screen.getByTestId("toolbar-scroll"), "contentSizeChange", 400, TOOLBAR.tool);
};

// What the capsule was before glass: the box nothing may move.
const CAPSULE = { height: TOOLBAR.height, marginHorizontal: theme.space.xs, paddingHorizontal: theme.space.xs, gap: theme.space.xs, borderRadius: theme.radius.pill, flexDirection: "row", alignItems: "center" };
const SLOT = { height: BAR_HEIGHT - 1, justifyContent: "flex-end" };

test("glass on, on a phone that draws it: the capsule is glass in its old box — dark, the slate tint, no touches, nothing animated", async () => {
  await render(bar());
  await phone.settle();
  expect(flat("toolbar-slot")).toEqual(SLOT);
  expect(flat("toolbar-row")).toEqual(CAPSULE);
  const glass = screen.getByTestId("toolbar-row-glass");
  expect(glass).toHaveProp("accessibilityHint", "system glass");
  expect(glass).toHaveProp("tintColor", GLASS_TINT.editor);
  expect(glass).toHaveProp("colorScheme", "dark");
  expect(glass).toHaveProp("pointerEvents", "none");
  expect(glass.props.isInteractive).toBeUndefined();
  // A plain style string: no animated config (`{ style, animate }`) is ever handed to the system.
  expect(glass).toHaveProp("glassEffectStyle", "regular");
  expect(flat("toolbar-row-glass")).toEqual({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: TOOLBAR.height / 2 });
  // The tools are our own views beside the glass, never inside it; their ink is what it was.
  expect(glass.props.children).toBeUndefined();
  expect(screen.getByText("Split")).toHaveStyle({ color: theme.colors.text });
  expect(screen.getByRole("button", { name: "Split" })).toBeTruthy();
});

test("glass OFF (one word) and Reduce Transparency are the same tree: the solid slate capsule the editor had", async () => {
  GLASS.editor = false;
  const off = await render(bar());
  await phone.settle();
  await overflow();
  expect(screen.queryAllByHintText("system glass")).toEqual([]);
  expect(flat("toolbar-slot")).toEqual(SLOT);
  expect(flat("toolbar-row")).toEqual({ ...CAPSULE, backgroundColor: theme.elevation.bar });
  expect(screen.getByTestId("toolbar-fade")).toBeTruthy();                // the colour fade, as ever
  const offTree = JSON.stringify(off.toJSON());
  await off.unmount();

  GLASS.editor = true; phone.start(true);
  const reduced = await render(bar());
  await phone.settle();
  await overflow();
  expect(JSON.stringify(reduced.toJSON())).toBe(offTree);
  // Glass back: the same box.
  await phone.change(false);
  expect(screen.getByTestId("toolbar-row-glass")).toBeTruthy();
  expect(flat("toolbar-row")).toEqual(CAPSULE);
});

test("Home's switch is not the editor's: with only Home on, the capsule is solid", async () => {
  GLASS.editor = false; GLASS.home = true;
  await render(bar());
  await phone.settle();
  expect(screen.queryAllByHintText("system glass")).toEqual([]);
});

test("on glass the row has no colour fade (slices of the SOLID bar colour would be a patch on it); solid, it has", async () => {
  await render(bar());
  await phone.settle();
  await overflow();
  expect(screen.queryByTestId("toolbar-fade")).toBeNull();
  await phone.change(true);
  expect(screen.getByTestId("toolbar-fade")).toBeTruthy();
});

test("the row's swap stays instant and ours: a new group is a re-render under the same capsule and the same glass view", async () => {
  mounts.count = 0;
  const view = await render(bar("Split"));
  await phone.settle();
  const glass = screen.getByTestId("toolbar-row-glass");
  const props = { ...glass.props };
  await view.rerender(bar("Volume"));
  expect(screen.getByText("Volume")).toBeTruthy();
  expect(screen.queryByText("Split")).toBeNull();
  expect(screen.getByTestId("toolbar-row-glass").props).toEqual(props);  // nothing about the glass changes when the tools do
  expect(mounts.count).toBe(1);
});

test("the editor's glass does not follow the phone's appearance: dark and slate under a light phone too", async () => {
  await render(<ShownContext.Provider value="light">{bar()}</ShownContext.Provider>);
  await phone.settle();
  expect(screen.getByTestId("toolbar-row-glass")).toHaveProp("colorScheme", "dark");
  expect(screen.getByTestId("toolbar-row-glass")).toHaveProp("tintColor", GLASS_TINT.editor);
});

test("glass is used in exactly three places — Home's pill, Quick Edit, the toolbar's capsule — and nowhere near the preview, a strip, a panel or the message bar", () => {
  const root = join(__dirname, "..", "..", "..");
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "testing" && name !== "node_modules") walk(p); continue; }
      if (!/\.tsx$/.test(name)) continue;
      const uses = readFileSync(p, "utf8").split("<Glass ").length - 1;
      if (uses > 0) found.push(`${p.slice(root.length + 1).split("\\").join("/")} ${uses}`);
    }
  };
  walk(join(root, "src")); walk(join(root, "app"));
  expect(found.sort()).toEqual(["app/index.tsx 2", "src/editor/components/ToolbarRow.tsx 1"]);
  // And the capsule is drawn by the two bars only.
  const users = ["EditorToolbar.tsx", "MultiSelectBar.tsx"].map((f) => readFileSync(join(root, "src/editor/components", f), "utf8").includes("<BarCapsule"));
  expect(users).toEqual([true, true]);
});
