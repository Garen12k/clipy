import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true) }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { PreviewTag } from "../components/PreviewTag";

const st = () => useEditorStore.getState();
const steadied = () => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", stabilize: "medium" })] });

beforeEach(() => { useSteadyFiles.setState({ files: {} }); st().reset(); jest.mocked(isSteadyAvailable).mockReturnValue(true); });

test("a clip with Stabilize whose copy is not there yet shows the Preview tag on a build that has the tool", async () => {
  st().setProject(steadied());
  await render(<PreviewTag visible={false} />);
  expect(screen.queryByTestId("preview-tag")).toBeTruthy();
});

// On a build without the tool no copy can ever be made and the export sends the clip as it is (`useExport`): the preview and the
// export agree, so there is nothing for the tag to say — and it would never go away.
test("on a build without the tool the same clip shows no tag: it is exported as it is previewed", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  st().setProject(steadied());
  await render(<PreviewTag visible={false} />);
  expect(screen.queryByTestId("preview-tag")).toBeNull();
  await screen.unmount();
  await render(<PreviewTag visible />);                                // every other reason for the tag is untouched
  expect(screen.queryByTestId("preview-tag")).toBeTruthy();
});
