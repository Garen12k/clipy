import { layerHit } from "../layerHit";
import { resolveClipMotion } from "../motion";
import { makeKeyframe, makeLayer, type ClipTransform, type LayerClip } from "../types";

const W = 270, H = 480;
const tf = (over: Partial<ClipTransform> = {}): ClipTransform => ({ scale: 0.4, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, ...over });
/** A 1080×1920 layer: at scale 0.4 in a 270×480 frame its box is 108×192 around the frame's centre (135, 240) + x / y. */
const layer = (id: string, over: Partial<ClipTransform> = {}, rest: Partial<LayerClip> = {}): LayerClip => makeLayer({ id, sourceDuration: 4, transform: tf(over), ...rest });
const still = (l: LayerClip) => ({ transform: l.transform, opacity: l.opacity });
const hit = (layers: LayerClip[], x: number, y: number, resolve = still) => layerHit(layers, { x, y }, W, H, resolve);

describe("layerHit", () => {
  test("inside the placed box → that layer; outside → null", () => {
    const a = layer("a");
    expect(hit([a], 135, 240)).toBe("a");
    expect(hit([a], 82, 145)).toBe("a");     // just inside the top-left corner (81, 144)
    expect(hit([a], 188, 335)).toBe("a");    // just inside the bottom-right corner (189, 336)
    expect(hit([a], 80, 240)).toBeNull();
    expect(hit([a], 190, 240)).toBeNull();
    expect(hit([a], 135, 143)).toBeNull();
    expect(hit([a], 135, 337)).toBeNull();
    expect(hit([], 135, 240)).toBeNull();
  });

  test("the box follows the layer's offset", () => {
    const a = layer("a", { x: 0.2, y: -0.1 });   // centre (189, 192)
    expect(hit([a], 189, 192)).toBe("a");
    expect(hit([a], 240, 192)).toBe("a");
    expect(hit([a], 100, 192)).toBeNull();
  });

  test("a 45° turn: the test runs against the rotated box, not its upright one", () => {
    const a = layer("a", { rotation: 45 });
    // Along the turned long axis (down-left / up-right on screen after a clockwise 45°): 90 px from the centre is inside (half-height 96).
    const d = 90 * Math.SQRT1_2;
    expect(hit([a], 135 - d, 240 + d)).toBe("a");
    expect(hit([a], 135 + d, 240 - d)).toBe("a");
    // The same distance along the turned short axis is outside (half-width 54).
    expect(hit([a], 135 + d, 240 + d)).toBeNull();
    expect(hit([a], 135 - d, 240 - d)).toBeNull();
    // Straight above the centre, 90 px: inside the upright box, outside the turned one (|u| = |v| = 63.6 > 54).
    expect(hit([a], 135, 150)).toBeNull();
    // Straight right of the centre, 70 px: outside the upright box (half-width 54), inside the turned one (49.5, 49.5).
    expect(hit([a], 205, 240)).toBe("a");
  });

  test("the direction of the turn matters (clockwise on screen, as the preview draws it)", () => {
    const d = 90 * Math.SQRT1_2;
    expect(hit([layer("a", { rotation: -45 })], 135 + d, 240 + d)).toBe("a");
    expect(hit([layer("a", { rotation: -45 })], 135 - d, 240 + d)).toBeNull();
  });

  test("overlap: the topmost (last in the list) wins; where only the lower one is, the lower one", () => {
    const low = layer("low"), top = layer("top", { x: 0.2 });   // top spans x 135–243
    expect(hit([low, top], 160, 240)).toBe("top");
    expect(hit([top, low], 160, 240)).toBe("low");
    expect(hit([low, top], 100, 240)).toBe("low");
    expect(hit([low, top], 230, 240)).toBe("top");
    expect(hit([low, top], 260, 240)).toBeNull();
  });

  test("flips do not change the hit box", () => {
    const a = layer("a", { x: 0.2, rotation: 45, flipH: true, flipV: true });
    const b = layer("b", { x: 0.2, rotation: 45 });
    for (const [x, y] of [[189, 240], [189 + 60, 240], [189 - 60, 240 + 60], [189, 150], [100, 100]]) {
      expect(hit([a], x, y) !== null).toBe(hit([b], x, y) !== null);
    }
    expect(hit([a], 189, 240)).toBe("a");
  });

  test("it uses the resolved (drawn) transform, and skips a layer that is all but invisible", () => {
    const moved = layer("m", {}, { keyframes: [makeKeyframe({ t: 0, x: 0, scale: 0.4 }), makeKeyframe({ t: 2, x: 0.4, scale: 0.4 })] });
    const at = (offset: number) => (l: LayerClip) => resolveClipMotion(l, offset);
    expect(hit([moved], 135, 240, at(0))).toBe("m");
    expect(hit([moved], 243, 240, at(0))).toBeNull();
    expect(hit([moved], 243, 240, at(2))).toBe("m");     // the picture is now around x = 243
    expect(hit([moved], 135, 240, at(2))).toBeNull();
    const low = layer("low"), ghost = layer("ghost", {}, { opacity: 0.01 });
    expect(hit([low, ghost], 135, 240)).toBe("low");
    expect(hit([ghost], 135, 240)).toBeNull();
    expect(hit([layer("faint", {}, { opacity: 0.02 })], 135, 240)).toBe("faint");
  });

  test("a point or frame that is not a number hits nothing", () => {
    const a = layer("a");
    expect(hit([a], NaN, 240)).toBeNull();
    expect(layerHit([a], { x: 135, y: 240 }, 0, H, still)).toBeNull();
    expect(layerHit([a], { x: 135, y: 240 }, W, NaN, still)).toBeNull();
  });
});
