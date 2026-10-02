import { theme } from "@/src/theme/theme";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => ["🎉"]), pushRecentEmoji: jest.fn(async () => {}) } }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { StickerSheet } from "../components/StickerSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });

test("picking an emoji adds a selected sticker at the playhead and records it as recent", async () => {
  const onAdded = jest.fn();
  await render(<StickerSheet visible onClose={() => {}} onAdded={onAdded} />);
  expect(await screen.findByText("🎉")).toBeTruthy();   // recents row
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "fire");
  await fireEvent.press(await screen.findByLabelText("Emoji fire"));
  const ov = useEditorStore.getState().project!.overlays[0];
  expect(ov).toMatchObject({ kind: "sticker", emoji: "🔥", start: 2, end: 5 });
  expect(useEditorStore.getState().selectedOverlayId).toBe("st1");
  expect(onAdded).toHaveBeenCalledWith("st1");
});

test("shapes tab adds a shape sticker with the chosen color", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  await fireEvent.press(screen.getByLabelText(`Color ${theme.colors.sea}`));
  await fireEvent.press(screen.getByRole("button", { name: "Heart" }));
  expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: null, shape: "heart", color: theme.colors.sea });
});
