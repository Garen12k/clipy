import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
jest.mock("expo-status-bar", () => ({ StatusBar: { setStyle: jest.fn() } }));
import { memo, Profiler, useContext, useEffect, type ReactNode } from "react";
import { Appearance, AppState, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { applyAppearance, SETTLE_MS, useShownAppearance } from "@/src/theme/appearance";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { Chip } from "@/src/ui/Chip";
import { Icon } from "@/src/ui/Icon";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body, Title } from "@/src/ui/Text";
import { hasSurface, leftovers } from "@/src/ui/testing/appearance";
import { ShownContext, useSurfaces } from "@/src/ui/tone";
import { EditorLayout } from "../components/EditorLayout";
import { EditorToolbar } from "../components/EditorToolbar";
import { Timeline } from "../components/Timeline";
import { TransportRow } from "../components/TransportRow";
import { closeStrip } from "../toolStrip";

/**
 * THE PROOF that the editor is untouched when the phone's appearance changes while the app runs: the real editor (its layout, the
 * timeline, the transport row and the whole toolbar) on its own `Screen`, beside a screen of the app, under the provider the root
 * layout uses. The phone is flipped; the screen is drawn again where it stands; in the editor not one component renders.
 */
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } };
let phone: "light" | "dark" = "light";
const changes: (() => void)[] = [];
const flip = (to: "light" | "dark") => act(() => { phone = to; for (const l of [...changes]) l(); });

const commits = { editor: 0, screen: 0 };
const mounts = { preview: 0, editorProbe: 0, screenProbe: 0 };
const renders = { editorProbe: 0, screenProbe: 0 };
const seen: { editor: unknown[]; screen: unknown[] } = { editor: [], screen: [] };

function Preview() {                                                // stands where the VideoView is
  useEffect(() => { mounts.preview++; }, []);
  return <View testID="preview" />;
}
function Probe({ side }: { side: "editor" | "screen" }) {
  const s = useSurfaces();
  renders[`${side}Probe`]++;
  seen[side].push(s);
  useEffect(() => { mounts[`${side}Probe`]++; }, [side]);
  return <Text testID={`${side}-probe`} style={{ color: s.text }}>probe</Text>;
}
/** One of everything the kit draws on both sides. */
const Kit = ({ side }: { side: string }) => (<>
  <Card testID={`${side}-card`}><Title>{`${side} title`}</Title><Body muted>{`${side} muted`}</Body></Card>
  <SecondaryButton title={`${side} second`} onPress={() => {}} />
  <Chip label={`${side} chip`} selected onPress={() => {}} />
  <Icon testID={`${side}-icon`} name="add-outline" />
</>);
/** What the navigator does for a route (expo-router's StaticContainer): the layout re-rendering does not re-render the screen. */
const Route = memo(function Route({ children }: { children: ReactNode }) { return <>{children}</>; }, () => true);

function Root() {
  const shown = useShownAppearance();                               // exactly app/_layout.tsx
  return (
    <ShownContext.Provider value={shown}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Route>
          <Profiler id="screen" onRender={() => { commits.screen++; }}>
            <Screen><Probe side="screen" /><Kit side="screen" /></Screen>
          </Profiler>
        </Route>
        <Route>
          <Profiler id="editor" onRender={() => { commits.editor++; }}>
            <Screen tone="editor">
              <Probe side="editor" /><Kit side="editor" />
              <EditorLayout top={null} preview={<Preview />} transport={<TransportRow />} timeline={<Timeline />} toolbar={<EditorToolbar />} />
            </Screen>
          </Profiler>
        </Route>
      </SafeAreaProvider>
    </ShownContext.Provider>
  );
}

beforeAll(() => {
  jest.spyOn(Appearance, "getColorScheme").mockImplementation(() => phone);
  jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
  jest.spyOn(Appearance, "addChangeListener").mockImplementation((l) => { changes.push(l as () => void); return { remove() {} } as never; });
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove() {} })) as never);
  Object.defineProperty(AppState, "currentState", { configurable: true, get: () => "active" });
});

/** Mounts the two screens with the phone in light, and waits until what mounting itself starts (the icon font, the first measurements) has been drawn. */
async function mount() {
  for (const k of ["editor", "screen"] as const) { commits[k] = 0; seen[k] = []; }
  Object.assign(mounts, { preview: 0, editorProbe: 0, screenProbe: 0 });
  Object.assign(renders, { editorProbe: 0, screenProbe: 0 });
  closeStrip();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "o1", text: "Hi", start: 0, end: 2 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] }));
  phone = "light";
  applyAppearance("screen");                                        // the layout's first word
  await flip("light");
  await render(<Root />);
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

test("the phone's appearance flips while the editor is open: the screen is re-drawn in place, cream → navy → cream; in the editor NOTHING renders, nothing remounts", async () => {
  await mount();

  const L = theme.screens.light, D = theme.screens.dark, E = theme.surfaces.editor;
  const page = (side: string) => screen.getByTestId(`${side}-probe`).parent!;
  const editorPage = page("editor"), screenPage = page("screen");
  const timeline = screen.getByTestId("timeline-root"), preview = screen.getByTestId("preview");
  const paint = (side: string) => ({
    page: page(side).props.style, card: screen.getByTestId(`${side}-card`).props.style, title: screen.getByText(`${side} title`).props.style,
    muted: screen.getByText(`${side} muted`).props.style, button: screen.getByRole("button", { name: `${side} second` }).props.style,
    chip: screen.getByRole("button", { name: `${side} chip` }).props.style, probe: screen.getByTestId(`${side}-probe`).props.style,
  });

  // Light: the screen is cream, the editor beside it is the slate it always was.
  expect(screenPage).toHaveStyle({ backgroundColor: L.page });
  expect(screen.getByText("screen title")).toHaveStyle({ color: "#0A1B33" });
  expect(screen.getByRole("button", { name: "screen chip" })).toHaveStyle({ backgroundColor: L.picked, borderColor: "#7A5200" });
  expect(editorPage).toHaveStyle({ backgroundColor: "#10151F" });
  expect(screen.getByTestId("editor-card")).toHaveStyle({ backgroundColor: "#212A3A" });
  expect(screen.getByText("editor title")).toHaveStyle({ color: "#FFFFFF" });
  expect(screen.getByRole("button", { name: "editor chip" })).toHaveStyle({ backgroundColor: "#484C52", ...theme.ring });
  expect(seen.editor.at(-1)).toBe(E);
  const editorPaint = JSON.stringify(paint("editor"));

  const before = { commits: { ...commits }, renders: { ...renders } };
  for (const [to, family] of [["dark", D], ["light", L], ["dark", D]] as const) {
    const was = { ...commits };
    await flip(to);
    // The screen side: drawn again, where it stands.
    expect(commits.screen).toBe(was.screen + 1);
    expect(seen.screen.at(-1)).toBe(family);
    expect(page("screen")).toBe(screenPage);
    expect(screenPage).toHaveStyle({ backgroundColor: family.page });
    expect(screen.getByTestId("screen-card")).toHaveStyle({ backgroundColor: family.bar, borderColor: family.separator });
    expect(screen.getByText("screen title")).toHaveStyle({ color: family.text });
    expect(screen.getByText("screen muted")).toHaveStyle({ color: family.muted });
    expect(screen.getByRole("button", { name: "screen second" })).toHaveStyle({ backgroundColor: family.lifted });
    expect(screen.getByRole("button", { name: "screen chip" })).toHaveStyle({ backgroundColor: family.picked, borderColor: family.accentInk });
    // The editor: not one commit.
    expect(commits.editor).toBe(was.editor);
  }
  expect(commits.editor).toBe(before.commits.editor);
  expect(renders.editorProbe).toBe(before.renders.editorProbe);
  expect(renders.screenProbe).toBe(before.renders.screenProbe + 3);
  expect(new Set(seen.editor)).toEqual(new Set([E]));
  // Nothing was remounted on either side: the same views, each mounted once.
  expect(mounts).toEqual({ preview: 1, editorProbe: 1, screenProbe: 1 });
  expect(page("editor")).toBe(editorPage);
  expect(screen.getByTestId("timeline-root")).toBe(timeline);
  expect(screen.getByTestId("preview")).toBe(preview);
  // And the editor is, to the byte, what it was.
  expect(JSON.stringify(paint("editor"))).toBe(editorPaint);
});

test("entering and leaving the editor tells iOS and touches no colour: the screens under the editor stay as they were, the editor does not render", async () => {
  await mount();
  const was = { ...commits }, renderedBefore = { ...renders };
  const set = Appearance.setColorScheme as jest.Mock;
  set.mockClear();
  jest.useFakeTimers();
  try {
    await act(() => { applyAppearance("editor"); });
    expect(set.mock.calls).toEqual([["dark"]]);
    await flip("dark");                                              // iOS answering what it was told
    expect(commits).toEqual(was);                                    // neither side drew anything
    await act(() => { applyAppearance("overDark"); });               // Export, over the editor
    await act(() => { applyAppearance("editor"); });
    phone = "light";
    await act(() => { applyAppearance("screen"); });
    await act(() => { jest.advanceTimersByTime(SETTLE_MS); });
    expect(commits).toEqual(was);
    expect(renders).toEqual(renderedBefore);
    expect(hasSurface(theme.screens.light.page)).toBe(true);
  } finally { jest.useRealTimers(); }
});

test("the audit agrees: the editor's subtree is the dark family in both of the phone's settings (so it is what `leftovers` reports on a light screen)", async () => {
  await mount();
  const inEditor = leftovers().filter((l) => !/screen-/.test(l));
  expect(inEditor.length).toBeGreaterThan(10);
  expect(leftovers().some((l) => /#screen-card|screen title/.test(l))).toBe(false);
});

test("why the editor never READS the appearance: a nearer provider with a constant value does not keep a reader still (React 19) — only not reading does", async () => {
  let reads = 0, asks = 0;
  const Reader = memo(function Reader() { useContext(ShownContext); reads++; return null; });      // reads the context: drawn again, though its own provider never changed
  const Asker = memo(function Asker() { useSurfaces(); asks++; return null; });                    // asks as the editor does: left alone
  function Outer() {
    const shown = useShownAppearance();
    return (
      <ShownContext.Provider value={shown}>
        <Route>
          <ShownContext.Provider value="dark"><Reader /></ShownContext.Provider>
          <SafeAreaProvider initialMetrics={metrics}><Screen tone="editor"><Asker /></Screen></SafeAreaProvider>
        </Route>
      </ShownContext.Provider>
    );
  }
  phone = "light";
  applyAppearance("screen");
  await flip("light");
  await render(<Outer />);
  expect([reads, asks]).toEqual([1, 1]);
  await flip("dark");
  await flip("light");
  expect(reads).toBe(3);
  expect(asks).toBe(1);
});
