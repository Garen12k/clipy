import { render, screen } from "@testing-library/react-native";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TrimHandles } from "../components/TrimHandles";

beforeEach(() => { useEditorStore.getState().reset(); });

test("a video clip shows both trim handles", async () => {
  const clip = makeClip({ id: "a", sourceDuration: 4 });
  useEditorStore.getState().setProject(makeProject({ clips: [clip] }));
  await render(<TrimHandles clip={clip} />);
  expect(screen.getByLabelText("Trim start handle")).toBeTruthy();
  expect(screen.getByLabelText("Trim end handle")).toBeTruthy();
});

test("a photo clip shows only the end handle", async () => {
  const clip = makePhotoClip({ id: "p" });
  useEditorStore.getState().setProject(makeProject({ clips: [clip] }));
  await render(<TrimHandles clip={clip} />);
  expect(screen.queryByLabelText("Trim start handle")).toBeNull();
  expect(screen.getByLabelText("Trim end handle")).toBeTruthy();
});
