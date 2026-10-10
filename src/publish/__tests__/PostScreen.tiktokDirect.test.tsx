import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
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

jest.mock("../useCreatorInfo", () => ({ useCreatorInfo: jest.fn(() => ({ state: { status: "idle" }, load: jest.fn() })) }));
import { clientAdapters } from "../adapters";
import { useCreatorInfo } from "../useCreatorInfo";
const creator = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
/** These tests start the TikTok row in a chosen state by replacing its defaults (the sheet that sets them is Task 4's). */
const startWith = (options: Record<string, unknown>) => jest.spyOn(clientAdapters.tiktok!, "defaultOptions").mockReturnValue(options);
afterEach(() => jest.restoreAllMocks());

describe("TikTok, Post now", () => {
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("ready: the caption is counted against 2200, the caption line is gone, the note carries the consent, and Post sends the seven keys", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", allowComment: true, creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.changeText(screen.getByLabelText("Caption"), "Sunny #beach");
    expect(screen.getByText("12 / 2200")).toBeTruthy();
    expect(screen.queryByText(/doesn't receive this caption/)).toBeNull();
    expect(screen.getByText(`Posting to Sunny. Who can see it: Only me. ${MUSIC} It may take a few minutes to appear.`)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "TikTok" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "Sunny #beach", options: { mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false } }]);
  });

  test("nothing chosen yet: the row says what is missing, is not ticked, Post is disabled, and a tap on the row opens its options", async () => {
    startWith({ mode: "direct", creator });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByText("Choose who can see it in the TikTok options.")).toBeTruthy();
    expect(screen.getByText("Post now publishes to your TikTok profile.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "TikTok" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "TikTok" }));
    expect(screen.getByText("TikTok options")).toBeTruthy();
  });

  test("a caption over 2200 holds TikTok back and never YouTube under its own limit", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(2201));
    expect(screen.getByText("2201 / 2200")).toBeTruthy();
    expect(screen.getAllByText("Captions can be up to 2200 characters.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  test("done: a direct post says it is posted; a draft still says it was sent", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    usePostReturns(post({ rows: rows({}, { phase: "done", progress: 1, url: null }) }));
    await render(<PostScreen />);
    expect(screen.getByText("Posted to TikTok. It may take a few minutes to appear.")).toBeTruthy();
    expect(screen.queryByText("Sent to TikTok — open TikTok to finish posting.")).toBeNull();
  });

  test("back to a draft after choosing things: Post sends options {} and the caption line is back", async () => {
    startWith({ mode: "draft", privacy: "SELF_ONLY", allowComment: true, creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByText("TikTok doesn't receive this caption — you'll write it in TikTok.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: {} }]);
  });
});

describe("TikTok options on the Post screen", () => {
  const creatorMock = (state: unknown, load = jest.fn()) => { (useCreatorInfo as jest.Mock).mockReturnValue({ state, load }); return load; };
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("opening the options of a draft asks TikTok nothing; choosing Post now asks once", async () => {
    const load = creatorMock({ status: "idle" });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    expect(screen.getByText("TikTok options")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send as draft" })).toBeSelected();
    expect(load).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("Post now from the sheet to Post: choose who can see it, close, Post sends the direct job", async () => {
    creatorMock({ status: "ready", info: creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled(); // nothing chosen yet
    await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: { mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false } }]);
  });

  test("Reconnect closes the sheet, starts the existing connect flow for TikTok and opens the sheet again", async () => {
    jest.useFakeTimers();
    try {
      creatorMock({ status: "needsPermission" });
      const a = accounts({}, TT_ON); (a.connect as jest.Mock).mockResolvedValue(undefined);
      (useAccounts as jest.Mock).mockReturnValue(a);
      startWith({ mode: "direct" });
      await render(<PostScreen />);
      await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
      await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
      expect(screen.queryByText("TikTok options")).toBeNull();
      expect(a.connect).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(350); });
      expect(a.connect).toHaveBeenCalledWith("tiktok");
      await act(async () => {});
      expect(screen.getByText("TikTok options")).toBeTruthy();
      expect(router.push).not.toHaveBeenCalledWith("/accounts");
    } finally { jest.useRealTimers(); }
  });
});

describe("after the review", () => {
  const creatorMock = (state: unknown, load = jest.fn()) => { (useCreatorInfo as jest.Mock).mockReturnValue({ state, load }); return load; };
  const PRIVATE_ONLY = "TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options.";
  const OPEN = "Open the TikTok options to finish setting up Post now.";
  const beforeRemove = () => (mockNav.addListener.mock.calls as unknown as [string, (e: unknown) => void][]).find(([name]) => name === "beforeRemove")![1];
  beforeEach(() => { (useAccounts as jest.Mock).mockReturnValue(accounts({}, TT_ON)); });

  test("a refused Post now: the failed row has Options beside Retry, and after choosing Send as draft there Retry sends the CURRENT options", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    creatorMock({ status: "ready", info: creator });
    const p = post({ rows: rows({}, { phase: "failed", message: PRIVATE_ONLY, resumable: false }) }); usePostReturns(p);
    await render(<PostScreen />);
    expect(screen.getByText(PRIVATE_ONLY)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry TikTok" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    expect(screen.getByRole("button", { name: "Post now" })).toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Send as draft" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await fireEvent.press(screen.getByRole("button", { name: "Retry TikTok" }));
    expect(p.retry).toHaveBeenCalledTimes(1);
    expect(p.retry).toHaveBeenCalledWith({ platform: "tiktok", caption: "", options: {} });
  });

  test("a refused choice: Options, choose again, and Retry sends the new choice", async () => {
    startWith({ mode: "direct", privacy: "FOLLOWER_OF_CREATOR", creator });
    creatorMock({ status: "ready", info: creator });
    const p = post({ rows: rows({}, { phase: "failed", message: "TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again.", resumable: false }) }); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await fireEvent.press(screen.getByRole("button", { name: "Retry TikTok" }));
    expect(p.retry).toHaveBeenCalledWith({ platform: "tiktok", caption: "", options: { mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false } });
  });

  test("Options is offered only where a fresh post is what Retry does: not on a resumable TikTok row, not on a reconnect row, never on another platform's failed row", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    usePostReturns(post({ rows: rows({ phase: "failed", message: "The video has been rejected.", resumable: false }, { phase: "failed", message: "TikTok is busy — wait a minute, then try again.", resumable: true }) }));
    const a = await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Resume TikTok" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "TikTok options" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry YouTube" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "YouTube options" })).toBeNull();
    await a.unmount();
    usePostReturns(post({ rows: rows({}, { phase: "needsReconnect", message: "Reconnect tiktok in Accounts." }) }));
    await render(<PostScreen />);
    expect(screen.getByRole("button", { name: "Reconnect TikTok" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "TikTok options" })).toBeNull();
  });

  test("the answer that arrives after the sheet was closed still reaches the options", async () => {
    creatorMock({ status: "loading" });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    expect(screen.getByText(OPEN)).toBeTruthy();
    creatorMock({ status: "ready", info: creator });
    await screen.rerender(<PostScreen />);
    expect(screen.queryByText(OPEN)).toBeNull();
    expect(screen.getByText("Choose who can see it in the TikTok options.")).toBeTruthy();
  });

  test("a fresh answer drops a choice TikTok no longer offers even with the sheet closed: Post cannot go out with the old one", async () => {
    startWith({ mode: "direct", privacy: "PUBLIC_TO_EVERYONE", allowDuet: true, creator: { ...creator, privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], duetDisabled: false } });
    creatorMock({ status: "loading" });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
    creatorMock({ status: "ready", info: creator });
    await screen.rerender(<PostScreen />);
    expect(screen.getByText("Choose who can see it in the TikTok options.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  test("a draft is never written to by an answer", async () => {
    startWith({ mode: "draft", privacy: "PUBLIC_TO_EVERYONE" });
    creatorMock({ status: "ready", info: creator });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: {} }]);
    expect(screen.getByText(TT_NOTE)).toBeTruthy();
  });

  test("another TikTok account connected meanwhile: the old account's answer is dropped, the row no longer names it and Post waits for the options", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    expect(screen.getByText(/^Posting to Sunny\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
    (useAccounts as jest.Mock).mockReturnValue(accounts({}, { ...TT_ON, name: "@someone-else" }));
    await screen.rerender(<PostScreen />);
    expect(screen.queryByText(/Posting to Sunny/)).toBeNull();
    expect(screen.getByText(OPEN)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  test("the same account after a reload of the list keeps its answer", async () => {
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    await render(<PostScreen />);
    (useAccounts as jest.Mock).mockReturnValue(accounts({ name: "Renamed Channel" }, { ...TT_ON }));
    await screen.rerender(<PostScreen />);
    expect(screen.getByText(/^Posting to Sunny\./)).toBeTruthy();
  });

  test("Stop while a Post now upload runs says the video may still post", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    startWith({ mode: "direct", privacy: "SELF_ONLY", creator });
    usePostReturns(post({ rows: rows({}, { phase: "uploading", progress: 0.9 }), busy: true }));
    const a = await render(<PostScreen />);
    await act(async () => { beforeRemove()(e); });
    expect(alert).toHaveBeenLastCalledWith("Stop posting?", "Uploads in progress will be cancelled. If TikTok already has the video, it may still post — check your TikTok profile.", expect.any(Array));
    await a.unmount();
  });

  test.each([
    ["a draft upload", {}, { phase: "uploading", progress: 0.9 }],
    ["a Post now that is only being prepared (nothing sent yet)", { mode: "direct", privacy: "SELF_ONLY", creator }, { phase: "preparing" }],
  ])("Stop during %s keeps the old words", async (_n, options, row) => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    startWith(options);
    usePostReturns(post({ rows: rows({}, row), busy: true }));
    await render(<PostScreen />);
    await act(async () => { beforeRemove()({ preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } }); });
    expect(alert).toHaveBeenLastCalledWith("Stop posting?", "Uploads in progress will be cancelled.", expect.any(Array));
  });

  test.each([["error"], ["busy"]])("Reconnect that ends as %s leaves the sheet closed, so the message is not hidden under it", async (outcome) => {
    jest.useFakeTimers();
    try {
      creatorMock({ status: "needsPermission" });
      const a = accounts({}, TT_ON); (a.connect as jest.Mock).mockResolvedValue(outcome);
      (useAccounts as jest.Mock).mockReturnValue(a);
      startWith({ mode: "direct" });
      await render(<PostScreen />);
      await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
      await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
      await act(async () => { jest.advanceTimersByTime(350); });
      expect(a.connect).toHaveBeenCalledWith("tiktok");
      await act(async () => {});
      expect(screen.queryByText("TikTok options")).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  test.each([["ok"], ["cancelled"]])("Reconnect that ends as %s opens the sheet again", async (outcome) => {
    jest.useFakeTimers();
    try {
      creatorMock({ status: "needsPermission" });
      const a = accounts({}, TT_ON); (a.connect as jest.Mock).mockResolvedValue(outcome);
      (useAccounts as jest.Mock).mockReturnValue(a);
      startWith({ mode: "direct" });
      await render(<PostScreen />);
      await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
      await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
      await act(async () => { jest.advanceTimersByTime(350); });
      await act(async () => {});
      expect(screen.getByText("TikTok options")).toBeTruthy();
    } finally { jest.useRealTimers(); }
  });

  test("switched off on the server: the sheet says so with no Reconnect, and Send as draft goes out as ever", async () => {
    creatorMock({ status: "switchedOff" });
    const p = post(); usePostReturns(p);
    await render(<PostScreen />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "YouTube" }));
    await fireEvent.press(screen.getByRole("button", { name: "TikTok options" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
    expect(screen.getByText("Posting straight to TikTok isn't switched on yet. Choose Send as draft.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reconnect TikTok" })).toBeNull();
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Send as draft" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(p.start).toHaveBeenCalledWith([{ platform: "tiktok", caption: "", options: {} }]);
  });
});
