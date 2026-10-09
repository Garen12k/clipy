import { readFileSync } from "fs";
import { join } from "path";
import { Appearance } from "react-native";
import { appAppearance, applyAppearance } from "../appearance";

const root = join(__dirname, "..", "..", "..");

afterEach(() => jest.restoreAllMocks());

test("until the light palette exists the app is dark, whatever the phone says", () => {
  const set = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
  expect(appAppearance()).toBe("dark");
  applyAppearance();
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith("dark");
});

test("an app that cannot say its appearance still starts", () => {
  jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => { throw new Error("no native appearance"); });
  expect(() => applyAppearance()).not.toThrow();
});

test("it is said once, at the top of the root layout, before the splash is held — and nowhere else", () => {
  const layout = readFileSync(join(root, "app", "_layout.tsx"), "utf8");
  expect(layout.split("applyAppearance()").length - 1).toBe(1);
  expect(layout.indexOf("applyAppearance();")).toBeLessThan(layout.indexOf("SplashScreen.preventAutoHideAsync()"));
  expect(layout.indexOf("applyAppearance();")).toBeLessThan(layout.indexOf("export default function RootLayout"));
  const own = readFileSync(join(root, "src", "theme", "appearance.ts"), "utf8");
  expect(own.split("setColorScheme(").length - 1).toBe(1);
});

test("the installed app follows the phone, and what is behind the app while it starts is navy in both settings", () => {
  const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo;
  expect(app.userInterfaceStyle).toBe("automatic");
  expect(app.backgroundColor).toBe("#0A1B33");                       // the root view (needs expo-system-ui, a dependency)
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["expo-system-ui"]).toBeDefined();
  const splash = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-splash-screen") as [string, { backgroundColor: string; dark: { backgroundColor: string; image: string } }];
  expect(splash[1].backgroundColor).toBe("#0A1B33");
  expect(splash[1].dark).toEqual({ image: "./assets/splash-icon.png", backgroundColor: "#0A1B33" });
});
