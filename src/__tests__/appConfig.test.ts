import { readFileSync } from "fs";
import { join } from "path";

type Plugin = string | [string, Record<string, unknown>?];
const config = JSON.parse(readFileSync(join(__dirname, "..", "..", "app.json"), "utf8")) as {
  expo: { icon: string; ios: { icon: Record<string, string>; infoPlist: Record<string, unknown>; bundleIdentifier: string; entitlements?: Record<string, unknown> }; plugins: Plugin[] };
};

// `microphonePermission: false` makes a config plugin DELETE NSMicrophoneUsageDescription from the native build: voice-over
// recording and speech captions would then be refused by iOS.
test("no config plugin switches the microphone permission off", () => {
  const off = config.expo.plugins.filter((p) => Array.isArray(p) && p[1]?.microphonePermission === false).map((p) => (p as [string])[0]);
  expect(off).toEqual([]);
});

test("the app's own microphone usage text is set", () => {
  expect(config.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe("Clipy uses the microphone to record voice-overs and to make captions from speech.");
});

// The icon is drawn at docs/design/icon and made by scripts/gen-brand.mjs. Apple refuses an app icon with an alpha channel, and
// Expo lays a see-through tinted icon on WHITE — so all three are opaque (PNG colour type 2 = RGB, no alpha).
test("the icon has its light, dark and tinted pictures, each 1024 x 1024 with no alpha", () => {
  expect(config.expo.icon).toBe("./assets/icon.png");
  expect(config.expo.ios.icon).toEqual({ light: "./assets/icon.png", dark: "./assets/icon-dark.png", tinted: "./assets/icon-tinted.png" });
  for (const file of Object.values(config.expo.ios.icon)) {
    const png = readFileSync(join(__dirname, "..", "..", file));
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1024, 1024, 2]);
  }
});
