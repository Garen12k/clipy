import { act, fireEvent, render, screen } from "@testing-library/react-native";
const mockNav = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() }, useNavigation: () => mockNav }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 14000000 }));
jest.mock("@/src/publish/supabase", () => ({ isBackendConfigured: () => false }));
jest.mock("@/src/export/useExport", () => ({ useExport: () => ({ state: { status: "done", progress: 1, fileUri: "file:///out.mp4" }, start: jest.fn(), cancel: jest.fn(), reset: jest.fn() }) }));
let mockInstalled = true;
const mockOpen = jest.fn();
jest.mock("@/src/export/openInstagram", () => ({
  ...jest.requireActual("@/src/export/openInstagram"),
  useInstagramInstalled: () => mockInstalled,
  openInInstagram: (...a: unknown[]) => mockOpen(...a),
}));
const mockSave = jest.fn();
jest.mock("@/src/export/saveVideo", () => ({ saveVideoToPhotos: (...a: unknown[]) => mockSave(...a) }));
import ExportScreen from "@/app/editor/[id]/export";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";

const toast = () => useToast.getState().message;
const instagram = () => screen.getByRole("button", { name: "Open Instagram" });

beforeEach(() => {
  jest.clearAllMocks();
  mockInstalled = true;
  mockSave.mockResolvedValue({ saved: true, localIdentifier: "ABCD/L0/001" });
  mockOpen.mockResolvedValue(true);
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
});

test("no Instagram on the phone: no button", async () => {
  mockInstalled = false;
  await render(<ExportScreen />);
  expect(screen.queryByRole("button", { name: "Open Instagram" })).toBeNull();
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("Save to Photos");
});

test("Open Instagram saves the video to Photos first (Save to Photos' own words), then opens Instagram on that asset", async () => {
  await render(<ExportScreen />);
  await fireEvent.press(instagram());
  expect(mockSave.mock.calls).toEqual([["file:///out.mp4"]]);
  expect(mockOpen.mock.calls).toEqual([["ABCD/L0/001"]]);
  expect(toast()).toBe("Saved to Photos");
});

test("after Save to Photos, Open Instagram reuses that asset: nothing is saved twice", async () => {
  await render(<ExportScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Save to Photos" }));
  expect(toast()).toBe("Saved to Photos");
  await fireEvent.press(instagram());
  await fireEvent.press(instagram());
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockOpen.mock.calls).toEqual([["ABCD/L0/001"], ["ABCD/L0/001"]]);
});

test("Photos refused: exactly Save to Photos' refusal, and Instagram is not opened", async () => {
  mockSave.mockResolvedValue({ saved: false });
  await render(<ExportScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Save to Photos" }));
  const refusal = toast();
  expect(refusal).toBe("Allow Photos access in Settings to save.");
  await act(async () => { useToast.getState().clear(); });
  await fireEvent.press(instagram());
  expect(toast()).toBe(refusal);
  expect(mockOpen).not.toHaveBeenCalled();
});

test("a failed save says what Save to Photos says, and Instagram is not opened", async () => {
  mockSave.mockRejectedValue(new Error("disk full"));
  await render(<ExportScreen />);
  await fireEvent.press(instagram());
  expect(toast()).toBe("disk full");
  expect(mockOpen).not.toHaveBeenCalled();
});

test("Instagram cannot be opened at all: one plain sentence", async () => {
  mockOpen.mockResolvedValue(false);
  await render(<ExportScreen />);
  await fireEvent.press(instagram());
  expect(toast()).toBe("Instagram could not be opened.");
});
