import { act, render } from "@testing-library/react-native";
const mockNav = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() }, useNavigation: () => mockNav }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/src/publish/supabase", () => ({ isBackendConfigured: () => false }));
jest.mock("@/src/export/useExport", () => ({ useExport: () => ({ state: { status: "done", progress: 1, fileUri: "file:///out.mp4" }, start: jest.fn(), cancel: jest.fn(), reset: jest.fn() }) }));
jest.mock("@/src/export/openInstagram", () => ({ ...jest.requireActual("@/src/export/openInstagram"), useInstagramInstalled: () => true, openInInstagram: (...a: unknown[]) => mockOpen(...a) }));
jest.mock("@/src/export/saveVideo", () => ({ saveVideoToPhotos: (...a: unknown[]) => mockSave(...a) }));
// The body is replaced by a probe that keeps its props, so two taps can land before the first one's save answers.
let mockProps: { onInstagram?: () => Promise<void> } = {};
jest.mock("@/src/export/ExportScreenBody", () => ({ ExportScreenBody: (p: typeof mockProps) => { mockProps = p; return null; } }));
const mockOpen = jest.fn(async (..._a: unknown[]) => true);
const mockSave = jest.fn();
import ExportScreen from "@/app/editor/[id]/export";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";

test("a second tap while one is running does nothing", async () => {
  useEditorStore.getState().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
  let finish: (v: unknown) => void = () => {};
  mockSave.mockReturnValue(new Promise((r) => { finish = r; }));
  await render(<ExportScreen />);
  let first: Promise<void> | undefined, second: Promise<void> | undefined;
  await act(async () => { first = mockProps.onInstagram?.(); second = mockProps.onInstagram?.(); });
  await act(async () => { await second; });
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockOpen).not.toHaveBeenCalled();
  await act(async () => { finish({ saved: true, localIdentifier: "ABCD/L0/001" }); await first; });
  expect(mockOpen.mock.calls).toEqual([["ABCD/L0/001"]]);
  // over: the next tap runs (and reuses the asset)
  await act(async () => { await mockProps.onInstagram?.(); });
  expect(mockOpen).toHaveBeenCalledTimes(2);
  expect(mockSave).toHaveBeenCalledTimes(1);
});
