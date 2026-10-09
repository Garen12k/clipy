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
  expect(config.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBe("Clipy uses the microphone to record voice-overs, the sound of videos you take, and to make captions from speech.");
});

const optionsOf = (name: string) => (config.expo.plugins.find((p) => Array.isArray(p) && p[0] === name) as [string, Record<string, unknown>] | undefined)?.[1];

// Without a camera usage text in the installed app iOS ENDS the app when the camera opens (`canUseCamera` in src/projects/camera.ts).
test("the camera has a usage text, and the photo texts are as they were", () => {
  expect(optionsOf("expo-image-picker")).toEqual({
    photosPermission: "Clipy needs access to your videos to import clips.",
    cameraPermission: "Clipy uses the camera to take photos and videos for your projects.",
  });
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

// Notifications are LOCAL only. The expo-notifications plugin always adds the push entitlement; plugins/withoutPushEntitlement.js
// takes it out again, and can only do so when it is listed BEFORE that plugin (a mod registered earlier runs later).
// `npx expo config --type introspect` is the proof: `ios.entitlements` must hold no `aps-environment`.
test("the app asks for no push entitlement: the plugin that removes it comes first, and nothing sets one by hand", () => {
  const names = config.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  expect(names[0]).toBe("./plugins/withoutPushEntitlement");
  expect(names.indexOf("expo-notifications")).toBeGreaterThan(0);
  expect(optionsOf("expo-notifications")).toBeUndefined();          // no options: no background remote notifications
  expect(config.expo.ios.entitlements?.["aps-environment"]).toBeUndefined();
  expect(config.expo.ios.infoPlist.UIBackgroundModes).toBeUndefined();
  const plugin = readFileSync(join(__dirname, "..", "..", "plugins", "withoutPushEntitlement.js"), "utf8");
  expect(plugin).toContain('delete c.modResults["aps-environment"];');
});

test("iPhone only, the same app as before: no Android or web block, the same identifier", () => {
  expect(Object.keys(config.expo)).not.toContain("android");
  expect(Object.keys(config.expo)).not.toContain("web");
  expect(config.expo.ios.bundleIdentifier).toBe("com.astinos.clipy");
});
