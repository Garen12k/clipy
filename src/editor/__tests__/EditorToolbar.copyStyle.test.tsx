import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-14T10:00:00.000Z" }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
import { copyStyle, forgetCopiedStyle, useCopiedStyle } from "@/src/editor/copiedStyle";
import { textLookOf } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject, makeSticker, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { closeStrip } from "@/src/editor/toolStrip";
import { useToast } from "@/src/ui/Toast";
import { EditorToolbar } from "../components/EditorToolbar";
import { scrolled } from "../testing/toolbar";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const tap = async (name: string) => { await fireEvent.press(btn(name)); };
const text = (id: string) => st().project!.overlays.find((o) => o.id === id) as TextOverlay;

const from = makeOverlay({ id: "from", fontId: "oswald", fontScale: 0.12, color: "#FF0000", background: { color: "#00FF00", opacity: 0.5 }, outline: false, start: 0, end: 2,
  style: { opacity: 0.7, letterSpacing: 0.1, lineSpacing: 1.4, outlineColor: "#123456", outlineWidth: 2, shadow: null, glow: { color: "#ABCDEF", size: 0.3 }, boxPadding: 0.4, boxCorner: "square" } });
const to = makeOverlay({ id: "to", text: "Other words", align: "left", x: 0.3, y: 0.7, start: 1, end: 3 });

beforeEach(() => {
  closeStrip();
  forgetCopiedStyle();
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })],
    overlays: [from, to, makeOverlay({ id: "cap", kind: "caption", text: "hi" }), makeSticker({ id: "st" })] }));
});
afterAll(() => forgetCopiedStyle());

test("a text's bar: Copy style after Keyframe; Paste style appears beside it once a style is copied, in one flat row", async () => {
  st().selectOverlay("from");
  await render(<EditorToolbar />);
  expect(scrolled()).toEqual(["Edit", "Animate", "Keyframe", "Copy style", "Duplicate", "Add text"]);
  await tap("Copy style");
  expect(scrolled()).toEqual(["Edit", "Animate", "Keyframe", "Copy style", "Paste style", "Duplicate", "Add text"]);
  expect(btn("Delete")).toBeTruthy();
});

test("Copy style remembers the look and says so; nothing in the project changes and no undo step is made", async () => {
  st().selectOverlay("from");
  await render(<EditorToolbar />);
  const before = st().project;
  await tap("Copy style");
  expect(useCopiedStyle.getState().look).toEqual(textLookOf(from));
  expect(useToast.getState()).toMatchObject({ message: "Style copied", kind: "done", undo: false });
  expect(st().project).toBe(before);
  expect(st().past).toHaveLength(0);
});

test("Paste style: one undo step, the look only, said with Undo; Undo gives the old look back exactly", async () => {
  copyStyle(textLookOf(from));
  st().selectOverlay("to");
  await render(<EditorToolbar />);
  const was = text("to");
  await tap("Paste style");
  expect(st().past).toHaveLength(1);
  const now = text("to");
  expect(textLookOf(now)).toEqual(textLookOf(from));
  expect({ ...now, fontId: 0, fontScale: 0, color: 0, background: 0, outline: 0, style: 0 }).toEqual({ ...was, fontId: 0, fontScale: 0, color: 0, background: 0, outline: 0, style: 0 });
  expect(useToast.getState()).toMatchObject({ message: "Style pasted", kind: "done", undo: true });
  await act(async () => { st().undo(); });
  expect(text("to")).toEqual(was);
  expect(JSON.stringify(text("to"))).toBe(JSON.stringify(was));
});

test("Paste style onto the text it was copied from: no step, nothing said", async () => {
  st().selectOverlay("from");
  await render(<EditorToolbar />);
  await tap("Copy style");
  useToast.getState().clear();
  await tap("Paste style");
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("a copied style works in another project (the store is the session's, not the project's)", async () => {
  copyStyle(textLookOf(from));
  st().setProject(makeProject({ clips: [makeClip({ id: "b", sourceDuration: 4 })], overlays: [makeOverlay({ id: "x", start: 0, end: 2 })] }));
  st().selectOverlay("x");
  await render(<EditorToolbar />);
  await tap("Paste style");
  expect(textLookOf(text("x"))).toEqual(textLookOf(from));
});

test("a caption and a sticker: neither tool, even with a style copied", async () => {
  copyStyle(textLookOf(from));
  st().selectOverlay("cap");
  await render(<EditorToolbar />);
  expect(screen.queryByRole("button", { name: "Copy style" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Paste style" })).toBeNull();
  await act(async () => { st().selectOverlay("st"); });
  expect(screen.queryByRole("button", { name: "Copy style" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Paste style" })).toBeNull();
});
