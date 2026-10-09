import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
const FILE = "file:///cache/exports/p1-1.mp4";
const baseParams = { fileUri: FILE, durationSec: "21", mimeType: "video/mp4", projectId: "p1", title: "Beach day" };
let mockParams: Record<string, string | undefined> = { ...baseParams };
let mockFocus: (() => void) | null = null;
const mockFocusers = new Set<() => void>();
const mockNav = { addListener: jest.fn(() => () => {}), setOptions: jest.fn(), dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNav,
  // Like the real hook: runs once when the screen first gets focus; tests call mockFocus() to simulate coming back.
  // Several components on the screen use it (the form, the sign-in card): coming back runs each one's latest callback.
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    const latest = React.useRef(cb); latest.current = cb;
    React.useEffect(() => {
      const run = () => latest.current();
      mockFocusers.add(run); mockFocus = () => { for (const f of [...mockFocusers]) f(); };
      cb();
      return () => { mockFocusers.delete(run); };
    }, []);
  },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: jest.fn() }));
jest.mock("expo-file-system", () => ({ Paths: { cache: { uri: "file:///cache/" }, document: { uri: "file:///doc/" } } }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../usePost", () => ({ usePost: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn() }));
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import PostScreen from "@/app/post";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { fileSize } from "@/src/lib/fileInfo";
import { theme } from "@/src/theme/theme";
import { IDLE_ROW } from "../runPost";
import { useAccounts } from "../useAccounts";
import { usePost } from "../usePost";
import { useSession } from "../useSession";

const acct = (id: string, over = {}) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
const accounts = (yt = {}, tt = {}) => ({ status: "ready", platforms: [acct("youtube", { available: true, connected: true, name: "My Channel", ...yt }), acct("tiktok", tt), acct("instagram"), acct("facebook"), acct("x")], error: null, busy: null, refresh: jest.fn(async () => {}), connect: jest.fn(), disconnect: jest.fn() });
const rows = (yt = {}, tt = {}) => ({ youtube: { ...IDLE_ROW, ...yt }, tiktok: { ...IDLE_ROW, ...tt }, instagram: IDLE_ROW, facebook: IDLE_ROW, x: IDLE_ROW });
const TT_ON = { available: true, connected: true, name: "@sunny" };
const TT_NOTE = "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).";
const TT_CAPTION = "TikTok doesn't receive this caption — you'll write it in TikTok.";
const post = (over = {}) => ({ rows: rows(), busy: false, start: jest.fn(), retry: jest.fn(), cancel: jest.fn(), ...over });
const usePostReturns = (p: ReturnType<typeof post>) => (usePost as jest.Mock).mockImplementation((_v, cb) => { onPosted = cb; return p; });
let onPosted: (p: string, url: string | null) => void;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { ...baseParams }; mockFocus = null; mockFocusers.clear();
  (fileSize as jest.Mock).mockReturnValue(14000000);
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: null });
  (useAccounts as jest.Mock).mockReturnValue(accounts());
  usePostReturns(post());
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day" }));
});
afterEach(() => { if (jest.isMockFunction(Alert.alert)) (Alert.alert as jest.Mock).mockRestore(); });

test("signed out shows only the sign-in card", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
  expect(router.push).toHaveBeenCalledWith("/welcome");
  expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  expect(useAccounts).toHaveBeenCalledWith(false);
});

test("YouTube is ticked by default with its note; unavailable platforms say why; Post sends the job", async () => {
  const p = post(); usePostReturns(p);
  await render(<PostScreen />);
  expect(screen.getByText("0:21 · 14 MB")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "YouTube" })).toBeChecked();
  expect(screen.getByText(/private until Google reviews/i)).toBeTruthy();
  expect(screen.getAllByText("Not available yet")).toHaveLength(4);
  await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny #beach");
  expect(screen.getByText("12 / 5000")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Post" }));
  expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "Sunny #beach", options: { title: "Beach day", privacy: "public" } }]);
  expect(Haptics.impactAsync).toHaveBeenCalled();
});

test("unticking everything disables Post; a not-connected platform links to Accounts", async () => {
  const first = await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
  expect(screen.getByRole("checkbox", { name: "YouTube" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  await first.unmount();
  (useAccounts as jest.Mock).mockReturnValue(accounts({ connected: false, name: null }));
  await render(<PostScreen />);
  expect(screen.getByText("Not connected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Connect YouTube" }));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

test("a caption over the smallest limit turns the counter red and disables Post", async () => {
  await render(<PostScreen />);
  await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(5001));
  expect(screen.getByText("5001 / 5000")).toHaveStyle({ color: theme.colors.dangerText });
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
});

test("options sheet edits the YouTube title and privacy; blank title and caption block posting with a reason", async () => {
  const p = post(); usePostReturns(p);
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "YouTube options" }));
  expect(screen.getByText("YouTube options")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("YouTube title"), "Best day");
  expect(screen.getByText("8 / 100")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Unlisted" }));
  expect(screen.getByRole("button", { name: "Unlisted" })).toBeSelected();
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  await fireEvent.press(screen.getByRole("button", { name: "Post" }));
  expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "", options: { title: "Best day", privacy: "unlisted" } }]);
  await fireEvent.press(screen.getByRole("button", { name: "YouTube options" }));
  await fireEvent.changeText(screen.getByLabelText("YouTube title"), "  ");
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  expect(screen.getByText("Add a caption or a title for YouTube.")).toBeTruthy();
  expect(screen.getByText(/private until Google reviews/i)).toBeTruthy(); // the note stays next to the message
  expect(screen.getByRole("checkbox", { name: "YouTube" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  // tapping the held-back row opens its options instead of unticking it
  await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
  expect(screen.getByLabelText("YouTube title")).toBeTruthy();
});

test("a library video (no title) posts with its caption; with neither, YouTube asks for one", async () => {
  const p = post(); usePostReturns(p);
  mockParams = { ...baseParams, title: undefined, projectId: undefined };
  await render(<PostScreen />);
  expect(screen.getByText("Add a caption or a title for YouTube.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny");
  expect(screen.queryByText("Add a caption or a title for YouTube.")).toBeNull();
  expect(screen.getByRole("checkbox", { name: "YouTube" })).toBeChecked();
  await fireEvent.press(screen.getByRole("button", { name: "YouTube options" }));
  expect(screen.getByLabelText("YouTube title")).toHaveProp("placeholder", "Uses your caption");
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  await fireEvent.press(screen.getByRole("button", { name: "Post" }));
  expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "Sunny", options: { title: "", privacy: "public" } }]);
});

test("Retry and Resume follow the Post rule: an over-limit caption disables them with the reason; fixing it re-enables", async () => {
  for (const resumable of [false, true]) {
    const p = post({ rows: rows({ phase: "failed", message: "The connection dropped.", resumable }) }); usePostReturns(p);
    const view = await render(<PostScreen />);
    const name = resumable ? "Resume YouTube" : "Retry YouTube";
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(5001));
    expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByText("YouTube descriptions can be up to 5000 characters.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(p.retry).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Short");
    expect(screen.getByRole("button", { name })).toBeEnabled();
    expect(screen.queryByText("YouTube descriptions can be up to 5000 characters.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(p.retry).toHaveBeenCalledWith({ platform: "youtube", caption: "Short", options: { title: "Beach day", privacy: "public" } });
    await view.unmount();
  }
});

test("Resume after reconnecting is also held back by an invalid row", async () => {
  const p = post({ rows: rows({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." }) }); usePostReturns(p);
  mockParams = { ...baseParams, title: undefined };
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  await act(async () => { mockFocus!(); });
  expect(screen.getByRole("button", { name: "Resume YouTube" })).toBeDisabled();
  expect(screen.getByText("Add a caption or a title for YouTube.")).toBeTruthy();
});

test("a posted row shows a static mark, not a checkbox", async () => {
  usePostReturns(post({ rows: rows({ phase: "done", progress: 1, url: "https://youtu.be/abc" }) }));
  await render(<PostScreen />);
  expect(screen.queryByRole("checkbox", { name: "YouTube" })).toBeNull();
  expect(screen.getByLabelText("YouTube, posted")).toBeTruthy();
});

test("row phases: uploading shows percent, done links out, failed offers Retry or Resume, reconnect links to Accounts", async () => {
  const p = post();
  const render1 = async (yt: object) => { Object.assign(p, { rows: rows(yt) }); usePostReturns(p); return render(<PostScreen />); };
  const a = await render1({ phase: "uploading", progress: 0.42 });
  expect(screen.getByText("42%")).toBeTruthy();
  expect(screen.getByRole("progressbar")).toBeTruthy(); await a.unmount();
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const b = await render1({ phase: "done", progress: 1, url: "https://youtu.be/abc" });
  expect(screen.getByText("Done")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "View on YouTube" }));
  expect(open).toHaveBeenCalledWith("https://youtu.be/abc"); open.mockRestore(); await b.unmount();
  const b2 = await render1({ phase: "done", progress: 1, url: null, message: "Still processing on YouTube — check the app later." });
  expect(screen.getByText("Still processing on YouTube — check the app later.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "View on YouTube" })).toBeNull(); await b2.unmount();
  const c = await render1({ phase: "failed", message: "The video has been rejected.", resumable: false });
  expect(screen.getByText("The video has been rejected.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Retry YouTube" }));
  expect(p.retry).toHaveBeenCalledWith({ platform: "youtube", caption: "", options: { title: "Beach day", privacy: "public" } }); await c.unmount();
  const d = await render1({ phase: "failed", message: "The connection dropped.", resumable: true });
  expect(screen.getByRole("button", { name: "Resume YouTube" })).toBeTruthy(); await d.unmount();
  await render1({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." });
  expect(screen.getByText("Reconnect youtube in Accounts.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

test("after reconnecting in Accounts and coming back, the row offers Resume", async () => {
  const p = post({ rows: rows({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." }) }); usePostReturns(p);
  const acc = accounts({ needsReconnect: true }); (useAccounts as jest.Mock).mockReturnValue(acc);
  await render(<PostScreen />);
  expect(acc.refresh).not.toHaveBeenCalled(); // useAccounts loads on mount; the first focus doesn't reload
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  expect(router.push).toHaveBeenCalledWith("/accounts");
  expect(screen.queryByRole("button", { name: "Resume YouTube" })).toBeNull();
  // back on the screen: accounts refresh on focus and now show YouTube connected again
  const healthy = accounts(); (useAccounts as jest.Mock).mockReturnValue(healthy);
  await act(async () => { mockFocus!(); });
  expect(acc.refresh).toHaveBeenCalledTimes(1); // the focus callback of the last render
  expect(screen.getByText("My Channel")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Resume YouTube" }));
  expect(p.retry).toHaveBeenCalledWith({ platform: "youtube", caption: "", options: { title: "Beach day", privacy: "public" } });
});

test("still expired after coming back: the row keeps offering Reconnect", async () => {
  usePostReturns(post({ rows: rows({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." }) }));
  (useAccounts as jest.Mock).mockReturnValue(accounts({ needsReconnect: true }));
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  await act(async () => { mockFocus!(); });
  expect(screen.queryByRole("button", { name: "Resume YouTube" })).toBeNull();
  expect(screen.getByRole("button", { name: "Reconnect YouTube" })).toBeTruthy();
});

test("a finished post is recorded on the open project", async () => {
  await render(<PostScreen />);
  await act(() => { onPosted("youtube", "https://youtu.be/abc"); });
  expect(useEditorStore.getState().project!.posts).toEqual([{ platform: "youtube", url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" }]);
  expect(Haptics.notificationAsync).toHaveBeenCalled();
});

test("a finished TikTok post (no link) is recorded on the open project with url null", async () => {
  await render(<PostScreen />);
  await act(() => { onPosted("tiktok", null); });
  expect(useEditorStore.getState().project!.posts).toEqual([{ platform: "tiktok", url: null, postedAt: "2026-10-02T10:00:00.000Z" }]);
});

test("a post for a different (or no) project is not recorded", async () => {
  mockParams = { ...baseParams, projectId: undefined };
  await render(<PostScreen />);
  await act(() => { onPosted("youtube", "https://youtu.be/abc"); });
  expect(useEditorStore.getState().project!.posts).toEqual([]);
});

test("Post is disabled while uploads are running", async () => {
  usePostReturns(post({ rows: rows({ phase: "uploading", progress: 0.1 }), busy: true }));
  await render(<PostScreen />);
  expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
});

test("leaving while uploads run asks first; Stop cancels and then leaves", async () => {
  const p = post({ rows: rows({ phase: "uploading", progress: 0.1 }), busy: true }); usePostReturns(p);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<PostScreen />);
  expect(mockNav.setOptions).toHaveBeenCalledWith({ gestureEnabled: false });
  const listener = (mockNav.addListener.mock.calls as unknown as [string, (e: unknown) => void][]).find(([name]) => name === "beforeRemove")![1];
  const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled(); // goes through the same beforeRemove guard in the app
  await act(async () => { listener(e); });
  expect(e.preventDefault).toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith("Stop posting?", "Uploads in progress will be cancelled.", expect.any(Array));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  expect(buttons.map((b) => b.text)).toEqual(["Keep Posting", "Stop"]);
  await act(async () => { buttons.find((b) => b.text === "Stop")!.onPress!(); });
  expect(p.cancel).toHaveBeenCalled();
  expect(mockNav.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
});

test("leaving when nothing is running is not interrupted", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<PostScreen />);
  const listener = (mockNav.addListener.mock.calls as unknown as [string, (e: unknown) => void][]).find(([name]) => name === "beforeRemove")![1];
  const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
  await act(async () => { listener(e); });
  expect(e.preventDefault).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test("Share… opens the share sheet for the same file", async () => {
  await render(<PostScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Share…" }));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(FILE, { mimeType: "video/mp4", UTI: "public.mpeg-4" });
});

test.each([
  ["missing duration", { durationSec: undefined }, 14000000],
  ["NaN duration", { durationSec: "abc" }, 14000000],
  ["no file param", { fileUri: undefined }, 14000000],
  ["an https URI", { fileUri: "https://evil.example/v.mp4" }, 14000000],
  ["a file outside cache/documents", { fileUri: "file:///etc/passwd" }, 14000000],
  ["a path with ..", { fileUri: "file:///cache/../etc/passwd" }, 14000000],
  ["a missing / zero-size file", {}, 0],
])("untrusted or odd params (%s) show a message instead of throwing", async (_n, over, size) => {
  (fileSize as jest.Mock).mockReturnValue(size);
  mockParams = { ...baseParams, ...over };
  await render(<PostScreen />);
  expect(screen.getByText("This video can't be posted.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
  expect(usePost).not.toHaveBeenCalled();
});

describe("TikTok", () => {
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("TikTok is ticked by default with its note and has no options button", async () => {
    await render(<PostScreen />);
    expect(screen.getByRole("checkbox", { name: "TikTok" })).toBeChecked();
    expect(screen.getByText("@sunny")).toBeTruthy();
    expect(screen.getByText(TT_NOTE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "TikTok options" })).toBeNull();
    expect(screen.getByRole("button", { name: "YouTube options" })).toBeTruthy();
    expect(screen.getByText(TT_CAPTION)).toBeTruthy();
    expect(screen.getAllByText("Not available yet")).toHaveLength(3);
    // tapping the row unticks it (there is no options sheet to open); the caption line goes with it
    await fireEvent.press(screen.getByRole("checkbox", { name: "TikTok" }));
    expect(screen.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
    expect(screen.queryByText("TikTok options")).toBeNull();
    expect(screen.queryByText(TT_CAPTION)).toBeNull();
  });

  test("with only TikTok ticked the counter has no limit, never turns red and the caption can't block it", async () => {
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(6000));
    expect(screen.getByText("6000")).not.toHaveStyle({ color: theme.colors.dangerText });
    expect(screen.queryByText(/\/ 5000/)).toBeNull();
    expect(screen.getByText(TT_CAPTION)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "x".repeat(6000), options: {} }]);
  });

  test("with YouTube and TikTok ticked the limit is YouTube's; an over-long caption blocks YouTube only", async () => {
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny");
    expect(screen.getByText("5 / 5000")).toBeTruthy();
    expect(screen.getByText(TT_CAPTION)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([
      { platform: "youtube", caption: "Sunny", options: { title: "Beach day", privacy: "public" } },
      { platform: "tiktok", caption: "Sunny", options: {} },
    ]);
    p.start.mockClear();
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(5001));
    expect(screen.getByText("5001 / 5000")).toHaveStyle({ color: theme.colors.dangerText });
    expect(screen.getByText("YouTube descriptions can be up to 5000 characters.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "x".repeat(5001), options: {} }]);
  });

  test("a finished TikTok row with no link shows the draft note and no View button", async () => {
    usePostReturns(post({ rows: rows({}, { phase: "done", progress: 1, url: null }) }));
    await render(<PostScreen />);
    expect(screen.getByText("Sent to TikTok — open TikTok to finish posting.")).toBeTruthy();
    expect(screen.getByLabelText("TikTok, posted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View on TikTok" })).toBeNull();
    expect(screen.queryByText(TT_NOTE)).toBeNull();
  });

  test("a done row without a link prefers its own message over the done note", async () => {
    usePostReturns(post({ rows: rows({}, { phase: "done", progress: 1, url: null, message: "Still processing on TikTok — check the app later." }) }));
    await render(<PostScreen />);
    expect(screen.getByText("Still processing on TikTok — check the app later.")).toBeTruthy();
    expect(screen.queryByText("Sent to TikTok — open TikTok to finish posting.")).toBeNull();
  });

  test("an 11-minute video holds TikTok back while YouTube still posts", async () => {
    const p = post(); usePostReturns(p);
    mockParams = { ...baseParams, durationSec: String(11 * 60) };
    await render(<PostScreen />);
    expect(screen.getByText("TikTok accepts videos up to 10 minutes.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "youtube", caption: "", options: { title: "Beach day", privacy: "public" } }]);
  });

  test("names stay unique with two platforms on screen: Retry, Connect and Reconnect per platform", async () => {
    const p = post({ rows: rows({ phase: "failed", message: "The connection dropped.", resumable: false }, { phase: "failed", message: "The TikTok upload link expired. Post again.", resumable: false }) }); usePostReturns(p);
    const a = await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Retry YouTube" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry TikTok" }));
    expect(p.retry).toHaveBeenCalledWith({ platform: "tiktok", caption: "", options: {} });
    await a.unmount();
    (useAccounts as jest.Mock).mockReturnValue(accounts({ connected: false, name: null }, { available: true }));
    usePostReturns(post());
    const b = await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Connect YouTube" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Connect TikTok" }));
    expect(router.push).toHaveBeenCalledWith("/accounts");
    await b.unmount();
    (useAccounts as jest.Mock).mockReturnValue(accounts({ needsReconnect: true }, { ...TT_ON, needsReconnect: true }));
    await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Reconnect YouTube" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect TikTok" })).toBeTruthy();
  });
});

describe("Instagram and Facebook", () => {
  const IG_ON = { available: true, connected: true, name: "@sunny.reels" };
  const FB_ON = { available: true, connected: true, name: "Sunny Surf Page" };
  const IG_NOTE = "Posts as a Reel. Instagram can take a few minutes to process — keep this screen open.";
  const FB_NOTE = "Posts as a Reel on your Page. Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you.";
  const IG_TIMEOUT = "Instagram is still processing the video. Tap Resume in a minute to finish posting.";
  type Over = Partial<Record<"youtube" | "tiktok" | "instagram" | "facebook" | "x", object>>;
  /** All five platforms; YouTube connected as in `accounts()`, Instagram and Facebook connected unless overridden. */
  const accounts5 = (over: Over = {}) => {
    const a = accounts(over.youtube, over.tiktok);
    a.platforms = [a.platforms[0], a.platforms[1], acct("instagram", { ...IG_ON, ...over.instagram }), acct("facebook", { ...FB_ON, ...over.facebook }), acct("x", over.x)];
    return a;
  };
  const rows5 = (over: Over = {}) => ({ youtube: { ...IDLE_ROW, ...over.youtube }, tiktok: { ...IDLE_ROW, ...over.tiktok }, instagram: { ...IDLE_ROW, ...over.instagram }, facebook: { ...IDLE_ROW, ...over.facebook }, x: { ...IDLE_ROW, ...over.x } });
  const YT_JOB = { platform: "youtube", caption: "", options: { title: "Beach day", privacy: "public" } };
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts5()); });

  test("both are ticked by default with their account, their notes and no options buttons", async () => {
    await render(<PostScreen />);
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Facebook" })).toBeChecked();
    expect(screen.getByText("@sunny.reels")).toBeTruthy();
    expect(screen.getByText("Sunny Surf Page")).toBeTruthy();
    expect(screen.getByText(IG_NOTE)).toBeTruthy();
    expect(screen.getByText(FB_NOTE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Instagram options" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Facebook options" })).toBeNull();
    expect(screen.getAllByText("Not available yet")).toHaveLength(2); // TikTok and X
    // tapping a row unticks it and its note goes with it
    await fireEvent.press(screen.getByRole("checkbox", { name: "Facebook" }));
    expect(screen.getByRole("checkbox", { name: "Facebook" })).not.toBeChecked();
    expect(screen.queryByText(FB_NOTE)).toBeNull();
    expect(screen.queryByText("Facebook options")).toBeNull();
  });

  test("a 2-minute video holds Facebook back with its reason while Instagram and YouTube still post", async () => {
    const p = post(); usePostReturns(p);
    mockParams = { ...baseParams, durationSec: "120" };
    await render(<PostScreen />);
    expect(screen.getByText("Facebook Reels can be up to 90 seconds.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Facebook" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([YT_JOB, { platform: "instagram", caption: "", options: {} }]);
  });

  test("a 2-second video holds both Reels back; YouTube still posts", async () => {
    const p = post(); usePostReturns(p);
    mockParams = { ...baseParams, durationSec: "2" };
    await render(<PostScreen />);
    expect(screen.getByText("Instagram Reels must be at least 3 seconds.")).toBeTruthy();
    expect(screen.getByText("Facebook Reels must be at least 3 seconds.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([YT_JOB]);
  });

  test("with YouTube and Instagram ticked the caption limit is 2200; unticking Instagram lifts it to 5000", async () => {
    const p = post(); usePostReturns(p);
    (useAccounts as jest.Mock).mockReturnValue(accounts5({ facebook: { connected: false, name: null } }));
    await render(<PostScreen />);
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny");
    expect(screen.getByText("5 / 2200")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(2201));
    expect(screen.getByText("2201 / 2200")).toHaveStyle({ color: theme.colors.dangerText });
    expect(screen.getByText("Instagram captions can be up to 2200 characters.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    // Instagram has no options, so tapping its held-back row unticks it
    await fireEvent.press(screen.getByRole("checkbox", { name: "Instagram" }));
    expect(screen.getByText("2201 / 5000")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ ...YT_JOB, caption: "x".repeat(2201) }]);
  });

  test("a resumable Instagram timeout shows its message and Resume Instagram, which sends the Instagram job", async () => {
    const p = post({ rows: rows5({ instagram: { phase: "failed", message: IG_TIMEOUT, resumable: true } }) }); usePostReturns(p);
    await render(<PostScreen />);
    expect(screen.getByText(IG_TIMEOUT)).toBeTruthy();
    expect(screen.queryByText(/upload again/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry Instagram" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Resume Instagram" }));
    expect(p.retry).toHaveBeenCalledWith({ platform: "instagram", caption: "", options: {} });
    // the row that already ran is not sent again by Post
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([YT_JOB, { platform: "facebook", caption: "", options: {} }]);
  });

  test("Post sends one job per ticked valid platform", async () => {
    const p = post(); usePostReturns(p);
    (useAccounts as jest.Mock).mockReturnValue(accounts5({ tiktok: TT_ON }));
    await render(<PostScreen />);
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny");
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledTimes(1);
    expect(p.start).toHaveBeenCalledWith([
      { ...YT_JOB, caption: "Sunny" },
      { platform: "tiktok", caption: "Sunny", options: {} },
      { platform: "instagram", caption: "Sunny", options: {} },
      { platform: "facebook", caption: "Sunny", options: {} },
    ]);
  });

  test("with all five platforms on screen every accessible name is unique", async () => {
    const p = post({ rows: rows5({
      youtube: { phase: "failed", message: "The connection dropped.", resumable: false },
      tiktok: { phase: "failed", message: "The TikTok upload link expired. Post again.", resumable: false },
      instagram: { phase: "failed", message: IG_TIMEOUT, resumable: true },
      facebook: { phase: "done", progress: 1, url: "https://www.facebook.com/reel/1" },
    }) }); usePostReturns(p);
    (useAccounts as jest.Mock).mockReturnValue(accounts5({ tiktok: TT_ON }));
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const a = await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Retry YouTube" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry TikTok" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume Instagram" })).toBeTruthy();
    expect(screen.getByLabelText("Facebook, posted")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "View on Facebook" }));
    expect(open).toHaveBeenCalledWith("https://www.facebook.com/reel/1"); open.mockRestore();
    await a.unmount();
    (useAccounts as jest.Mock).mockReturnValue(accounts5({ youtube: { connected: false, name: null }, tiktok: { available: true }, instagram: { connected: false, name: null }, facebook: { connected: false, name: null } }));
    usePostReturns(post());
    const b = await render(<PostScreen />);
    for (const l of ["YouTube", "TikTok", "Instagram", "Facebook"]) expect(screen.getByRole("button", { name: `Connect ${l}` })).toBeTruthy();
    await b.unmount();
    (useAccounts as jest.Mock).mockReturnValue(accounts5());
    usePostReturns(post({ rows: rows5({ instagram: { phase: "uploading", progress: 0.5 }, facebook: { phase: "uploading", progress: 0.25 } }) }));
    await render(<PostScreen />);
    expect(screen.getByLabelText("Uploading to Instagram")).toBeTruthy();
    expect(screen.getByLabelText("Uploading to Facebook")).toBeTruthy();
  });

  describe("X", () => {
    const X_ON = { available: true, connected: true, name: "@sunnysurf" };
    const X_COST = "Posting to X costs about 1.5¢ (about 20¢ if the caption has a link). The video goes through Clipy's server in small pieces.";
    const X_LINK = "This caption contains a link — X charges about 20¢ for posts with links.";
    const X_TOO_LONG = "X posts can be up to 280 characters (emoji and links count extra).";
    const X_UNCONFIRMED = "X didn't confirm the post. It may already be on your profile — check X before posting again. Retry will upload the video again.";
    const X_TIMEOUT = "X is still processing the video. Tap Resume in a minute to finish posting.";
    beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts5({ x: X_ON })); });

    test("X available and connected: ticked with its account and cost note, no options button", async () => {
      await render(<PostScreen />);
      expect(screen.getByRole("checkbox", { name: "X" })).toBeChecked();
      expect(screen.getByText("@sunnysurf")).toBeTruthy();
      expect(screen.getByText(X_COST)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "X options" })).toBeNull();
      expect(screen.queryByText(X_LINK)).toBeNull();
      expect(screen.getAllByText("Not available yet")).toHaveLength(1); // TikTok only
      await fireEvent.press(screen.getByRole("checkbox", { name: "X" }));
      expect(screen.getByRole("checkbox", { name: "X" })).not.toBeChecked();
      expect(screen.queryByText(X_COST)).toBeNull();
    });

    test("a caption with a link (a bare domain too) shows X's link price under the row", async () => {
      await render(<PostScreen />);
      await fireEvent.changeText(screen.getByLabelText("Caption"), "More at clipy.app");
      expect(screen.getByText(X_LINK)).toBeTruthy();
      expect(screen.getByText(X_COST)).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText("Caption"), "Beach day");
      expect(screen.queryByText(X_LINK)).toBeNull();
      // only while X is ticked
      await fireEvent.changeText(screen.getByLabelText("Caption"), "More at clipy.app");
      await fireEvent.press(screen.getByRole("checkbox", { name: "X" }));
      expect(screen.queryByText(X_LINK)).toBeNull();
    });

    test("with X ticked the caption limit is 280 and the counter turns red at 281", async () => {
      const p = post(); usePostReturns(p);
      await render(<PostScreen />);
      await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(280));
      expect(screen.getByText("280 / 280")).not.toHaveStyle({ color: theme.colors.dangerText });
      await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(281));
      expect(screen.getByText("281 / 280")).toHaveStyle({ color: theme.colors.dangerText });
      expect(screen.getByText(X_TOO_LONG)).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: "X" })).not.toBeChecked();
      // X has no options, so tapping its held-back row unticks it and the limit goes back to Instagram's
      await fireEvent.press(screen.getByRole("checkbox", { name: "X" }));
      expect(screen.getByText("281 / 2200")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Post" }));
      const c = "x".repeat(281);
      expect(p.start).toHaveBeenCalledWith([{ ...YT_JOB, caption: c }, { platform: "instagram", caption: c, options: {} }, { platform: "facebook", caption: c, options: {} }]);
    });

    test("wide characters weigh 2 on X: 141 of them hold X back while the others still post", async () => {
      const p = post(); usePostReturns(p);
      await render(<PostScreen />);
      const c = "日".repeat(141); // 141 characters, weight 282
      await fireEvent.changeText(screen.getByLabelText("Caption"), c);
      expect(screen.getByText("141 / 280")).not.toHaveStyle({ color: theme.colors.dangerText });
      expect(screen.getByText(X_TOO_LONG)).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: "X" })).not.toBeChecked();
      await fireEvent.press(screen.getByRole("button", { name: "Post" }));
      expect(p.start).toHaveBeenCalledWith([{ ...YT_JOB, caption: c }, { platform: "instagram", caption: c, options: {} }, { platform: "facebook", caption: c, options: {} }]);
    });

    test("all five connected: Post sends five jobs", async () => {
      const p = post(); usePostReturns(p);
      (useAccounts as jest.Mock).mockReturnValue(accounts5({ tiktok: TT_ON, x: X_ON }));
      await render(<PostScreen />);
      expect(screen.queryByText("Not available yet")).toBeNull();
      await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny");
      await fireEvent.press(screen.getByRole("button", { name: "Post" }));
      expect(p.start).toHaveBeenCalledTimes(1);
      expect(p.start).toHaveBeenCalledWith([
        { ...YT_JOB, caption: "Sunny" },
        { platform: "tiktok", caption: "Sunny", options: {} },
        { platform: "instagram", caption: "Sunny", options: {} },
        { platform: "facebook", caption: "Sunny", options: {} },
        { platform: "x", caption: "Sunny", options: {} },
      ]);
    });

    test("Retry X, Resume X and View on X: unique names next to the other four", async () => {
      (useAccounts as jest.Mock).mockReturnValue(accounts5({ tiktok: TT_ON, x: X_ON }));
      const p = post({ rows: rows5({
        youtube: { phase: "failed", message: "The connection dropped.", resumable: false },
        tiktok: { phase: "failed", message: "The TikTok upload link expired. Post again.", resumable: false },
        instagram: { phase: "failed", message: IG_TIMEOUT, resumable: true },
        facebook: { phase: "done", progress: 1, url: "https://www.facebook.com/reel/1" },
        x: { phase: "failed", message: X_UNCONFIRMED, resumable: false },
      }) }); usePostReturns(p);
      const a = await render(<PostScreen />);
      expect(screen.getByText(X_UNCONFIRMED)).toBeTruthy();
      for (const name of ["Retry YouTube", "Retry TikTok", "Resume Instagram", "View on Facebook", "Retry X"]) expect(screen.getAllByRole("button", { name })).toHaveLength(1);
      await fireEvent.press(screen.getByRole("button", { name: "Retry X" }));
      expect(p.retry).toHaveBeenCalledWith({ platform: "x", caption: "", options: {} });
      await a.unmount();

      const p2 = post({ rows: rows5({ instagram: { phase: "failed", message: IG_TIMEOUT, resumable: true }, x: { phase: "failed", message: X_TIMEOUT, resumable: true } }) }); usePostReturns(p2);
      const b = await render(<PostScreen />);
      expect(screen.getByText(X_TIMEOUT)).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Resume X" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Resume Instagram" })).toHaveLength(1);
      await fireEvent.press(screen.getByRole("button", { name: "Resume X" }));
      expect(p2.retry).toHaveBeenCalledWith({ platform: "x", caption: "", options: {} });
      await b.unmount();

      const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
      usePostReturns(post({ rows: rows5({ facebook: { phase: "done", progress: 1, url: "https://www.facebook.com/reel/1" }, x: { phase: "done", progress: 1, url: "https://x.com/i/status/123" } }) }));
      await render(<PostScreen />);
      expect(screen.getByLabelText("X, posted")).toBeTruthy();
      expect(screen.queryByText(X_COST)).toBeNull();
      await fireEvent.changeText(screen.getByLabelText("Caption"), "More at clipy.app");
      expect(screen.queryByText(X_LINK)).toBeNull(); // the link-price note is hidden on a done row
      await fireEvent.press(screen.getByRole("button", { name: "View on X" }));
      expect(open).toHaveBeenCalledWith("https://x.com/i/status/123");
      expect(screen.getAllByRole("button", { name: "View on Facebook" })).toHaveLength(1);
      open.mockRestore();
    });

    test("Connect X and Reconnect X", async () => {
      (useAccounts as jest.Mock).mockReturnValue(accounts5({ x: { available: true } }));
      const a = await render(<PostScreen />);
      await fireEvent.press(screen.getByRole("button", { name: "Connect X" }));
      expect(router.push).toHaveBeenCalledWith("/accounts");
      await a.unmount();
      (useAccounts as jest.Mock).mockReturnValue(accounts5({ x: { ...X_ON, needsReconnect: true } }));
      await render(<PostScreen />);
      expect(screen.getByRole("button", { name: "Reconnect X" })).toBeTruthy();
    });
  });
});

test("a fileSize param is ignored: the size is always read from the file", async () => {
  (fileSize as jest.Mock).mockReturnValue(9000000);
  mockParams = { ...baseParams, fileSize: "1" };
  await render(<PostScreen />);
  expect(screen.getByText("0:21 · 9 MB")).toBeTruthy();
});

describe("cover frame", () => {
  const igOn = () => {
    const a = accounts(); a.platforms[2] = acct("instagram", { available: true, connected: true, name: "@me" });
    (useAccounts as jest.Mock).mockReturnValue(a);
  };
  const YT = { title: "Beach day", privacy: "public" };
  test("Post and Retry send thumbOffsetMs to Instagram only", async () => {
    igOn(); mockParams = { ...baseParams, coverMs: "2500" };
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([
      { platform: "youtube", caption: "", options: YT },
      { platform: "instagram", caption: "", options: { thumbOffsetMs: 2500 } },
    ]);
  });
  test("Retry sends it again", async () => {
    igOn(); mockParams = { ...baseParams, coverMs: "2500" };
    const p = post({ rows: { ...rows(), instagram: { ...IDLE_ROW, phase: "failed", message: "x", resumable: false } } }); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Retry Instagram" }));
    expect(p.retry).toHaveBeenCalledWith({ platform: "instagram", caption: "", options: { thumbOffsetMs: 2500 } });
  });
  test("without a cover nothing is added", async () => {
    igOn();
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([
      { platform: "youtube", caption: "", options: YT },
      { platform: "instagram", caption: "", options: {} },
    ]);
  });
});

describe("round 2 look (no behaviour)", () => {
  test("the caption is the kit field; Post is the one gold button; Share… is outlined", async () => {
    await render(<PostScreen />);
    expect(screen.getByLabelText("Caption")).toHaveStyle({ backgroundColor: theme.elevation.tile, fontSize: theme.type.input, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md, minHeight: 96 });
    expect(screen.getByLabelText("Caption")).toHaveProp("placeholder", "Write a caption…");
    expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
    expect(screen.getByTestId("primary-button")).toHaveAccessibleName("Post");
    expect(screen.getByRole("button", { name: "Share…" })).toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(screen.getByRole("header", { name: "Post" })).toHaveStyle({ fontSize: theme.type.screen });
  });

  test("a platform row is 56 pt; Options is a compact text-only button; a note under it is small", async () => {
    await render(<PostScreen />);
    expect(screen.getByTestId("post-row-youtube")).toHaveStyle({ minHeight: theme.size.listRow });
    const options = screen.getByRole("button", { name: "YouTube options" });
    expect(options).toHaveStyle({ height: theme.size.controlCompact });
    expect(options).not.toHaveStyle({ backgroundColor: theme.elevation.lifted });
    // The tick row itself fills the 56-pt row, so a tap above or below the text still lands.
    expect(screen.getByRole("checkbox", { name: "YouTube" })).toHaveStyle({ alignSelf: "stretch", alignItems: "center" });
    expect(screen.getByText(/private until Google reviews/i)).toHaveStyle({ fontSize: theme.type.small, color: theme.colors.textMuted });
  });

  test("Connect under its reason is a 44-pt target: 36 pt, 4 pt of slop each way, and 4 pt of room under the button", async () => {
    (useAccounts as jest.Mock).mockReturnValue(accounts({ connected: false, name: null }));
    await render(<PostScreen />);
    const column = screen.getByText("Not connected").parent!;
    expect(column).toHaveStyle({ alignItems: "flex-end", gap: theme.space.xs, paddingBottom: theme.space.xs });
  });

  test("a row's action is a compact outlined button; its error is red and a size larger than a note", async () => {
    usePostReturns(post({ rows: rows({ phase: "failed", message: "The video has been rejected.", resumable: false }) }));
    await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Retry YouTube" })).toHaveStyle({ height: theme.size.controlCompact, backgroundColor: theme.elevation.lifted });
    expect(screen.getByText("The video has been rejected.")).toHaveStyle({ fontSize: theme.type.label, color: theme.colors.dangerText });
  });

  test("uploading: the percentage does not jitter and the bar is a 4-pt pill", async () => {
    usePostReturns(post({ rows: rows({ phase: "uploading", progress: 0.42 }), busy: true }));
    await render(<PostScreen />);
    expect(screen.getByText("42%")).toHaveStyle({ fontSize: theme.type.label, fontVariant: ["tabular-nums"] });
    expect(screen.getByRole("progressbar")).toHaveStyle({ height: 4, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.tile });
  });
});
