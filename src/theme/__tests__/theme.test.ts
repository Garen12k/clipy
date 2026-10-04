import { theme } from "../theme";
import { uiFontAssets } from "../uiFonts";

test("Grand Voyage tokens", () => {
  expect(theme.colors).toMatchObject({
    bg: "#0A1B33", bgDeep: "#081527", bgEnd: "#0C2542", surface: "#0E2440", surfaceAlt: "#17365C",
    accent: "#D9B36A", onAccent: "#0A1B33", text: "#F6E7C1", textMuted: "#9FB3CC",
    hairline: "rgba(217,179,106,0.45)", sea: "#1C6E9E", seaLight: "#2E86AB", danger: "#E5484D",
    laneText: "#D9B36A", laneSticker: "#E86A7A", laneMusic: "#3BA7C9",
  });
  expect(theme.radius).toEqual({ card: 12, chip: 8, tile: 7, sheet: 18, pill: 999 });
  expect(theme.fonts).toEqual({ title: "Oswald_700Bold", body: "Montserrat_400Regular", bodySemi: "Montserrat_600SemiBold", bodyBold: "Montserrat_800ExtraBold" });
  expect(theme.motion).toMatchObject({ press: 120, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000 });
});

test("audio lane colours: one per kind, all different from the other lanes", () => {
  expect(theme.colors).toMatchObject({ laneMusic: "#3BA7C9", laneVoice: "#4FA89B", laneSfx: "#E0916A" });
  const lanes = [theme.colors.laneText, theme.colors.laneSticker, theme.colors.laneMusic, theme.colors.laneEffect, theme.colors.laneVoice, theme.colors.laneSfx];
  expect(new Set(lanes).size).toBe(lanes.length);
});

test("layer lane colour: a muted steel blue, different from every other lane and from the timeline's own blues", () => {
  expect(theme.colors.laneLayer).toBe("#7F93B8");
  const c = theme.colors;
  const others = [c.laneText, c.laneSticker, c.laneMusic, c.laneEffect, c.laneVoice, c.laneSfx, c.sea, c.seaLight, c.textMuted, c.surfaceAlt];
  expect(others).not.toContain(c.laneLayer);
});

test("old tokens are gone", () => {
  for (const k of ["highlight", "straw", "accentPressed"]) expect(k in theme.colors).toBe(false);
  expect("heading" in theme.fonts).toBe(false);
  expect("projectsWallpaper" in theme).toBe(false);
});

test("UI font assets cover every theme font", () => {
  expect(Object.keys(uiFontAssets).sort()).toEqual(Object.values(theme.fonts).sort());
});
