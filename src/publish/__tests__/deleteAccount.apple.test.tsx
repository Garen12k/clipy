import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, Redirect: () => null, useFocusEffect: (cb: () => void) => { require("react").useEffect(() => { cb(); }, []); } }));
jest.mock("../useSession", () => ({ useSession: jest.fn(() => ({ status: "signedIn", email: "me@privaterelay.appleid.com" })) }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn(), deleteAccount: jest.fn(), appleIdentity: jest.fn(), confirmWithApple: jest.fn() }));
import AccountsScreen from "@/app/accounts";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { appleIdentity, confirmWithApple, deleteAccount, signOut } from "../supabase";
import { useAccounts } from "../useAccounts";
import { NO_APPLE_MESSAGE, NO_APPLE_TITLE } from "../useDeleteAccount";

const p = (id: string) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false });
const hook = () => ({ status: "ready", platforms: ["youtube", "tiktok", "instagram", "facebook", "x"].map(p), error: null, busy: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn() });
type Button = { text: string; style?: string; onPress?: () => void };
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SUB = "001234.abcdef.0987";
const CODE = "c0de.0.apple";
let alert: jest.SpyInstance;
const buttonsOf = (call: number) => alert.mock.calls[call][2] as Button[];
const row = () => screen.getByRole("button", { name: "Delete account" });

beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear();
  (useAccounts as jest.Mock).mockReturnValue(hook());
  (deleteAccount as jest.Mock).mockReset().mockResolvedValue(undefined);
  (appleIdentity as jest.Mock).mockReset().mockResolvedValue({ sub: SUB });
  (confirmWithApple as jest.Mock).mockReset().mockResolvedValue(CODE);
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alert.mockRestore());

/** The row, then the first alert's Delete. */
async function pressDelete() {
  await render(<AccountsScreen />);
  await fireEvent.press(row());
  await act(async () => { buttonsOf(0)[1].onPress!(); });
}
const sheetTime = () => act(async () => { await wait(AFTER_SHEET_MS + 50); });

test("the second alert's words, exactly", () => {
  expect(NO_APPLE_TITLE).toBe("Delete without Apple's confirmation?");
  expect(NO_APPLE_MESSAGE).toBe("Your Clipy account can still be deleted. Apple will keep listing Clipy under Sign in with Apple until you remove it in Settings, under your name.");
});

test("an Apple user: the first alert is today's; Apple's sheet only AFTER_SHEET_MS after it; the code goes with the ONE request", async () => {
  await pressDelete();
  expect(alert).toHaveBeenCalledWith("Delete your Clipy account?", "Your sign-in and connected accounts are removed from Clipy's server. This can't be undone. Projects on this phone stay.", expect.any(Array));
  expect(appleIdentity).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).not.toHaveBeenCalled();
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Deleting account")).toBeTruthy();
  await sheetTime();
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).toHaveBeenCalledWith(SUB);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith(CODE);
  expect(useToast.getState().message).toBe("Account deleted.");
  expect(alert).toHaveBeenCalledTimes(1);
  expect(signOut).not.toHaveBeenCalled();
});

test("while Apple is asked, no second tap gets through — neither the row nor the old alert's Delete", async () => {
  await pressDelete();
  await fireEvent.press(row());
  await act(async () => { buttonsOf(0)[1].onPress!(); });
  await sheetTime();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(appleIdentity).toHaveBeenCalledTimes(1);
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

test("Apple did not confirm: nothing is deleted; the second alert, word for word; its Cancel changes nothing", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  await pressDelete();
  await sheetTime();
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(2);
  expect(alert.mock.calls[1][0]).toBe(NO_APPLE_TITLE);
  expect(alert.mock.calls[1][1]).toBe(NO_APPLE_MESSAGE);
  expect(buttonsOf(1).map((b) => [b.text, b.style])).toEqual([["Cancel", "cancel"], ["Delete Anyway", "destructive"]]);
  expect(screen.queryByLabelText("Deleting account")).toBeNull();
  expect(useToast.getState().message).toBeNull();
  await act(async () => { buttonsOf(1)[0].onPress?.(); });
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
  expect(screen.getByTestId("signed-in-row")).toBeTruthy();
});

test("Delete Anyway: deleted WITHOUT a code, once even when pressed twice, with the spinner; Apple not asked again", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  let finish!: () => void;
  (deleteAccount as jest.Mock).mockImplementation(() => new Promise<void>((r) => { finish = r; }));
  await pressDelete();
  await sheetTime();
  const anyway = buttonsOf(1)[1].onPress!;
  await act(async () => { anyway(); anyway(); });
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith();
  expect(screen.getByLabelText("Deleting account")).toBeTruthy();
  await act(async () => { finish(); });
  expect(useToast.getState().message).toBe("Account deleted.");
  expect(confirmWithApple).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Deleting account")).toBeNull();
});

test("Delete Anyway that fails: today's sentence, and the row can be tapped again", async () => {
  (confirmWithApple as jest.Mock).mockResolvedValue(null);
  (deleteAccount as jest.Mock).mockRejectedValueOnce(new Error("Couldn't delete the account. Try again."));
  await pressDelete();
  await sheetTime();
  await act(async () => { buttonsOf(1)[1].onPress!(); });
  expect(useToast.getState().message).toBe("Couldn't delete the account. Try again.");
  await fireEvent.press(row());
  expect(alert).toHaveBeenCalledTimes(3);
});

test("an email or Google user: no wait, no Apple, deleteAccount() with nothing — as before", async () => {
  (appleIdentity as jest.Mock).mockResolvedValue(null);
  await pressDelete();
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(deleteAccount).toHaveBeenCalledWith();
  expect(useToast.getState().message).toBe("Account deleted.");
  await sheetTime();
  expect(confirmWithApple).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(1);
});
