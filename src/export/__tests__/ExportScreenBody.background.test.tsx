import { render } from "@testing-library/react-native";
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 0 }));
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: jest.fn(() => false), notifyState: jest.fn(async () => "unavailable"), askToNotify: jest.fn(), notifyDone: jest.fn() }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { EXPORT_PAUSED, EXPORT_RESTARTED } from "../backgroundExport";
import { ExportScreenBody } from "../ExportScreenBody";
import type { ExportState } from "../useExport";

const project = makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 4 })] });
const draw = (state: ExportState) => render(<ExportScreenBody project={project} state={state} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);

test("an export in front shows the ring, its word and Cancel — and no line about the background", async () => {
  const s = await draw({ status: "exporting", progress: 0.4 });
  expect(s.getByText("Exporting…")).toBeTruthy();
  expect(s.queryByTestId("export-paused")).toBeNull();
  expect(s.queryByTestId("export-note")).toBeNull();
  expect(s.getByText("Cancel")).toBeTruthy();
});

test("paused: still the exporting screen (ring, Cancel), with the one line that says it waits", async () => {
  const s = await draw({ status: "exporting", progress: 0.4, paused: true });
  expect(s.getByText("Exporting…")).toBeTruthy();
  expect(s.getByTestId("export-paused").props.children).toBe(EXPORT_PAUSED);
  expect(s.getByText("Cancel")).toBeTruthy();
  expect(s.queryByTestId("export-error")).toBeNull();
});

test("started again: the one sentence under the ring, from 0", async () => {
  const s = await draw({ status: "exporting", progress: 0, note: EXPORT_RESTARTED });
  expect(s.getByTestId("export-note").props.children).toBe("Clipy was in the background, so the export started again.");
  expect(s.queryByTestId("export-paused")).toBeNull();
});

test("no sentence on the screen promises that an export finishes in the background", () => {
  for (const line of [EXPORT_PAUSED, EXPORT_RESTARTED]) expect(line).not.toMatch(/finish|keeps going|continue/i);
});
