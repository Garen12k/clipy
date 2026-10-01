import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { Timeline } from "../components/Timeline";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("timeline content container stacks the clip row and lanes vertically", async () => {
  await render(<Timeline />);
  const scrollView = screen.getByTestId("timeline-scroll");
  expect(scrollView.props.contentContainerStyle).toMatchObject({ flexDirection: "column" });
  expect(screen.getByTestId("overlay-lane")).toBeTruthy();
  expect(screen.getByTestId("music-lane")).toBeTruthy();
});
