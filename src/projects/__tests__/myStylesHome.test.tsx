import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { ActionSheetIOS, Alert } from "react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), loadProject: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
  filePhone: { forget: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));

import { router } from "expo-router";
import ProjectsScreen from "@/app/index";
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { storage } from "@/src/projects";
import { myStyles } from "@/src/projects/myStyles";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { StyleStoreError } from "@/src/projects/styleStore";
import { STYLE_WORDS } from "@/src/projects/useUserStyles";
import { styleFromProject } from "@/src/projects/userStyles";
import { shrinks, textSize } from "@/src/ui/testing/textSize";
import { useToast } from "@/src/ui/Toast";

const CARD = { id: "p1", name: "Beach day", durationSec: 10, updatedAt: "2026-10-16T00:00:00.000Z", thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const PROJECT = makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "c", sourceDuration: 5, filter: "vivid", filterIntensity: 0.7 })],
  overlays: [makeOverlay({ id: "t", text: "Sun!", start: 0 })], audioTracks: [makeAudioTrack({ id: "m", title: "Party Sector", sourceDuration: 96.1 })] });
const list = storage.listProjects as jest.Mock;
const load = storage.loadProject as jest.Mock;
const pick = pickMedia as jest.Mock;
const make = makeQuickEdit as jest.Mock;
const btn = (name: string) => screen.getByRole("button", { name });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
let warn: jest.SpyInstance;
let prompt: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); list.mockResolvedValue([CARD]); load.mockResolvedValue({ project: PROJECT, missingSourceUris: [], stamp: "x" }); useToast.getState().clear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  prompt = jest.spyOn(Alert, "prompt").mockImplementation(() => {});
});
afterEach(async () => { await textSize(1); warn.mockRestore(); prompt.mockRestore(); const r = await myStyles.list(); if (r.status === "ok") for (const s of r.styles) await myStyles.remove(s.id); });

const openActions = async () => {
  await render(<ProjectsScreen />);
  await fireEvent(await screen.findByRole("button", { name: "Beach day" }), "longPress");   // the card's picture (ProjectCard.tsx:37)
};
const saveAs = async (name: string) => {
  await openActions();
  await fireEvent.press(btn("Save As Style"));
  await settle();
  expect(prompt.mock.calls[0].slice(0, 2)).toEqual(["Save as style", "You'll find it in Quick edit."]);
  expect(prompt.mock.calls[0][4]).toBe("Beach day");
  await act(async () => { (prompt.mock.calls[0][2] as (n: string) => void)(name); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.saved));
};

test("the actions sheet: Save as Style between Duplicate and Save a Copy", async () => {
  await openActions();
  const names = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((n) => ["Rename", "Duplicate", "Save As Style", "Save a Copy", "Delete"].includes(n));
  expect(names).toEqual(["Rename", "Duplicate", "Save As Style", "Save a Copy", "Delete"]);
});
test("Save as Style: the prompt, then the style is stored from the project — its music, filter and title", async () => {
  await saveAs("Summer");
  const read = await myStyles.list();
  expect(read.status === "ok" && read.styles[0]).toMatchObject({ name: "Summer", music: { kind: "bundled", trackId: "party-sector" }, filter: "vivid", filterIntensity: 0.7, title: { text: "Sun!" } });
});
test("Quick edit without styles of your own: the sheet as it always was (no headings)", async () => {
  await render(<ProjectsScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Quick Edit" }));
  await screen.findByRole("header", { name: "Quick edit" });
  expect(screen.queryByTestId("my-styles")).toBeNull();
  expect(screen.queryByText("Your styles")).toBeNull();
});
test("Your styles above Styles; a name ends in dots and never shrinks; picking one makes the draft with it", async () => {
  await saveAs("A very long name for a style of mine");
  await fireEvent.press(btn("Quick Edit"));
  await screen.findByRole("header", { name: "Quick edit" });
  const row = screen.getByTestId("my-styles");
  expect(screen.getByRole("header", { name: "Your styles" })).toBeTruthy();   // VoiceOver's headings rotor finds both rows
  expect(screen.getByRole("header", { name: "Styles" })).toBeTruthy();
  const label = within(row).getByText("A very long name for a style of mine");
  expect(label.props.numberOfLines).toBe(1);
  expect(label.props.adjustsFontSizeToFit).toBeFalsy();
  await textSize(1.3);                                                          // above the default, where `fit` would shrink it
  expect(shrinks().filter((t) => t.includes("A very long name"))).toEqual([]);
  expect(within(screen.getByTestId("my-styles")).getByText("A very long name for a style of mine").props.numberOfLines).toBe(1);
  await textSize(1);
  await fireEvent.press(within(row).getByRole("button"));
  expect(screen.getByText(/^Music: Party Sector\. /)).toBeTruthy();
  pick.mockResolvedValueOnce([{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3, height: 4 }]);
  make.mockResolvedValueOnce({ id: "new", failed: 0 });
  await fireEvent.press(btn("Choose Photos and Videos"));
  await waitFor(() => expect(make).toHaveBeenCalled());
  expect(make.mock.calls[0][3]).toMatchObject({ style: { name: "A very long name for a style of mine" }, musicUri: null });
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/editor/new"));
});
test("touch and hold → Rename / Delete; Delete asks, then the style goes and the row with it", async () => {
  await saveAs("Summer");
  await fireEvent.press(btn("Quick Edit"));
  await screen.findByRole("header", { name: "Quick edit" });
  jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementationOnce((_o, cb) => cb(1));
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await fireEvent(within(screen.getByTestId("my-styles")).getByRole("button"), "longPress");
  await settle();
  await act(async () => { alert.mock.calls[0][2]![1].onPress!(); });
  await waitFor(() => expect(screen.queryByTestId("my-styles")).toBeNull());
  alert.mockRestore();
});
test("a project whose load fails: the failure toast, no style", async () => {
  load.mockRejectedValueOnce(new Error("gone"));
  await openActions();
  await fireEvent.press(btn("Save As Style"));
  await settle();
  await act(async () => { (prompt.mock.calls[0][2] as (n: string) => void)("X"); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.failed));
  expect(await myStyles.list()).toEqual({ status: "ok", styles: [] });
});
test("not on a project that cannot be opened", async () => {
  list.mockResolvedValue([{ ...CARD, broken: true }]);
  await render(<ProjectsScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Beach day" }));
  expect(await screen.findByRole("button", { name: "Delete" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save As Style" })).toBeNull();
});
test("while a style is being saved (our own work, under `creating`), Quick Edit opens nothing; afterwards it does", async () => {
  let done!: (v: unknown) => void;
  load.mockReturnValueOnce(new Promise((r) => { done = r; }));
  await openActions();
  await fireEvent.press(btn("Save As Style"));
  await settle();
  await act(async () => { (prompt.mock.calls[0][2] as (n: string) => void)("Later"); });
  expect(screen.queryByRole("button", { name: "Quick Edit" })).toBeNull();   // the making capsule stands in its place
  await settle();
  expect(screen.queryByRole("header", { name: "Quick edit" })).toBeNull();
  await act(async () => { done({ project: PROJECT, missingSourceUris: [], stamp: "x" }); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.saved));
  await fireEvent.press(await screen.findByRole("button", { name: "Quick Edit" }));
  expect(await screen.findByRole("header", { name: "Quick edit" })).toBeTruthy();
  expect(within(screen.getByTestId("my-styles")).getByText("Later")).toBeTruthy();
});
test("while a style is saved (a large own song is copied) Home says so in the making capsule, and is itself again after", async () => {
  let done: (v: unknown) => void = () => {};
  load.mockReturnValueOnce(new Promise((r) => { done = r; }));
  await openActions();
  await fireEvent.press(btn("Save As Style"));
  await settle();
  await act(async () => { (prompt.mock.calls[0][2] as (n: string) => void)("Summer"); });
  const capsule = await screen.findByTestId("home-making");
  expect(capsule.props.accessibilityLabel).toBe("Saving your style");
  expect(screen.queryByRole("button", { name: "Quick Edit" })).toBeNull();
  await act(async () => { done({ project: PROJECT, missingSourceUris: [], stamp: "x" }); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.saved));
  await waitFor(() => expect(screen.queryByTestId("home-making")).toBeNull());
  expect(btn("Quick Edit")).toBeTruthy();
});
test("Home's sentences: twenty styles already → \"full\"; a newer Clipy's file → \"newer\"; nothing more is stored", async () => {
  for (let i = 0; i < 20; i++) await myStyles.add(styleFromProject(PROJECT), `S${i}`, "P");
  await openActions();
  await fireEvent.press(btn("Save As Style"));
  await settle();
  await act(async () => { (prompt.mock.calls[0][2] as (n: string) => void)("One more"); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.full));
  const read = await myStyles.list();
  expect(read.status === "ok" && read.styles.length).toBe(20);
  const newer = jest.spyOn(myStyles, "add").mockRejectedValueOnce(new StyleStoreError("newer"));
  await fireEvent(await screen.findByRole("button", { name: "Beach day" }), "longPress");
  await fireEvent.press(btn("Save As Style"));
  await settle();
  await act(async () => { (prompt.mock.calls[1][2] as (n: string) => void)("Newer"); });
  await waitFor(() => expect(useToast.getState().message).toBe(STYLE_WORDS.newer));
  newer.mockRestore();
});
