const mockAuth = { signOut: jest.fn(), getSession: jest.fn(), storageKey: "sb-ref-auth-token" };
const mockDelete = jest.fn();
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }));
jest.mock("../api", () => {
  class ApiFailure extends Error { constructor(code: string, message: string) { super(message); Object.assign(this, { code }); } }
  return { ApiFailure, api: { deleteAccount: (...a: unknown[]) => mockDelete(...a) } };
});

const FAILED = "Couldn't delete the account. Try again.";
const UNREACHABLE = "Clipy's server is asleep or unreachable. Try again in a few minutes.";
const load = () => { let m!: typeof import("../supabase"); jest.isolateModules(() => { m = require("../supabase"); }); return m; };
const configured = () => { process.env.EXPO_PUBLIC_SUPABASE_URL = "https://ref.supabase.co"; process.env.EXPO_PUBLIC_SUPABASE_KEY = "pk"; return load(); };
const failure = (code: string, message: string) => new (jest.requireMock("../api").ApiFailure)(code, message);

beforeEach(() => {
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockAuth.signOut.mockReset().mockResolvedValue({ error: null });
  mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => { delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_KEY; });

test("without a backend it says the sign-in sentence and asks nothing", async () => {
  await expect(load().deleteAccount()).rejects.toThrow("Sign-in isn't set up yet.");
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockAuth.signOut).not.toHaveBeenCalled();
});

test("one call to the server, THEN this phone's session is ended — on this phone only", async () => {
  const order: string[] = [];
  mockDelete.mockImplementation(async () => { order.push("server"); });
  mockAuth.signOut.mockImplementation(async () => { order.push("local"); return { error: null }; });
  await expect(configured().deleteAccount()).resolves.toBeUndefined();
  expect(order).toEqual(["server", "local"]);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
});

describe("the server did not delete it: nothing local changes, and one plain sentence is thrown", () => {
  const cases: [string, unknown, string][] = [
    ["the server's own sentence", failure("delete_failed", FAILED), FAILED],
    ["no connection", failure("unreachable", UNREACHABLE), UNREACHABLE],
    ["signed out meanwhile", failure("signed_out", "Sign in to Clipy first."), "Sign in to Clipy first."],
    ["the door's 401", failure("unauthorized", "Sign in to Clipy first."), "Sign in to Clipy first."],
    ["a server error with the general words", failure("internal", "Something went wrong."), FAILED],
    ["a function that is not there yet (the gateway's words are not shown)", failure("NOT_FOUND", "Requested function was not found"), FAILED],
    ["anything else thrown", new TypeError("boom"), FAILED],
  ];
  test.each(cases)("%s", async (_name, error, sentence) => {
    mockDelete.mockRejectedValue(error);
    const m = configured();
    const thrown = await m.deleteAccount().then(() => null, (e: unknown) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(sentence);
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });
});

describe("never a half state: the server has deleted the account, so it ends as a success with nothing stored here", () => {
  // The test phone's storage is made anew with every load of the module (jest.setup.ts), so it is filled after loading.
  const signedIn = () => { const m = configured(); localStorage.setItem("sb-ref-auth-token", JSON.stringify({ access_token: "jwt" })); localStorage.setItem("other", "kept"); return m; };

  test("the local sign-out throws and the session is still there: the stored session is removed by hand", async () => {
    mockAuth.signOut.mockRejectedValue(new Error("lock"));
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } }, error: null });
    await expect(signedIn().deleteAccount()).resolves.toBeUndefined();
    expect(localStorage.getItem("sb-ref-auth-token")).toBeNull();
    expect(localStorage.getItem("other")).toBe("kept");
  });

  test("the local sign-out returns an error and the session cannot be read back: removed by hand too", async () => {
    mockAuth.signOut.mockResolvedValue({ error: { message: "storage" } });
    mockAuth.getSession.mockRejectedValue(new Error("storage"));
    await expect(signedIn().deleteAccount()).resolves.toBeUndefined();
    expect(localStorage.getItem("sb-ref-auth-token")).toBeNull();
  });

  test("the usual case — auth-js has removed it itself — touches the storage no further", async () => {
    mockAuth.signOut.mockResolvedValue({ error: { message: "User not found", status: 500 } });
    await expect(signedIn().deleteAccount()).resolves.toBeUndefined();
    expect(localStorage.getItem("sb-ref-auth-token")).not.toBeNull(); // the mock removed nothing; the session read back was already null
  });
});

test("with Apple's code: the ONE request carries it, and the rest is as without", async () => {
  const order: string[] = [];
  mockDelete.mockImplementation(async () => { order.push("server"); });
  mockAuth.signOut.mockImplementation(async () => { order.push("local"); return { error: null }; });
  await expect(configured().deleteAccount("c0de.0.apple")).resolves.toBeUndefined();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith({ appleCode: "c0de.0.apple" });
  expect(order).toEqual(["server", "local"]);
  mockDelete.mockRejectedValueOnce(failure("delete_failed", FAILED));
  await expect(configured().deleteAccount("c0de.0.apple")).rejects.toThrow(FAILED);
});
