import { render, screen } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => false, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CaptionsSheet } from "../components/CaptionsSheet";
test("shows the fallback card in Expo Go", async () => {
  useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 2 })] }));
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.getByText("Captions need the native build")).toBeTruthy();
});
