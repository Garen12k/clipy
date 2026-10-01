import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TEMPLATE_IDS, TEMPLATES } from "@/src/editor/templates";
import { TemplateSheet } from "../components/TemplateSheet";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("renders Random plus one tile per template", async () => {
  await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Random template" })).toBeTruthy();
  for (const id of TEMPLATE_IDS) expect(screen.getByRole("button", { name: `Template ${TEMPLATES[id].label}` })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /template/i })).toHaveLength(9);
});

test("This clip applies to the selected clip only; Whole project applies to every clip", async () => {
  await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Template Retro" }));
  let s = useEditorStore.getState();
  expect(s.project!.clips.map((c) => c.filter)).toEqual(["vintage", null]);
  expect(s.project!.overlays).toHaveLength(2);
  expect(s.past).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Whole project" }));
  await fireEvent.press(screen.getByRole("button", { name: "Template Minimal" }));
  s = useEditorStore.getState();
  expect(s.project!.clips.map((c) => c.filter)).toEqual(["mono", "mono"]);
  expect(s.past).toHaveLength(2);
});

test("Random applies a template different from the last one", async () => {
  await render(<TemplateSheet clipId={null} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Template Hype" }));
  const spy = jest.spyOn(Math, "random").mockReturnValue(0);
  await fireEvent.press(screen.getByRole("button", { name: "Random template" }));
  spy.mockRestore();
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual([null, null]);   // "clean" (first id after excluding hype) → no filter
  expect(useEditorStore.getState().past).toHaveLength(2);
});

test("This clip is disabled and Whole project selected when no clip is selected", async () => {
  await render(<TemplateSheet clipId={null} visible onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "This clip" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Whole project" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Template Retro" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["vintage", "vintage"]);
});
