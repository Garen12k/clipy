import * as WebBrowser from "expo-web-browser";

const mockAuth = {
  signInWithOtp: jest.fn(), verifyOtp: jest.fn(), signInWithOAuth: jest.fn(), setSession: jest.fn(), exchangeCodeForSession: jest.fn(),
  signInWithIdToken: jest.fn(), signOut: jest.fn(), getSession: jest.fn(),
};
let mockExpoGo = false;
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }));
jest.mock("expo", () => ({ isRunningInExpoGo: () => mockExpoGo }));
jest.mock("expo-linking", () => ({ createURL: (p: string) => `exp://192.168.1.142:8090/--/${p}` }));
import * as Apple from "expo-apple-authentication";

const REDIRECT = "exp://192.168.1.142:8090/--/welcome";
const NOT_SET_UP = "Sign-in isn't set up yet.";
const WRONG = "That code didn't work. Check it or send a new one.", RATE = "Too many tries. Wait a minute, then try again.", NET = "Couldn't reach Clipy. Check your connection.", SERVER = "Clipy's server had a problem. Try again in a minute.", OTHER = "Couldn't sign in.";
const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
const configured = () => { process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk"; return load(); };
const open = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks(); mockExpoGo = false;
  for (const f of Object.values(mockAuth)) f.mockReset().mockResolvedValue({ data: {}, error: null });
  mockAuth.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: "https://ref.supabase.co/auth/v1/authorize?provider=google" }, error: null });
});
afterEach(() => { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

test("without a backend every sign-in function says the same sentence and touches nothing", async () => {
  const m = load();
  await expect(m.sendEmailCode("a@b.co")).rejects.toThrow(NOT_SET_UP);
  await expect(m.verifyEmailCode("a@b.co", "123456")).rejects.toThrow(NOT_SET_UP);
  await expect(m.signInWithGoogle()).rejects.toThrow(NOT_SET_UP);
  await expect(m.signInWithApple()).rejects.toThrow(NOT_SET_UP);
  expect(open).not.toHaveBeenCalled();
  expect(Apple.signInAsync).not.toHaveBeenCalled();
});

test("without a backend the 'not set up' sentence wins over the Expo Go one", async () => {
  mockExpoGo = true;
  await expect(load().signInWithApple()).rejects.toThrow(NOT_SET_UP);
});

test("Apple inside Expo Go (backend configured): the sheet is not opened, and the reason is said", async () => {
  mockExpoGo = true;
  await expect(configured().signInWithApple()).rejects.toThrow("Apple sign-in works in the installed app, not in Expo Go.");
  expect(Apple.signInAsync).not.toHaveBeenCalled();
});

test("sendEmailCode asks for a one-time code for the trimmed address, creating the user if new", async () => {
  await expect(configured().sendEmailCode("  me@icloud.com ")).resolves.toBeUndefined();
  expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ email: "me@icloud.com", options: { shouldCreateUser: true } });
});

test("verifyEmailCode verifies the code as an email OTP", async () => {
  await expect(configured().verifyEmailCode(" me@icloud.com", "123456")).resolves.toBeUndefined();
  expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: "me@icloud.com", token: "123456", type: "email" });
});

describe("server errors become plain sentences", () => {
  // The last column: the same error from anything but checking a code — "That code didn't work" is said only there.
  const cases: [string, object, string, string][] = [
    ["an expired code", { message: "Token has expired or is invalid", status: 403, code: "otp_expired" }, WRONG, OTHER],
    ["a wrong code (older servers: message only)", { message: "Token has expired or is invalid", status: 401 }, WRONG, OTHER],
    ["invalid credentials", { message: "Invalid login credentials", status: 400, code: "invalid_credentials" }, WRONG, OTHER],
    ["the email send limit", { message: "Email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" }, RATE, RATE],
    ["the request limit", { message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" }, RATE, RATE],
    ["the 60-second rule", { message: "For security purposes, you can only request this after 43 seconds.", status: 429 }, RATE, RATE],
    ["no network (auth-js retryable fetch error)", { name: "AuthRetryableFetchError", message: "Network request failed", status: 0 }, NET, NET],
    // auth-js names every 5xx a "retryable fetch error" although the phone did reach the server (seen live: the email sender refused, 500).
    ["a server failure (auth-js calls a 500 retryable)", { name: "AuthRetryableFetchError", message: "Error sending confirmation email", status: 500 }, SERVER, SERVER],
    ["a gateway failure", { name: "AuthRetryableFetchError", message: "HTTP 503", status: 503 }, SERVER, SERVER],
    ["a server failure with its own code", { message: "Database error saving new user", status: 500, code: "unexpected_failure" }, SERVER, SERVER],
    ["anything else", { message: "Signups not allowed for otp", status: 422, code: "otp_disabled" }, OTHER, OTHER],
  ];
  test.each(cases)("%s", async (_name, error, sentence, elsewhere) => {
    const m = configured();
    mockAuth.verifyOtp.mockResolvedValueOnce({ data: {}, error });
    await expect(m.verifyEmailCode("a@b.co", "123456")).rejects.toThrow(sentence);
    mockAuth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });
    await expect(m.sendEmailCode("a@b.co")).rejects.toThrow(elsewhere);
  });
  test("a token error that is not about the emailed code (a refresh token, a JWT) is never 'That code didn't work'", async () => {
    const m = configured();
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}#access_token=a&refresh_token=r` });
    mockAuth.setSession.mockResolvedValueOnce({ data: {}, error: { message: "Invalid Refresh Token: Refresh Token Not Found", status: 400, code: "refresh_token_not_found" } });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}?code=abc` });
    mockAuth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: { message: "invalid JWT: unable to parse or verify signature, token is malformed", status: 403, code: "bad_jwt" } });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
  });
  test("a request that throws (fetch failed) is a connection problem; an unknown throw is the fallback", async () => {
    const m = configured();
    mockAuth.signInWithOtp.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(m.sendEmailCode("a@b.co")).rejects.toThrow(NET);
    mockAuth.verifyOtp.mockRejectedValueOnce(new Error("boom"));
    await expect(m.verifyEmailCode("a@b.co", "123456")).rejects.toThrow(OTHER);
  });
});

describe("Google", () => {
  test("opens Supabase's Google page in the system browser with the app's return address, then signs in from the returned tokens", async () => {
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}#access_token=at.1-_x&expires_in=3600&refresh_token=rt%2F1&token_type=bearer` });
    const m = configured();
    expect(await m.signInWithGoogle()).toBe("ok");
    expect(m.googleRedirectUrl()).toBe(REDIRECT);
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
    expect(open).toHaveBeenCalledWith("https://ref.supabase.co/auth/v1/authorize?provider=google", REDIRECT);
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: "at.1-_x", refresh_token: "rt/1" });
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("a returned ?code= (PKCE) is exchanged instead", async () => {
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}?code=abc-123` });
    expect(await configured().signInWithGoogle()).toBe("ok");
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith("abc-123");
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  test.each(["cancel", "dismiss", "locked"])("a closed browser (%s) is 'cancelled' and signs nobody in", async (type) => {
    open.mockResolvedValueOnce({ type });
    expect(await configured().signInWithGoogle()).toBe("cancelled");
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  test("the user saying no at Google is 'cancelled'; any other error in the return address fails plainly", async () => {
    const m = configured();
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}?error=access_denied&error_description=The+user+denied` });
    expect(await m.signInWithGoogle()).toBe("cancelled");
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}?error=server_error&error_description=Unable+to+exchange+external+code` });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    open.mockResolvedValueOnce({ type: "success", url: REDIRECT });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  test("access_denied WITH an error_code is the server refusing (sign-ups off, …), not the user cancelling: it fails plainly", async () => {
    const m = configured();
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance` });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed` });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    expect(mockAuth.setSession).not.toHaveBeenCalled(); expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("failures at each step carry a plain sentence", async () => {
    const m = configured();
    mockAuth.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: { message: "Unsupported provider: provider is not enabled", status: 400, code: "validation_failed" } });
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
    expect(open).not.toHaveBeenCalled();
    open.mockResolvedValueOnce({ type: "success", url: `${REDIRECT}#access_token=a&refresh_token=r` });
    mockAuth.setSession.mockResolvedValueOnce({ data: {}, error: { name: "AuthRetryableFetchError", message: "Network request failed", status: 0 } });
    await expect(m.signInWithGoogle()).rejects.toThrow(NET);
    open.mockRejectedValueOnce(new Error("no browser"));
    await expect(m.signInWithGoogle()).rejects.toThrow(OTHER);
  });
});

describe("signOut", () => {
  const offline = { name: "AuthRetryableFetchError", message: "Network request failed", status: 0 };
  const there = { data: { session: { access_token: "at", user: { email: "me@icloud.com" } } }, error: null };
  const gone = { data: { session: null }, error: null };

  test("a clean sign-out resolves and asks nothing more", async () => {
    await expect(configured().signOut()).resolves.toBeUndefined();
    expect(mockAuth.getSession).not.toHaveBeenCalled();
  });

  test("an error with the session GONE (auth-js removes it even offline) resolves: this phone is signed out", async () => {
    const m = configured();
    mockAuth.getSession.mockResolvedValue(gone);
    mockAuth.signOut.mockResolvedValueOnce({ error: offline });
    await expect(m.signOut()).resolves.toBeUndefined();
    mockAuth.signOut.mockResolvedValueOnce({ error: { message: "Internal error", status: 500 } });
    await expect(m.signOut()).resolves.toBeUndefined();
    mockAuth.signOut.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(m.signOut()).resolves.toBeUndefined();
    expect(mockAuth.getSession).toHaveBeenCalledTimes(3);
  });

  test("an error with the session STILL there is thrown as a plain sentence", async () => {
    const m = configured();
    mockAuth.getSession.mockResolvedValue(there);
    mockAuth.signOut.mockResolvedValueOnce({ error: offline });
    await expect(m.signOut()).rejects.toThrow(NET);
    mockAuth.signOut.mockResolvedValueOnce({ error: { message: "Internal error", status: 500 } });
    await expect(m.signOut()).rejects.toThrow("Couldn't sign out.");
    // The session cannot be read back either: nothing says it is gone, so nothing claims it.
    mockAuth.signOut.mockResolvedValueOnce({ error: offline });
    mockAuth.getSession.mockRejectedValueOnce(new Error("storage"));
    await expect(m.signOut()).rejects.toThrow(NET);
  });
});
