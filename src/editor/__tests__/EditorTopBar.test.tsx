import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { ActionSheetIOS, Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { router } from "expo-router";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { EditorTopBar } from "../components/EditorTopBar";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
type SheetOptions = Parameters<typeof ActionSheetIOS.showActionSheetWithOptions>[0];
let sheet: jest.SpyInstance, prompt: jest.SpyInstance;
/** What the menu was opened with, and its answer. */
const menu = () => sheet.mock.calls[0] as [SheetOptions, (index: number) => void];

beforeEach(() => {
  st().reset(); st().setProject(makeProject({ name: "Beach" }));
  (router.back as jest.Mock).mockClear();
  sheet = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  prompt = jest.spyOn(Alert, "prompt").mockImplementation(() => {});
});
afterEach(() => { sheet.mockRestore(); prompt.mockRestore(); });

test("shows back, the project name and an Export button", async () => {
  const onExport = jest.fn();
  await render(<EditorTopBar onExport={onExport} />);
  expect(btn("Back")).toBeTruthy();
  expect(screen.getByText("Beach")).toBeTruthy();
  await fireEvent.press(btn("Export"));
  expect(onExport).toHaveBeenCalledTimes(1);
});

test("Back is a round slate button with a 44-pt target, and leaves the editor", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  const back = btn("Back");
  expect(back).toHaveStyle({ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar });
  expect(theme.size.iconButton + 2 * (back.props.hitSlop as number)).toBeGreaterThanOrEqual(theme.size.touch);
  await fireEvent.press(back);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test("Export is the bar's one gold button, with a share symbol before its label", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
  const gold = screen.getByTestId("primary-button");
  expect(gold).toHaveAccessibleName("Export");
  expect(gold).toHaveStyle({ backgroundColor: theme.colors.accent });
  expect(within(gold).getByTestId("export-symbol")).toBeTruthy();
});

test("the name is one line with a small chevron, and says it opens the project menu", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  const name = btn("Beach, project");
  expect(name.props.accessibilityHint).toBe("Opens the project menu");
  expect(screen.getByText("Beach")).toHaveStyle({ fontSize: theme.type.headline, fontWeight: theme.weight.semi });
  expect(screen.getByText("Beach").props.numberOfLines).toBe(1);
  expect(within(name).getByTestId("project-menu-chevron")).toBeTruthy();
});

test("tapping the name opens a menu of Rename and Cancel; nothing is renamed or asked yet", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  await fireEvent.press(btn("Beach, project"));
  expect(sheet).toHaveBeenCalledTimes(1);
  expect(menu()[0]).toMatchObject({ options: ["Rename", "Cancel"], cancelButtonIndex: 1 });
  expect(prompt).not.toHaveBeenCalled();
});

test("Rename opens the same prompt as before: one undoable step, and an empty answer changes nothing", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  await fireEvent.press(btn("Beach, project"));
  menu()[1](0);
  expect(prompt).toHaveBeenCalledTimes(1);
  const [title, message, answer, kind, initial] = prompt.mock.calls[0] as [string, undefined, (n: string) => void, string, string];
  expect([title, message, kind, initial]).toEqual(["Rename project", undefined, "plain-text", "Beach"]);
  await act(() => { answer(""); });
  expect(st().project!.name).toBe("Beach");
  expect(st().past).toHaveLength(0);
  await act(() => { answer("Lisbon"); });
  expect(st().project!.name).toBe("Lisbon");
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(st().project!.name).toBe("Beach");
});

test("Cancel in the menu does nothing", async () => {
  await render(<EditorTopBar onExport={() => {}} />);
  await fireEvent.press(btn("Beach, project"));
  menu()[1](1);
  expect(prompt).not.toHaveBeenCalled();
  expect(st().project!.name).toBe("Beach");
  expect(st().past).toHaveLength(0);
});
