import { render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, Redirect: () => null, useFocusEffect: () => {} }));
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn(() => ({ status: "signedOut" })) }));
jest.mock("@/src/publish/useAccounts", () => ({ useAccounts: jest.fn(() => ({ status: "idle", platforms: [], busy: null, error: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn() })) }));
jest.mock("@/src/publish/supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn(), isBackendConfigured: () => false }));
jest.mock("@/modules/clipy-video/background", () => ({
  isBackgroundExportBuild: jest.fn(() => true),
  backgroundExportSupport: jest.fn(),
  beginBackgroundExport: jest.fn(async () => null),
  reportBackgroundExport: jest.fn(),
  endBackgroundExport: jest.fn(),
  addBackgroundExportListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("@/src/lib/id", () => ({ newId: () => "run-9" }));
import AccountsScreen from "@/app/accounts";
import { addBackgroundExportListener, backgroundExportSupport, beginBackgroundExport, endBackgroundExport, isBackgroundExportBuild, reportBackgroundExport } from "@/modules/clipy-video/background";
import { beginRun, SUPPORT, supportLabel } from "../backgroundExport";

const support = backgroundExportSupport as jest.Mock;
const build = isBackgroundExportBuild as jest.Mock;
let logged: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); build.mockReturnValue(true); support.mockReturnValue({ os: "27.0", continued: true, gpu: false }); logged = jest.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => logged.mockRestore());

describe("the readout", () => {
  test("its four values, from what the phone answers", () => {
    // Clipy asks for no GPU, so a phone that would allow one still pauses the video: the row says what HAPPENS, the log keeps the raw flag.
    expect(supportLabel({ os: "27.0", continued: true, gpu: true })).toBe("Stays alive, pauses the video");
    expect(supportLabel({ os: "27.0", continued: true, gpu: false })).toBe("Stays alive, pauses the video");
    expect(supportLabel({ os: "18.5", continued: false, gpu: false })).toBe("Pauses until you return");
    expect(supportLabel({ os: "18.5", continued: false, gpu: true })).toBe("Pauses until you return");     // no task, so nothing a GPU could be used in
    expect(supportLabel(null)).toBe("Needs the newest Clipy build");
    expect(SUPPORT).toEqual({ full: "Stays alive, pauses the video", alive: "Stays alive, pauses the video", pauses: "Pauses until you return", old: "Needs the newest Clipy build" });
    expect(Object.values(SUPPORT)).not.toContain("Full");
    support.mockReturnValue(null);
    expect(supportLabel()).toBe("Needs the newest Clipy build");
  });

  test("one plain row on the Accounts screen, under the Build row, in the same group; nothing to tap", async () => {
    await render(<AccountsScreen />);
    const row = screen.getByTestId("background-export-row");
    expect(row.props.accessibilityLabel).toBe("Background export: Stays alive, pauses the video");
    expect(screen.getByTestId("background-export-label")).toHaveTextContent("Stays alive, pauses the video", { exact: true });
    expect(row.props.onPress).toBeUndefined();
    const ids = JSON.stringify(screen.toJSON()).match(/"testID":"(welcome-again-row|build-row|background-export-row)"/g);
    expect(ids).toEqual(['"testID":"welcome-again-row"', '"testID":"build-row"', '"testID":"background-export-row"']);
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "..", "app", "accounts.tsx"), "utf8") as string;
    const stretch = src.slice(src.indexOf('testID="build-row"'), src.indexOf('testID="background-export-row"'));
    expect(stretch.length).toBeGreaterThan(0);
    expect(stretch).not.toContain("</Group>");
  });

  test("an app from before the function says so", async () => {
    support.mockReturnValue(null);
    await render(<AccountsScreen />);
    expect(screen.getByTestId("background-export-label")).toHaveTextContent("Needs the newest Clipy build", { exact: true });
  });
});

describe("one export as the phone is told about it", () => {
  test("on an older build beginRun does nothing at all: no native call, no listener, no log", () => {
    build.mockReturnValue(false);
    const run = beginRun("Exporting Beach day", "1080p", jest.fn());
    run.report(0.5); run.left(); run.back(); run.restarted(); run.end("done");
    for (const fn of [backgroundExportSupport, beginBackgroundExport, reportBackgroundExport, endBackgroundExport, addBackgroundExportListener]) expect(fn).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  test("begun with the title and the second line; progress is passed on in steps; the end is told once, with its outcome", async () => {
    const run = beginRun("Exporting Beach day", "1080p", jest.fn());
    expect(beginBackgroundExport).toHaveBeenCalledWith("run-9", "Exporting Beach day", "1080p");
    for (const p of [0, 0.001, 0.002, 0.01, 0.012, 0.5, 1, 1]) run.report(p);
    expect((reportBackgroundExport as jest.Mock).mock.calls.map((c) => c[1])).toEqual([0, 0.01, 0.5, 1, 1]);
    run.report(Number.NaN);
    run.end("done"); run.end("error"); run.end("cancelled");
    expect(endBackgroundExport).toHaveBeenCalledTimes(1);
    expect(endBackgroundExport).toHaveBeenCalledWith("run-9", true);
    run.report(0.7);
    expect(reportBackgroundExport).toHaveBeenCalledTimes(5);                      // nothing after the end
    await Promise.resolve();
  });

  test("a failed and a cancelled export end the task as unsuccessful", () => {
    for (const outcome of ["error", "cancelled"] as const) {
      jest.clearAllMocks();
      beginRun("Exporting x", "720p", jest.fn()).end(outcome);
      expect(endBackgroundExport).toHaveBeenCalledWith("run-9", false);
    }
  });

  test("the system's stop is the caller's cancel, for this run only and not after the end; an expiry cancels nothing", () => {
    const cancel = jest.fn();
    const run = beginRun("Exporting x", "720p", cancel);
    const tell = (addBackgroundExportListener as jest.Mock).mock.calls[0][0] as (e: { runId: string; type: "cancel" | "expired" }) => void;
    tell({ runId: "run-9", type: "expired" });
    tell({ runId: "another", type: "cancel" });
    expect(cancel).not.toHaveBeenCalled();
    tell({ runId: "run-9", type: "cancel" });
    expect(cancel).toHaveBeenCalledTimes(1);
    run.end("cancelled");
    tell({ runId: "run-9", type: "cancel" });
    expect(cancel).toHaveBeenCalledTimes(1);
    const sub = (addBackgroundExportListener as jest.Mock).mock.results[0].value as { remove: jest.Mock };
    expect(sub.remove).toHaveBeenCalledTimes(1);
  });

  test("a phone that refuses, or whose answer never comes, does not hold the export up: beginRun returns at once", () => {
    (beginBackgroundExport as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    const run = beginRun("Exporting x", "720p", jest.fn());
    run.report(0.3);
    expect(reportBackgroundExport).toHaveBeenCalledWith("run-9", 0.3);
    run.end("done");
    expect(endBackgroundExport).toHaveBeenCalledWith("run-9", true);
  });

  test("the log says what the phone supports at the start and what happened at the end: away for how long, restarted how often", () => {
    jest.useFakeTimers();
    try {
      const run = beginRun("Exporting Beach day", "1080p", jest.fn());
      run.left();
      jest.advanceTimersByTime(42000);
      run.back();
      run.restarted();
      run.end("done");
      const lines = logged.mock.calls.map((c) => `${c[0]} ${c[1]}`);
      expect(lines[0]).toBe('background export: start {"support":{"os":"27.0","continued":true,"gpu":false},"title":"Exporting Beach day"}');
      const end = lines.find((l) => l.startsWith("background export: end")) ?? "";
      expect(end).toContain('"outcome":"done"');
      expect(end).toContain('"leftTheApp":1');
      expect(end).toContain('"awaySeconds":42');
      expect(end).toContain('"restarts":1');
    } finally { jest.useRealTimers(); }
  });
});

test("a phone that reports the GPU: the row does not claim more, and the raw flag is still in the log", () => {
  support.mockReturnValue({ os: "27.0", continued: true, gpu: true });
  expect(supportLabel()).toBe("Stays alive, pauses the video");
  beginRun("Exporting x", "720p", jest.fn()).end("done");
  const lines = logged.mock.calls.map((c) => `${c[0]} ${c[1]}`);
  expect(lines[0]).toContain('"gpu":true');
  expect(lines.find((l) => l.startsWith("background export: end"))).toContain('"gpu":true');
});
