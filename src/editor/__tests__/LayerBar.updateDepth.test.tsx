import { act, render, screen } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Text } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// A thumbnail takes longer than a frame on the phone: none arrives while the drag lasts.
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(() => new Promise<string>(() => {})) }));
import { makeClip, makeLayer, makePhotoClip, makeProject, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { NumField } from "@/src/ui/NumField";
import { FilterSheet } from "../components/FilterSheet";
import { LayerLane } from "../components/LayerLane";
import { TrimSheet } from "../components/TrimSheet";

// The editor as the toolbar builds it: the Trim strip is always mounted for the selected item (closed here), beside the layer lane.
// A handle drag is driven the way the phone delivers it when the JS thread is behind: the next gesture frame always arrives before
// React's own normal-priority task, so only microtasks run between two frames.

const st = () => useEditorStore.getState();
type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onEnd: () => void } };
const env = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean };

function Editor({ children }: { children?: (id: string | null) => React.ReactNode }) {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  return (<><LayerLane />{children?.(selectedId)}</>);
}

/** Drags a handle of layer `id` (the photo's end handle by default) `frames` frames of `px` points each; returns what a frame threw (null: nothing). */
async function dragFrames(frames: number, px: number, id = "ph", which: "start" | "end" = "end"): Promise<unknown> {
  await act(() => { st().select(id); });
  const g = screen.getByLabelText(`Layer ${which} handle`).props.gesture as G;
  let thrown: unknown = null;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    g.handlers.onStart();
    for (let i = 1; i <= frames; i++) {
      g.handlers.onUpdate({ translationX: i * px });
      await Promise.resolve(); await Promise.resolve();
    }
    g.handlers.onEnd();
  } catch (e) { thrown = e; } finally { env.IS_REACT_ACT_ENVIRONMENT = true; }
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return thrown;
}

beforeEach(() => {
  const layer: LayerClip = { ...makePhotoClip({ id: "ph", seconds: 0.5 }), start: 1 };
  st().reset(); st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], layers: [layer] })); st().setZoom(60);
});

test("a long handle drag of a 0.5 s photo layer never trips React's update-depth limit (the Trim strip is mounted, closed)", async () => {
  await render(<Editor>{(id) => <TrimSheet clipId={id} visible={false} onClose={() => {}} />}</Editor>);
  expect(await dragFrames(120, 3)).toBeNull();
  expect(st().project!.layers[0].trimEnd).toBeCloseTo(0.5 + 360 / 60, 6);
});

// The same way of following the selected item, in the other places that are on screen (or mounted, closed) during a gesture.

test("the Filter strip (mounted, closed) does not trip the limit while a video layer's start handle is dragged", async () => {
  const v = makeLayer({ id: "v", sourceDuration: 20, trimStart: 2, trimEnd: 18, start: 3 });
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], layers: [v] })); st().setZoom(60);
  await render(<Editor>{(id) => <FilterSheet clipId={id} visible={false} onClose={() => {}} />}</Editor>);
  expect(await dragFrames(120, 3, "v", "start")).toBeNull();
  expect(st().project!.layers[0].trimStart).toBeCloseTo(2 + 360 / 60, 6);
});

function Length({ id }: { id: string | null }) {
  const clip = useItemClip(id);
  return clip ? <NumField label="Length" value={Number(clip.trimEnd.toFixed(2))} onCommit={() => {}} /> : null;
}
test("a NumField whose value follows a gesture does not trip the limit, and still shows the stored value", async () => {
  await render(<Editor>{(id) => <Length id={id} />}</Editor>);
  expect(await dragFrames(120, 3)).toBeNull();
  expect(screen.getByLabelText("Length").props.value).toBe("6.5");
});

// ---- The mechanism, isolated (no app component but the lane): which way of following the item's trim is the one that throws ----

function SeedByEffect({ id }: { id: string | null }) {
  const clip = useItemClip(id);
  const [end, setEnd] = useState("0");
  useEffect(() => { if (clip) setEnd(clip.trimEnd.toFixed(1)); }, [clip?.id, clip?.trimEnd]);
  return <Text>{end}</Text>;
}
function SeedInRender({ id }: { id: string | null }) {
  const clip = useItemClip(id);
  const [end, setEnd] = useState("0");
  const seed = clip ? `${clip.id}|${clip.trimEnd}` : null;
  const [seeded, setSeeded] = useState<string | null>(null);
  if (clip && seed !== seeded) { setSeeded(seed); setEnd(clip.trimEnd.toFixed(1)); }
  return <Text>{end}</Text>;
}

test("mechanism: the lane alone survives the drag", async () => {
  await render(<Editor />);
  expect(await dragFrames(120, 3)).toBeNull();
});
test("mechanism: state set from an effect on every trim frame throws on the 52nd frame, in the gesture's own store write", async () => {
  await render(<Editor>{(id) => <SeedByEffect id={id} />}</Editor>);
  expect(String(await dragFrames(120, 3))).toMatch(/Maximum update depth exceeded/);
  expect(st().project!.layers[0].trimEnd).toBeCloseTo(0.5 + (52 * 3) / 60, 6);
});
test("mechanism: the same state adjusted during render does not", async () => {
  await render(<Editor>{(id) => <SeedInRender id={id} />}</Editor>);
  expect(await dragFrames(120, 3)).toBeNull();
  expect(screen.getByText("6.5")).toBeTruthy();
});
