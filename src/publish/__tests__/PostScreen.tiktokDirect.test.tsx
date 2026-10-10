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

jest.mock("../useCreatorInfo", () => ({ useCreatorInfo: jest.fn(() => ({ state: { status: "idle" }, load: jest.fn() })) }), { virtual: true });
import { clientAdapters } from "../adapters";
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
