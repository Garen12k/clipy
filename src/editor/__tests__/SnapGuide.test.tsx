import { act, render, screen } from "@testing-library/react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { SnapGuide } from "../components/SnapGuide";
import { useSnapGuide } from "../snapping";

beforeEach(() => {
  useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
  useEditorStore.getState().setZoom(60); useSnapGuide.setState({ time: null });
});

test("nothing is drawn while no bar is snapped", async () => {
  await render(<SnapGuide left={187} height={200} />);
  expect(screen.queryByTestId("snap-guide")).toBeNull();
});

test("a 1 pt accent line at the snapped time, out of the flow and untouchable; gone again when the snap ends", async () => {
  await render(<SnapGuide left={187} height={200} />);
  await act(() => { useSnapGuide.setState({ time: 4 }); });
  const line = screen.getByTestId("snap-guide");
  expect(line).toHaveStyle({ position: "absolute", left: 187 + 240 - 0.5, top: 0, width: 1, height: 200, backgroundColor: theme.colors.accent });
  expect(line.props.pointerEvents).toBe("none");
  await act(() => { useSnapGuide.setState({ time: null }); });
  expect(screen.queryByTestId("snap-guide")).toBeNull();
});
