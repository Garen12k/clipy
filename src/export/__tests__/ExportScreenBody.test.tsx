import { fireEvent, render, screen } from "@testing-library/react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { ExportScreenBody } from "../ExportScreenBody";

const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
const base = { progress: 0 };

test("shows the fallback card when native is unavailable", async () => {
  await render(<ExportScreenBody project={project} state={{ status: "unavailable", ...base }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByText("Export needs the native build")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
});

test("idle: 4K disabled for HD sources, Export starts with the chosen resolution", async () => {
  const start = jest.fn();
  await render(<ExportScreenBody project={project} state={{ status: "idle", ...base }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByRole("button", { name: "4K" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "720p" }));
  await fireEvent.press(screen.getByRole("button", { name: "Export" }));
  expect(start).toHaveBeenCalledWith(720);
});

test("missing clips are left out of the 4K check and the size estimate", async () => {
  const uhd = makeClip({ id: "u", sourceDuration: 60, width: 2160, height: 3840 });
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), uhd] });
  await render(<ExportScreenBody project={p} missingSourceUris={[uhd.sourceUri]} state={{ status: "idle", ...base }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByRole("button", { name: "4K" })).toBeDisabled();
  expect(screen.getByText("Estimated size: 10 MB")).toBeTruthy(); // 8 s at 10 Mbps
});

test("done: shows Save, Share, Done", async () => {
  await render(<ExportScreenBody project={project} state={{ status: "done", progress: 1, fileUri: "file:///x.mp4" }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByText("Save to Photos")).toBeTruthy();
  expect(screen.getByText("Share…")).toBeTruthy();
});
