import { act, render, screen } from "@testing-library/react-native";

// The REAL useSession over a fake Supabase client: the screen is driven by the client's own session events, not by a button's result.
type Listener = (event: string, session: { user?: { email?: string | null } } | null) => void;
const mockListeners = new Set<Listener>();
const mockUnsubscribe = jest.fn();
const mockClient = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn((cb: Listener) => {
      mockListeners.add(cb);
      return { data: { subscription: { unsubscribe: () => { mockListeners.delete(cb); mockUnsubscribe(); } } } };
    }),
  },
};
jest.mock("@/src/publish/supabase", () => ({
  getSupabase: () => mockClient, isBackendConfigured: () => true,
  signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), sendEmailCode: jest.fn(), verifyEmailCode: jest.fn(),
  SIGN_IN_NOT_SET_UP: "Sign-in isn't set up yet.",
}));
import { sendEmailCode, signInWithApple, signInWithGoogle, verifyEmailCode } from "@/src/publish/supabase";
import { hasSeenWelcome, WELCOME_SEEN_KEY } from "../welcomeSeen";
import { WelcomeScreen } from "../WelcomeScreen";

const TAGLINE = "Edit, caption and post your clips.";
const store = (globalThis as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;
const emit = (event: string, session: { user?: { email?: string | null } } | null) => act(async () => { for (const cb of [...mockListeners]) cb(event, session); });

beforeEach(() => { jest.clearAllMocks(); mockListeners.clear(); store.removeItem(WELCOME_SEEN_KEY); });

test.each([[true], [false]])("a session event alone (no button pressed) sets the flag and leaves exactly once (first launch: %s)", async (first) => {
  const onDone = jest.fn();
  await render(<WelcomeScreen first={first} onDone={onDone} />);
  expect(await screen.findByText(TAGLINE)).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled(); expect(hasSeenWelcome()).toBe(false);
  await emit("SIGNED_IN", { user: { email: "me@icloud.com" } });
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(hasSeenWelcome()).toBe(true);
  // What auth-js sends afterwards changes nothing: the screen was left once.
  await emit("TOKEN_REFRESHED", { user: { email: "me@icloud.com" } });
  await emit("SIGNED_OUT", null);
  await emit("SIGNED_IN", { user: { email: "me@icloud.com" } });
  expect(onDone).toHaveBeenCalledTimes(1);
  for (const f of [signInWithApple, signInWithGoogle, sendEmailCode, verifyEmailCode]) expect(f).not.toHaveBeenCalled();
});

test("a stored session read at start (no event) leaves once too, and nothing of the page was drawn on first launch", async () => {
  mockClient.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { email: "me@icloud.com" } } as never }, error: null });
  const onDone = jest.fn();
  const v = await render(<WelcomeScreen first onDone={onDone} />);
  await act(async () => {});
  expect(screen.queryByText(TAGLINE)).toBeNull();
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(hasSeenWelcome()).toBe(true);
  await v.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
