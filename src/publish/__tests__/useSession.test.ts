import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));
import { getSupabase } from "../supabase";
import { useSession } from "../useSession";

type Listener = (e: string, s: unknown) => void;
function fake(getSession: () => Promise<unknown>) {
  const unsubscribe = jest.fn();
  let listener: Listener = () => {};
  const client = { auth: { getSession, onAuthStateChange: (l: Listener) => { listener = l; return { data: { subscription: { unsubscribe } } }; } } };
  (getSupabase as jest.Mock).mockReturnValue(client);
  return { unsubscribe, emit: (e: string, s: unknown) => listener(e, s) };
}
const ok = (session: unknown) => async () => ({ data: { session } });

test("unconfigured", async () => {
  (getSupabase as jest.Mock).mockReturnValue(null);
  expect((await renderHook(() => useSession())).result.current).toEqual({ status: "unconfigured" });
});

test("initial session is signedIn with email; none is signedOut", async () => {
  fake(ok({ user: { email: "a@b.c" } }));
  const a = await renderHook(() => useSession());
  await waitFor(() => expect(a.result.current).toEqual({ status: "signedIn", email: "a@b.c" }));
  fake(ok(null));
  const b = await renderHook(() => useSession());
  await waitFor(() => expect(b.result.current).toEqual({ status: "signedOut" }));
});

test("an auth event before getSession resolves wins", async () => {
  let resolve!: (v: unknown) => void;
  const f = fake(() => new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useSession());
  await act(async () => f.emit("SIGNED_IN", { user: { email: "new@x.y" } }));
  await act(async () => { resolve({ data: { session: null } }); });
  expect(result.current).toEqual({ status: "signedIn", email: "new@x.y" });
});

test("getSession rejecting falls back to signedOut", async () => {
  fake(async () => { throw new Error("boom"); });
  const { result } = await renderHook(() => useSession());
  await waitFor(() => expect(result.current).toEqual({ status: "signedOut" }));
});

test("unmount unsubscribes and a late resolve sets nothing", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  let resolve!: (v: unknown) => void;
  const f = fake(() => new Promise((r) => { resolve = r; }));
  const { unmount } = await renderHook(() => useSession());
  await unmount();
  expect(f.unsubscribe).toHaveBeenCalled();
  await act(async () => { resolve({ data: { session: { user: {} } } }); });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
