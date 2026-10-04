import { readFileSync } from "fs";
import { join } from "path";

type Plugin = string | [string, Record<string, unknown>?];
const config = JSON.parse(readFileSync(join(__dirname, "..", "..", "app.json"), "utf8")) as {
  expo: { ios: { infoPlist: Record<string, unknown> }; plugins: Plugin[] };
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
