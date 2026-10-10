/** The callback when the platform comes back with `error=`: a refusal by TikTok is said; a user's "no" stays quiet; the other platforms are unchanged. */
import { oauthCallback } from "../handlers/oauthCallback.ts";
import { oauthStart } from "../handlers/oauthStart.ts";
import { adapters } from "../platforms/registry.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { fakeAdapter, fakeDeps, USER } from "./fakes.ts";

const RETURN = "exp://192.168.1.142:8090/--/oauth";
const REFUSED = "TikTok didn't let Clipy connect. Try again in a few minutes.";
const cb = (q: string) => new URL(`https://ref.supabase.co/functions/v1/oauth-callback?${q}`);
const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "secret" };
const tiktokDeps = () => fakeDeps({ env: { get: (n) => ENV[n] }, adapters: { youtube: fakeAdapter(), tiktok: fakeAdapter({ id: "tiktok", secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], connectError: tiktok.connectError }) } });
async function back(deps: ReturnType<typeof fakeDeps>, platform: string, q: string) {
  const { authUrl } = await oauthStart(deps, USER, { platform, returnUrl: RETURN });
  return (await oauthCallback(deps, cb(`${q}&state=${new URL(authUrl).searchParams.get("state")!}`))).redirect;
}
let logged: jest.SpyInstance;
beforeEach(() => { logged = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => logged.mockRestore());

test("TikTok refusing the request (not the user) is an error in plain words; the code goes to the log, never to the phone", async () => {
  const deps = tiktokDeps();
  const redirect = await back(deps, "tiktok", "error=invalid_scope&error_description=The%20scope%20is%20not%20approved");
  expect(redirect).toBe(`${RETURN}?status=error&platform=tiktok&message=${encodeURIComponent(REFUSED)}`);
  expect(redirect).not.toContain("invalid_scope");
  expect(JSON.stringify(logged.mock.calls)).toContain("invalid_scope");
  expect(JSON.stringify(logged.mock.calls)).not.toContain("not approved");
  expect(deps.adapters.tiktok!.exchange).not.toHaveBeenCalled();
  expect(await deps.db.getAccount(USER, "tiktok")).toBeNull();
});

test("an error wins over a code that came with it, and an odd code is not written to the log as it came", async () => {
  const deps = tiktokDeps();
  expect(await back(deps, "tiktok", `code=abc&error=${encodeURIComponent("x\ninjected <b>")}`)).toBe(`${RETURN}?status=error&platform=tiktok&message=${encodeURIComponent(REFUSED)}`);
  expect(deps.adapters.tiktok!.exchange).not.toHaveBeenCalled();
  expect(JSON.stringify(logged.mock.calls)).not.toContain("injected");
});

test.each([["error=access_denied"], ["error=access_denied&error_description=User%20denied"], ["scopes=x"]])("the user saying no on TikTok (%s) stays quiet: cancelled", async (q) => {
  expect(await back(tiktokDeps(), "tiktok", q)).toBe(`${RETURN}?status=cancelled&platform=tiktok`);
  expect(logged).not.toHaveBeenCalled();
});

test.each([["error=access_denied"], ["error=invalid_scope"], ["error=server_error&error_description=x"], ["error_reason=user_denied&error=access_denied"], ["code=abc&error=whatever"]])("a platform that does not name its connect errors is unchanged: %s is cancelled", async (q) => {
  const deps = fakeDeps();
  expect(await back(deps, "youtube", q)).toBe(`${RETURN}?status=cancelled&platform=youtube`);
  expect(deps.adapters.youtube!.exchange).not.toHaveBeenCalled();
});

test("only TikTok names its connect errors; access_denied is the user's no", () => {
  expect(Object.values(adapters).filter((a) => a.connectError).map((a) => a.id)).toEqual(["tiktok"]);
  expect(tiktok.connectError!("access_denied")).toBeNull();
  expect(tiktok.connectError!("invalid_scope")).toBe(REFUSED);
});
