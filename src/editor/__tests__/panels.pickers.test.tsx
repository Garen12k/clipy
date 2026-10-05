import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
let mockNative = false;
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => mockNative, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { cancelTranscribe, transcribe } from "@/modules/clipy-video";
import { Dimensions } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { CaptionsSheet } from "../components/CaptionsSheet";
import { CaptionStyleSheet } from "../components/CaptionStyleSheet";
import { TemplateSheet } from "../components/TemplateSheet";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const H = Dimensions.get("window").height;
const btn = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  jest.clearAllMocks(); mockNative = false;
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], overlays: [makeOverlay({ id: "c1", kind: "caption", start: 0, end: 1 })] }));
});

describe("Templates", () => {
  test("is a regular panel: inline, no scrim, the scope chips in the lead, Done closes", async () => {
    const onClose = jest.fn();
    await render(<TemplateSheet clipId="a" visible onClose={onClose} />);
    expect(screen.getByRole("header", { name: "Templates" })).toBeTruthy();
    expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
    expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead });
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
    expect(btn("This clip")).toBeSelected();
    await fireEvent.press(btn("Done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a re-roll replaces the previous template in one undo step, as before", async () => {
    await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent.press(btn("Template Retro"));
    await fireEvent.press(btn("Template Neon"));
    expect(st().past).toHaveLength(1);
    expect(screen.getByText("Applied Neon · tap Undo to revert")).toBeTruthy();
  });

  test("after the user's own Undo a re-roll does not undo anything else, and the panel no longer claims a template is applied", async () => {
    st().apply((p) => renameProject(p, "Renamed"));                      // an earlier edit: one step
    await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent.press(btn("Template Retro"));
    expect(st().past).toHaveLength(2);
    await act(() => { st().undo(); });                                   // the transport row's Undo, reachable with the panel open
    expect(screen.queryByText(/Applied Retro/)).toBeNull();
    expect(btn("Template Retro")).not.toBeSelected();
    await fireEvent.press(btn("Template Neon"));
    expect(st().past).toHaveLength(2);
    expect(st().project!.name).toBe("Renamed");
    expect(screen.getByText("Applied Neon · tap Undo to revert")).toBeTruthy();
  });
});

describe("Caption style", () => {
  test("is a regular panel whose body is the one vertical scroll with its test id", async () => {
    await render(<CaptionStyleSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Caption style" })).toBeTruthy();
    expect(screen.getByTestId("caption-style-scroll")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - 96 });   // less the pinned sample
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
  });
});

describe("Captions", () => {
  test("is a compact panel; Style captions takes its place and Done there returns to it", async () => {
    await render(<CaptionsSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
    expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
    await fireEvent.press(btn("Style captions"));
    expect(screen.getAllByTestId("tool-panel")).toHaveLength(1);         // one panel at a time
    expect(screen.getByRole("header", { name: "Caption style" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Captions" })).toBeNull();
    await fireEvent.press(btn("Done"));
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Caption style" })).toBeNull();
  });

  test("hidden by its host while styling, it opens on Captions the next time", async () => {
    const view = await render(<CaptionsSheet visible onClose={() => {}} />);
    await fireEvent.press(btn("Style captions"));
    await view.rerender(<CaptionsSheet visible={false} onClose={() => {}} />);
    expect(screen.queryByTestId("tool-panel")).toBeNull();
    await view.rerender(<CaptionsSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
  });

  test("hidden by its host mid-run, the transcription is cancelled and nothing lands", async () => {
    mockNative = true;
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 2 })] }));
    let finish!: () => void;
    jest.mocked(transcribe).mockImplementation(() => new Promise((res) => { finish = () => res([{ text: "late", start: 0, end: 1 }]); }));
    const view = await render(<CaptionsSheet visible onClose={() => {}} />);
    const pressed = fireEvent.press(screen.getByText("Transcribe"));
    await new Promise((r) => setImmediate(r));
    expect(screen.getByText(/Transcribing clip 1 of 1/)).toBeTruthy();
    await view.rerender(<CaptionsSheet visible={false} onClose={() => {}} />);
    expect(cancelTranscribe).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pressed; });
    expect(st().project!.overlays).toEqual([]);
  });

  test("Replace with a caption selected: it is deselected and the panel re-keyed first, so replacing the captions does not close the panel", async () => {
    mockNative = true;
    jest.mocked(transcribe).mockResolvedValue([{ text: "hello there", start: 0, end: 1 }]);
    function Host() {
      useStripCloser();
      const open = useToolStrip((s) => s.open);
      return <CaptionsSheet visible={open?.id === "captions"} onClose={closeStrip} />;
    }
    await render(<Host />);
    await act(() => { st().selectOverlay("c1"); openStrip("captions"); });
    expect(useToolStrip.getState().open).toEqual({ id: "captions", key: "overlay:c1" });
    await fireEvent.press(screen.getByText("Replace"));
    expect(st().selectedOverlayId).toBeNull();
    expect(useToolStrip.getState().open).toEqual({ id: "captions", key: "none" });
    expect(st().project!.overlays.some((o) => o.id === "c1")).toBe(false);
    expect(screen.getByText("Added captions.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);   // the header's ✓ only
  });
});
