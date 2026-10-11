import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import type { CreatorInfo } from "../api";
import { TikTokOptions } from "../components/TikTokOptions";
import type { CreatorState } from "../useCreatorInfo";
import { leftovers, wear } from "@/src/ui/testing/appearance";

const info: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: "https://p16.tiktokcdn.com/a.jpeg", privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const ready: CreatorState = { status: "ready", info };
const MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
const BRANDED = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
function setup(options: Record<string, unknown> = {}, creator: CreatorState = { status: "idle" }) {
  const p = { options, creator, onChange: jest.fn(), onLoad: jest.fn(), onReconnect: jest.fn() };
  return { p, view: render(<TikTokOptions {...p} />) };
}
const direct = (over: Record<string, unknown> = {}) => ({ mode: "direct", creator: info, ...over });

test("a draft: the first control with Send as draft picked, its one explanation, and nothing asked from TikTok", async () => {
  const { p, view } = setup();
  await view;
  expect(screen.getByText("How to send")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send as draft" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Post now" })).not.toBeSelected();
  expect(screen.getByText("Clipy sends the video to your TikTok inbox. You add the caption and post it in TikTok.")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
  expect(p.onLoad).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Post now" }));
  expect(p.onChange).toHaveBeenCalledWith({ mode: "direct" });
  await fireEvent.press(screen.getByRole("button", { name: "Send as draft" }));
  expect(p.onChange).toHaveBeenLastCalledWith({ mode: "draft" });
});

test("Post now asks for the creator once when it is shown, and shows a spinner meanwhile", async () => {
  const { p, view } = setup({ mode: "direct" }, { status: "loading" });
  await view;
  expect(p.onLoad).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Checking your TikTok account")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
});

// The answer is written into the options by the Post screen (which outlives the sheet), not by the sheet: PostScreen.tiktokDirect.test.tsx.
test("an answer arriving while the sheet is shown makes the sheet write nothing itself", async () => {
  const { p, view } = setup({ mode: "direct", privacy: "PUBLIC_TO_EVERYONE", allowDuet: true }, ready);
  await view;
  expect(p.onChange).not.toHaveBeenCalled();
});

test("switched off on the server: the one sentence, and nothing to press but How to send", async () => {
  const { p, view } = setup({ mode: "direct" }, { status: "switchedOff" });
  await view;
  expect(screen.getByText("Posting straight to TikTok isn't switched on yet. Choose Send as draft.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reconnect TikTok" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
  expect(screen.queryByText("Who can see it")).toBeNull();
  expect(screen.queryByText(/one more permission/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Send as draft" }));
  expect(p.onChange).toHaveBeenLastCalledWith({ mode: "draft" });
});

test("ready: the account, only the offered choices with NOTHING picked, three switches off, the brand switch off, the consent and the wait", async () => {
  await setup(direct(), ready).view;
  expect(screen.getByText("Posting to Sunny")).toBeTruthy();
  expect(screen.getByTestId("tiktok-avatar").props.source).toEqual({ uri: "https://p16.tiktokcdn.com/a.jpeg" });
  expect(screen.getByText("Who can see it")).toBeTruthy();
  expect(screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["Followers", "Friends", "Only me"]);
  for (const r of screen.getAllByRole("radio")) expect(r).not.toBeChecked();
  expect(screen.queryByRole("radio", { name: "Everyone" })).toBeNull();
  for (const name of ["Allow comments", "Allow duet", "Allow stitch", "Promotes a brand or product"]) expect(screen.getByRole("switch", { name }).props.value).toBe(false);
  expect(screen.getByRole("switch", { name: "Allow comments" })).toBeEnabled();
  expect(screen.getByRole("switch", { name: "Allow duet" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Allow stitch" })).toBeDisabled();
  expect(screen.getAllByText("Turned off in your TikTok settings.")).toHaveLength(2);
  expect(screen.queryByRole("checkbox", { name: "Your brand" })).toBeNull();
  expect(screen.getByText(MUSIC)).toBeTruthy();
  expect(screen.getByText("It may take a few minutes to appear.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Music Usage Confirmation" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Branded Content Policy" })).toBeNull();
});

test("choosing and switching change one key each", async () => {
  const { p, view } = setup(direct(), ready);
  await view;
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
  expect(p.onChange).toHaveBeenLastCalledWith({ privacy: "SELF_ONLY" });
  await fireEvent(screen.getByRole("switch", { name: "Allow comments" }), "valueChange", true);
  expect(p.onChange).toHaveBeenLastCalledWith({ allowComment: true });
  await fireEvent(screen.getByRole("switch", { name: "Promotes a brand or product" }), "valueChange", true);
  expect(p.onChange).toHaveBeenLastCalledWith({ brand: true });
});

test("the picked choice is checked and says so by more than colour", async () => {
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR" }), ready).view;
  expect(screen.getByRole("radio", { name: "Followers" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Only me" })).not.toBeChecked();
  expect(screen.getByTestId("tiktok-picked-FOLLOWER_OF_CREATOR")).toBeTruthy();
  expect(screen.queryByTestId("tiktok-picked-SELF_ONLY")).toBeNull();
});

test("the brand switch on: two boxes, at least one needed, and how TikTok will label it", async () => {
  const a = setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true }), ready);
  await a.view;
  expect(screen.getByRole("checkbox", { name: "Your brand" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Branded content" })).not.toBeChecked();
  expect(screen.getByText("You need to indicate if your content promotes yourself, a third party, or both.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Your brand" }));
  expect(a.p.onChange).toHaveBeenLastCalledWith({ brandOrganic: true });
  await fireEvent.press(screen.getByRole("checkbox", { name: "Branded content" }));
  expect(a.p.onChange).toHaveBeenLastCalledWith({ brandContent: true });
  await (await a.view).unmount();
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true }), ready).view;
  expect(screen.getByText("Your video will be labeled as 'Promotional content'.")).toBeTruthy();
  expect(screen.getByText(MUSIC)).toBeTruthy();
});

test("branded content: the paid label, the longer consent with its second link, and Only me cannot be picked", async () => {
  const { p, view } = setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true, brandContent: true }), ready);
  await view;
  expect(screen.getByText("Your video will be labeled as 'Paid partnership'.")).toBeTruthy();
  expect(screen.getByText(BRANDED)).toBeTruthy();
  expect(screen.queryByText(MUSIC)).toBeNull();
  expect(screen.getByRole("button", { name: "Branded Content Policy" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Only me" })).toBeDisabled();
  expect(screen.getByText("Branded content visibility cannot be set to private.")).toBeTruthy();
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("radio", { name: "Only me" }));
  expect(p.onChange).not.toHaveBeenCalled();
});

test("Only me picked: the Branded content box cannot be ticked, and says why", async () => {
  const { p, view } = setup(direct({ privacy: "SELF_ONLY", brand: true }), ready);
  await view;
  expect(screen.getByRole("checkbox", { name: "Branded content" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Your brand" })).toBeEnabled();
  expect(screen.getByText("Branded content visibility cannot be set to private.")).toBeTruthy();
  p.onChange.mockClear();
  await fireEvent.press(screen.getByRole("checkbox", { name: "Branded content" }));
  expect(p.onChange).not.toHaveBeenCalled();
});

test("the links open TikTok's pages", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandContent: true }), ready).view;
  await fireEvent.press(screen.getByRole("button", { name: "Music Usage Confirmation" }));
  expect(open).toHaveBeenLastCalledWith("https://www.tiktok.com/legal/page/global/music-usage-confirmation/en");
  await fireEvent.press(screen.getByRole("button", { name: "Branded Content Policy" }));
  expect(open).toHaveBeenLastCalledWith("https://www.tiktok.com/legal/page/global/bc-policy/en");
  open.mockRestore();
});

test("no permission: one plain sentence and Reconnect; a failure: the server's sentence and Try Again", async () => {
  const a = setup({ mode: "direct" }, { status: "needsPermission" });
  await a.view;
  expect(screen.getByText("To post directly, TikTok needs one more permission. Reconnect TikTok and allow everything it asks for.")).toBeTruthy();
  expect(screen.queryByText("Who can see it")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect TikTok" }));
  expect(a.p.onReconnect).toHaveBeenCalledTimes(1);
  await (await a.view).unmount();
  const b = setup({ mode: "direct" }, { status: "error", message: "TikTok is busy — wait a minute, then try again." });
  await b.view;
  expect(screen.getByText("TikTok is busy — wait a minute, then try again.")).toBeTruthy();
  b.p.onLoad.mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
  expect(b.p.onLoad).toHaveBeenCalledTimes(1);
});

test("VoiceOver hears why a control cannot be used: the greyed switches, Only me under branded content, Branded content under Only me", async () => {
  const a = setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandContent: true }), ready);
  await a.view;
  expect(screen.getByRole("switch", { name: "Allow duet" }).props.accessibilityHint).toBe("Turned off in your TikTok settings.");
  expect(screen.getByRole("switch", { name: "Allow comments" }).props.accessibilityHint).toBeUndefined();
  expect(screen.getByRole("radio", { name: "Only me" }).props.accessibilityHint).toBe("Branded content visibility cannot be set to private.");
  expect(screen.getByRole("radio", { name: "Followers" }).props.accessibilityHint).toBeUndefined();
  await (await a.view).unmount();
  await setup(direct({ privacy: "SELF_ONLY", brand: true }), ready).view;
  expect(screen.getByRole("checkbox", { name: "Branded content" }).props.accessibilityHint).toBe("Branded content visibility cannot be set to private.");
  expect(screen.getByRole("checkbox", { name: "Your brand" }).props.accessibilityHint).toBeUndefined();
});

describe("in light", () => {
  afterEach(() => wear("dark"));
  test("the whole Post now body is cream: no navy surface, no white or bright-gold ink", async () => {
    wear("light");
    await setup(direct({ privacy: "FOLLOWER_OF_CREATOR", brand: true, brandOrganic: true, brandContent: true }), ready).view;
    expect(leftovers()).toEqual([]);
  });
});
