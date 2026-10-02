import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
const FILE = "file:///cache/exports/p1-1.mp4";
const baseParams = { fileUri: FILE, durationSec: "21", mimeType: "video/mp4", projectId: "p1", title: "Beach day" };
let mockParams: Record<string, string | undefined> = { ...baseParams };
let mockFocus: (() => void) | null = null;
const mockNav = { addListener: jest.fn(() => () => {}), setOptions: jest.fn(), dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNav,
  // Like the real hook: runs once when the screen first gets focus; tests call mockFocus() to simulate coming back.
  useFocusEffect: (cb: () => void) => { mockFocus = cb; require("react").useEffect(() => { cb(); }, []); },
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
  mockParams = { ...baseParams }; mockFocus = null;
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
  expect(screen.getByLabelText("Sign in with Apple")).toBeTruthy();
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
  expect(screen.getByText("5001 / 5000")).toHaveStyle({ color: theme.colors.danger });
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
  expect(buttons.map((b) => b.text)).toEqual(["Keep posting", "Stop"]);
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
    expect(screen.getByText("6000")).not.toHaveStyle({ color: theme.colors.danger });
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
    expect(screen.getByText("5001 / 5000")).toHaveStyle({ color: theme.colors.danger });
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

test("a fileSize param is ignored: the size is always read from the file", async () => {
  (fileSize as jest.Mock).mockReturnValue(9000000);
  mockParams = { ...baseParams, fileSize: "1" };
  await render(<PostScreen />);
  expect(screen.getByText("0:21 · 9 MB")).toBeTruthy();
});
