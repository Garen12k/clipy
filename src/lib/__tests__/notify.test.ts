jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn() };
});
const mockLoads = { count: 0, broken: false };
const mockApi = {
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(), scheduleNotificationAsync: jest.fn(async () => "id"),
  setNotificationHandler: jest.fn(),
};
jest.mock("expo-notifications", () => {
  mockLoads.count += 1;
  if (mockLoads.broken) throw new Error("Cannot find native module 'ExpoNotificationScheduler'");
  return mockApi;
});
import { requireOptionalNativeModule } from "expo-modules-core";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

type Notify = typeof import("../notify");
/** A fresh copy of the wrapper (it asks for the package once), in an app whose native module is or is not there. */
function fresh(native: boolean): Notify {
  jest.mocked(requireOptionalNativeModule).mockReturnValue((native ? {} : null) as never);
  let m: Notify | undefined;
  jest.isolateModules(() => { m = require("../notify") as Notify; });
  return m!;
}
const perm = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? "granted" : "undetermined", expires: "never" });

beforeEach(() => { jest.clearAllMocks(); mockLoads.count = 0; mockLoads.broken = false; });

test("an older build (no native module): importing is safe, nothing is loaded, and every call quietly answers no", async () => {
  mockLoads.broken = true;                      // the package would throw if anything loaded it
  const n = fresh(false);
  expect(n.notifyAvailable()).toBe(false);
  expect(await n.askToNotify()).toBe(false);
  expect(await n.notifyDone("Done", "Your video is ready.")).toBe(false);
  expect(requireOptionalNativeModule).toHaveBeenCalledWith("ExpoNotificationScheduler");
  expect(mockLoads.count).toBe(0);
});

test("a native module that is there but a package that throws on load: still no, never a crash", async () => {
  mockLoads.broken = true;
  const n = fresh(true);
  expect(n.notifyAvailable()).toBe(false);
  expect(await n.notifyDone("Done", "Your video is ready.")).toBe(false);
  expect(mockLoads.count).toBe(1);              // asked once
});

test("nothing asks for permission until askToNotify is called; an allowed phone is not asked again", async () => {
  const n = fresh(true);
  expect(n.notifyAvailable()).toBe(true);
  expect(mockApi.getPermissionsAsync).not.toHaveBeenCalled();
  expect(mockApi.requestPermissionsAsync).not.toHaveBeenCalled();
  mockApi.getPermissionsAsync.mockResolvedValue(perm(true));
  expect(await n.askToNotify()).toBe(true);
  expect(mockApi.requestPermissionsAsync).not.toHaveBeenCalled();
});

test("askToNotify asks once for alerts and sound (no badge), and says what the owner chose", async () => {
  const n = fresh(true);
  mockApi.getPermissionsAsync.mockResolvedValue(perm(false));
  mockApi.requestPermissionsAsync.mockResolvedValue(perm(true));
  expect(await n.askToNotify()).toBe(true);
  expect(mockApi.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  mockApi.requestPermissionsAsync.mockResolvedValue(perm(false, false));
  expect(await n.askToNotify()).toBe(false);
  // Refused for good: iOS would not show its question again, so it is not asked.
  mockApi.requestPermissionsAsync.mockClear();
  mockApi.getPermissionsAsync.mockResolvedValue(perm(false, false));
  expect(await n.askToNotify()).toBe(false);
  expect(mockApi.requestPermissionsAsync).not.toHaveBeenCalled();
  mockApi.getPermissionsAsync.mockRejectedValue(new Error("boom"));
  expect(await n.askToNotify()).toBe(false);
});

test("notifyDone shows a local notification now — only when allowed, and it never asks", async () => {
  const n = fresh(true);
  mockApi.getPermissionsAsync.mockResolvedValue(perm(false));
  expect(await n.notifyDone("Done", "Your video is ready.")).toBe(false);
  expect(mockApi.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(mockApi.requestPermissionsAsync).not.toHaveBeenCalled();
  mockApi.getPermissionsAsync.mockResolvedValue(perm(true));
  expect(await n.notifyDone("Done", "Your video is ready.")).toBe(true);
  expect(mockApi.scheduleNotificationAsync).toHaveBeenCalledWith({ content: { title: "Done", body: "Your video is ready." }, trigger: null });
  expect(await n.notifyDone("Again", "Second.")).toBe(true);
  expect(mockApi.setNotificationHandler).toHaveBeenCalledTimes(1);          // the handler is set once
  const handler = mockApi.setNotificationHandler.mock.calls[0][0] as { handleNotification: () => Promise<unknown> };
  expect(await handler.handleNotification()).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  mockApi.scheduleNotificationAsync.mockRejectedValueOnce(new Error("boom"));
  expect(await n.notifyDone("Done", "x")).toBe(false);
});

const root = join(__dirname, "..", "..", "..");
function sources(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules" && name !== "ios") walk(p); }
      else if (/\.tsx?$/.test(name)) out.push({ rel: p.slice(root.length + 1).split("\\").join("/"), src: readFileSync(p, "utf8") });
    }
  };
  for (const d of ["src", "app", "modules"]) walk(join(root, d));
  return out;
}

test("each new native package is loaded in ONE file, lazily and guarded — never by a top-level import", () => {
  const HOME: Record<string, string> = { "expo-symbols": "src/ui/sfSymbols.ts", "expo-glass-effect": "src/ui/systemGlass.ts", "expo-notifications": "src/lib/notify.ts" };
  const GUARD: Record<string, string> = { "expo-symbols": "SymbolModule", "expo-glass-effect": "ExpoGlassEffect", "expo-notifications": "ExpoNotificationScheduler" };
  const all = sources();
  for (const [pkg, home] of Object.entries(HOME)) {
    expect(all.filter((f) => f.src.includes(`"${pkg}"`)).map((f) => f.rel)).toEqual([home]);
    const src = all.find((f) => f.rel === home)!.src;
    // The only mentions: a type-only import (erased) or `typeof import(…)`, and one `require(…)` inside the guarded function.
    const valueImports = [...src.matchAll(/^import (?!type )[^\n]*from "([^"]+)"/gm)].map((m) => m[1]);
    expect(valueImports).not.toContain(pkg);
    expect(src.split(`require("${pkg}")`).length - 1).toBe(1);
    const guard = src.indexOf(`requireOptionalNativeModule("${GUARD[pkg]}")`);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf(`require("${pkg}")`));
    expect(src.slice(src.lastIndexOf("try {", guard), src.indexOf(`require("${pkg}")`))).toContain("try {");
  }
  // expo-system-ui is a build-time setting only (app.json's root background): no JavaScript loads it.
  expect(all.filter((f) => f.src.includes("expo-system-ui")).map((f) => f.rel)).toEqual([]);
});

test("no screen notifies yet: only the wrapper's own file names its functions", () => {
  expect(sources().filter((f) => /notifyDone\(|askToNotify\(|lib\/notify"/.test(f.src)).map((f) => f.rel)).toEqual(["src/lib/notify.ts"]);
});
