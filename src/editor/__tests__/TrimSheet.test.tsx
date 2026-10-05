import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { trimClip } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TrimSheet } from "../components/TrimSheet";

beforeEach(() => { useEditorStore.getState().reset(); });

test("a photo shows one Length field with helper text; Apply sets its length in one undo step", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 3 }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await render(<TrimSheet clipId="p" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Trim start")).toBeNull();
  expect(screen.getByText("How long the photo stays on screen (0.5 – 60 s)")).toBeTruthy();
  const field = screen.getByLabelText("Length");
  expect(field.props.value).toBe("3.0");
  await fireEvent.changeText(field, "7.5");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  const c = useEditorStore.getState().project!.clips[0];
  expect([c.trimStart, c.trimEnd]).toEqual([0, 7.5]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("a photo length is clamped to 0.5–60", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 3 })] }));
  await render(<TrimSheet clipId="p" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Length"), "500");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  expect(useEditorStore.getState().project!.clips[0].trimEnd).toBe(60);
});

test("a video still shows Start and End", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
  await render(<TrimSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Trim start")).toBeTruthy();
  expect(screen.getByLabelText("Trim end")).toBeTruthy();
  expect(screen.queryByLabelText("Length")).toBeNull();
});

describe("the fields follow the clip while the strip is open", () => {
  const st = () => useEditorStore.getState();
  const values = () => [screen.getByLabelText("Trim start").props.value, screen.getByLabelText("Trim end").props.value];
  const range = () => { const c = st().project!.clips[0]; return [c.trimStart, c.trimEnd]; };

  test("a trim from outside (a handle drag) and an Undo re-seed both fields, so Apply does not put the old numbers back", async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
    await render(<TrimSheet clipId="a" visible onClose={() => {}} />);
    expect(values()).toEqual(["0.0", "4.0"]);
    await act(() => { st().apply((p) => trimClip(p, "a", 1, 3)); });
    expect(values()).toEqual(["1.0", "3.0"]);
    await act(() => { st().undo(); });
    expect(values()).toEqual(["0.0", "4.0"]);
    await act(() => { st().redo(); });
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(range()).toEqual([1, 3]);
    expect(st().past).toHaveLength(1);                                   // Apply changed nothing: no step of its own
  });

  test("what is being typed stays while the clip does not change; a change from outside replaces it", async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
    await render(<TrimSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent(screen.getByLabelText("Trim start"), "focus");
    await fireEvent.changeText(screen.getByLabelText("Trim start"), "1.");
    await act(() => { st().apply((p) => trimClip(p, "b", 1, 2)); });      // another clip: this one's fields are left alone
    expect(values()).toEqual(["1.", "4.0"]);
    await act(() => { st().apply((p) => trimClip(p, "a", 0.5, 3.5)); });
    expect(values()).toEqual(["0.5", "3.5"]);
  });

  test("a photo's Length follows too", async () => {
    st().setProject(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 3 })] }));
    await render(<TrimSheet clipId="p" visible onClose={() => {}} />);
    await act(() => { st().apply((p) => trimClip(p, "p", 0, 6)); });
    expect(screen.getByLabelText("Length").props.value).toBe("6.0");
  });
});
