const mockAuth = { getSession: jest.fn(), signOut: jest.fn() };
let mockExpoGo = false;
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }));
jest.mock("expo", () => ({ isRunningInExpoGo: () => mockExpoGo }));
import * as Apple from "expo-apple-authentication";

const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
const configured = () => { process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk"; return load(); };
const signIn = Apple.signInAsync as jest.Mock;
const available = Apple.isAvailableAsync as jest.Mock;
const signedIn = (user: unknown) => mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt", user } }, error: null });
const SUB = "001234.abcdef.0987";
let warns: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); mockExpoGo = false;
  available.mockResolvedValue(true);
  signIn.mockReset().mockResolvedValue({ user: SUB, authorizationCode: "c0de.0.apple", identityToken: "id.token.x", state: null, fullName: null, email: null, realUserStatus: 1 });
  mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  warns = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warns.mockRestore(); delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

describe("appleIdentity: who signed in with Apple — read from the session once", () => {
  const cases: [string, unknown, { sub: string | null } | null][] = [
    ["Apple first, with its identity", { app_metadata: { provider: "apple", providers: ["apple"] }, identities: [{ provider: "apple", identity_data: { sub: SUB } }] }, { sub: SUB }],
    ["email first, Apple linked later", { app_metadata: { provider: "email", providers: ["email", "apple"] } }, { sub: null }],
    ["only the identity says so", { app_metadata: {}, identities: [{ provider: "apple", identity_data: {} }] }, { sub: null }],
    ["provider alone", { app_metadata: { provider: "apple" } }, { sub: null }],
    ["email", { app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email", identity_data: { sub: "x" } }] }, null],
    ["Google", { app_metadata: { provider: "google", providers: ["google"] }, identities: [{ provider: "google", identity_data: { sub: "g" } }] }, null],
    ["a user with nothing", {}, null],
  ];
  test.each(cases)("%s", async (_n, user, want) => {
    signedIn(user);
    await expect(configured().appleIdentity()).resolves.toEqual(want);
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
  });

  test("no session, an unreadable one, or no backend: null, and nothing thrown", async () => {
    await expect(configured().appleIdentity()).resolves.toBeNull();
    mockAuth.getSession.mockRejectedValue(new Error("storage"));
    await expect(configured().appleIdentity()).resolves.toBeNull();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    mockAuth.getSession.mockClear();
    await expect(load().appleIdentity()).resolves.toBeNull();
    expect(mockAuth.getSession).not.toHaveBeenCalled();
  });
});

describe("confirmWithApple: Apple's sheet once more, for a fresh authorization code", () => {
  test("asks for nothing (no name, no email) and gives the code", async () => {
    await expect(load().confirmWithApple(SUB)).resolves.toBe("c0de.0.apple");
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({ requestedScopes: [] });
  });

  test("Apple's id unknown to the session: any Apple ID's code is taken", async () => {
    signIn.mockResolvedValue({ user: "someone", authorizationCode: "c0de.0.apple" });
    await expect(load().confirmWithApple(null)).resolves.toBe("c0de.0.apple");
  });

  const unconfirmed: [string, () => void][] = [
    ["the sheet was closed", () => signIn.mockRejectedValue(Object.assign(new Error("The user canceled"), { code: "ERR_REQUEST_CANCELED" }))],
    ["Apple failed", () => signIn.mockRejectedValue(Object.assign(new Error("Sign Up Not Completed"), { code: "ERR_REQUEST_FAILED" }))],
    ["no code came back", () => signIn.mockResolvedValue({ user: SUB, authorizationCode: null })],
    ["ANOTHER Apple ID confirmed", () => signIn.mockResolvedValue({ user: "001999.other.0000", authorizationCode: "c0de.0.other" })],
    ["the phone cannot show the sheet", () => available.mockResolvedValue(false)],
    ["the availability check throws", () => available.mockRejectedValue(new Error("no module"))],
  ];
  test.each(unconfirmed)("%s: null, nothing thrown, no code in the log", async (_n, setUp) => {
    setUp();
    await expect(load().confirmWithApple(SUB)).resolves.toBeNull();
    expect(JSON.stringify(warns.mock.calls)).not.toMatch(/c0de|Sign Up Not Completed/);
  });

  test("Expo Go: the sheet is never shown", async () => {
    mockExpoGo = true;
    await expect(load().confirmWithApple(SUB)).resolves.toBeNull();
    expect(available).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
