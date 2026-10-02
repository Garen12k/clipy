const mockSignInWithIdToken = jest.fn(async () => ({ error: null }));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: { signInWithIdToken: mockSignInWithIdToken, signOut: jest.fn(async () => ({ error: null })) } })) }));
import * as Apple from "expo-apple-authentication";

const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
afterEach(() => { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

test("not configured without both env vars", () => {
  const m = load();
  expect(m.isBackendConfigured()).toBe(false);
  expect(m.getSupabase()).toBeNull();
});

test("Apple sign-in hands the identity token to Supabase; cancel is quiet; failures carry a message", async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk";
  const m = load();
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: "apple-jwt" });
  expect(await m.signInWithApple()).toBe("ok");
  expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-jwt" });
  (Apple.signInAsync as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("cancel"), { code: "ERR_REQUEST_CANCELED" }));
  expect(await m.signInWithApple()).toBe("cancelled");
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: null });
  await expect(m.signInWithApple()).rejects.toThrow("Apple didn't return a sign-in token.");
  mockSignInWithIdToken.mockResolvedValueOnce({ error: { message: "Unacceptable audience in id_token" } } as never);
  (Apple.signInAsync as jest.Mock).mockResolvedValueOnce({ identityToken: "apple-jwt" });
  await expect(m.signInWithApple()).rejects.toThrow("Unacceptable audience in id_token");
});
