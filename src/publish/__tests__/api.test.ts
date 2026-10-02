jest.mock("../supabase", () => ({ getSupabase: jest.fn(), backendUrl: () => "https://ref.supabase.co", backendKey: () => "pk" }));
import { api, ApiFailure } from "../api";
import { getSupabase } from "../supabase";

const session = (token: string | null) => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } });
const fetchMock = jest.fn();
beforeEach(() => { fetchMock.mockReset(); (globalThis as { fetch: unknown }).fetch = fetchMock; (getSupabase as jest.Mock).mockReturnValue(session("jwt")); });
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("accounts sends the session token and returns the platform list", async () => {
  fetchMock.mockResolvedValue(res(200, { platforms: [{ id: "youtube", available: true, connected: false, name: null, avatarUrl: null, needsReconnect: false }] }));
  expect(await api.accounts()).toHaveLength(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://ref.supabase.co/functions/v1/accounts");
  expect(init.headers).toMatchObject({ Authorization: "Bearer jwt", apikey: "pk" });
});

test("prepare posts JSON; disconnect uses DELETE with a query", async () => {
  fetchMock.mockResolvedValue(res(200, { sessionId: "s1", protocol: "google-resumable", uploadUrl: "https://u", uploadHeaders: {}, chunkSize: 8 }));
  await api.prepare({ platform: "youtube", fileSize: 1, durationSec: 1, mimeType: "video/mp4", caption: "c", options: {} });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ platform: "youtube", fileSize: 1, durationSec: 1, mimeType: "video/mp4", caption: "c", options: {} }) });
  fetchMock.mockResolvedValue(res(200, { ok: true }));
  await api.disconnect("youtube");
  expect(fetchMock.mock.calls[1][0]).toBe("https://ref.supabase.co/functions/v1/accounts?platform=youtube");
  expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
});

test("prepare passes the meta-rupload plan and its wait hint through unchanged", async () => {
  const plan = { sessionId: "m1", protocol: "meta-rupload", uploadUrl: "https://rupload.facebook.com/video-upload/v25.0/1", uploadHeaders: { Authorization: "OAuth t", offset: "0", file_size: "9" }, chunkSize: 9, wait: { maxSeconds: 600, resumeOnTimeout: true } };
  fetchMock.mockResolvedValue(res(200, plan));
  const p = await api.prepare({ platform: "instagram", fileSize: 9, durationSec: 5, mimeType: "video/mp4", caption: "c", options: {} });
  expect(p).toEqual(plan);
  expect(p.wait).toEqual({ maxSeconds: 600, resumeOnTimeout: true });
});

test("uploadChunk sends raw bytes with the session headers", async () => {
  fetchMock.mockResolvedValue(res(200, { nextOffset: 3 }));
  const bytes = new Uint8Array([1, 2, 3]);
  expect(await api.uploadChunk("s1", 0, 10, bytes)).toEqual({ nextOffset: 3 });
  const init = fetchMock.mock.calls[0][1];
  expect(init.body).toBe(bytes);
  expect(init.headers).toMatchObject({ "x-session-id": "s1", "x-offset": "0", "x-total": "10", "Content-Type": "application/octet-stream" });
});

test("uploadChunk passes an abort signal to fetch", async () => {
  fetchMock.mockResolvedValue(res(200, { nextOffset: 3 }));
  const ac = new AbortController();
  await api.uploadChunk("s1", 0, 10, new Uint8Array([1, 2, 3]), ac.signal);
  expect(fetchMock.mock.calls[0][1].signal).toBe(ac.signal);
});

test("failures map to ApiFailure codes", async () => {
  fetchMock.mockResolvedValue(res(401, { code: "reconnect", message: "Reconnect youtube in Accounts." }));
  await expect(api.status("s1")).rejects.toMatchObject({ code: "reconnect", message: "Reconnect youtube in Accounts." });
  fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("html"); } });
  await expect(api.status("s1")).rejects.toMatchObject({ code: "internal" });
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(api.status("s1")).rejects.toMatchObject({ code: "unreachable" });
  (getSupabase as jest.Mock).mockReturnValue(session(null));
  await expect(api.accounts()).rejects.toMatchObject({ code: "signed_out" });
  (getSupabase as jest.Mock).mockReturnValue(null);
  await expect(api.accounts()).rejects.toBeInstanceOf(ApiFailure);
  await expect(api.accounts()).rejects.toMatchObject({ code: "not_configured" });
});

test("a session lookup that errors or throws is unreachable, not signed_out", async () => {
  (getSupabase as jest.Mock).mockReturnValue({ auth: { getSession: async () => ({ data: { session: null }, error: { message: "offline" } }) } });
  await expect(api.accounts()).rejects.toMatchObject({ code: "unreachable" });
  (getSupabase as jest.Mock).mockReturnValue({ auth: { getSession: async () => { throw new Error("offline"); } } });
  await expect(api.accounts()).rejects.toMatchObject({ code: "unreachable" });
});

test("a 2xx with a non-JSON body is an internal failure", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("html"); } });
  await expect(api.accounts()).rejects.toMatchObject({ code: "internal", message: "Something went wrong." });
});
