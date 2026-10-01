import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { RatioSheet } from "../components/RatioSheet";

test("choosing a chip sets the aspect ratio and closes", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject());
  const onClose = jest.fn();
  await render(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  expect(onClose).toHaveBeenCalled();
});
