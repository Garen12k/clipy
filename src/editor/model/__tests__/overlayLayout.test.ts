import { makeOverlay } from "../types";
import { frameSize, layoutOverlay } from "../overlayLayout";

const o = makeOverlay({ id: "o", x: 0.25, y: 0.75, fontScale: 0.1, scale: 1.5, rotation: 30, background: { color: "#000000", opacity: 0.5 } });

test("layoutOverlay scales with the frame (pinned numbers — the Swift mirror must match)", () => {
  expect(layoutOverlay(o, 300, 533)).toEqual({ centerX: 75, centerY: 399.75, fontSize: 79.95, maxWidth: 270, padding: 19.9875, outlineWidth: 2.3689, rotation: 30, lineHeight: 95.94 });
  expect(layoutOverlay(o, 1080, 1920)).toEqual({ centerX: 270, centerY: 1440, fontSize: 288, maxWidth: 972, padding: 72, outlineWidth: 8.5333, rotation: 30, lineHeight: 345.6 });
  expect(layoutOverlay({ ...o, background: null }, 1080, 1080).padding).toBe(0);
});

test("frameSize aspect-fits the ratio into a container", () => {
  expect(frameSize("9:16", 400, 400)).toEqual({ w: 225, h: 400 });
  expect(frameSize("16:9", 400, 400)).toEqual({ w: 400, h: 225 });
  expect(frameSize("1:1", 300, 500)).toEqual({ w: 300, h: 300 });
});
