import { PlatformError } from "../errors.ts";
import { MAX_RELAY_BYTES } from "../handlers/postUpload.ts";
import { adapters } from "../platforms/registry.ts";
import { appendBody, cutToWeighted, hasLink, weightedLength, x, X_CHUNK } from "../platforms/x.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";
import { X_LINK_VECTORS, X_WEIGHT_VECTORS } from "./xWeightVectors.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
const BASIC = `Basic ${Buffer.from("cid:sec").toString("base64")}`;
function ctx(responses: Array<Response | (() => Response) | Error>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { X_CLIENT_ID: "cid", X_CLIENT_SECRET: "sec", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (!r) throw new Error(`unexpected request to ${url}`);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const problem = (status: number, detail: string, type = "about:blank", title = "Forbidden") => ok({ title, detail, type, status }, status);
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));
const headers = (init: RequestInit) => init.headers as Record<string, string>;
const MB = 1024 * 1024;
const REF = { mediaId: "1880028106020515840", text: "Beach day" };
const S = { ref: REF, input: INPUT, clientResult: null, account: { accountId: "42", displayName: "@mo", avatarUrl: null } };
const posted = (id = "1880028300000000000") => ok({ data: { id, text: "Beach day", edit_history_post_ids: [id] } }, 201);
const info = (state?: string, extra: Record<string, unknown> = {}) => ok({ data: { id: REF.mediaId, media_key: "7_1", ...(state ? { processing_info: { state, check_after_secs: 1, ...extra } } : {}) } });

test("registry, id and secrets", () => {
  expect(adapters.x).toBe(x);
  expect(x.id).toBe("x");
  expect(x.secrets).toEqual(["X_CLIENT_ID", "X_CLIENT_SECRET"]);
  expect(x.isAuthError).toBeUndefined();
});

test("authUrl asks for the posting scopes with PKCE (S256)", () => {
  const u = new URL(x.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "chal" }));
  expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
  expect(Object.fromEntries(u.searchParams)).toEqual({
    response_type: "code", client_id: "cid", redirect_uri: REDIRECT, scope: "tweet.read tweet.write users.read media.write offline.access",
    state: "st", code_challenge: "chal", code_challenge_method: "S256",
  });
});

test("exchange posts the code and the PKCE verifier with Basic client auth, and maps the tokens", async () => {
  const a = ctx([ok({ token_type: "bearer", expires_in: 7200, access_token: "at", scope: "tweet.read tweet.write users.read media.write offline.access", refresh_token: "rt" })]);
  const before = Date.now();
  const t = await x.exchange(a.ctx, { code: "c0de", codeVerifier: "verif" });
  expect(a.calls[0].url).toBe("https://api.x.com/2/oauth2/token");
  expect(a.calls[0].init.method).toBe("POST");
  expect(headers(a.calls[0].init)).toEqual({ "Content-Type": "application/x-www-form-urlencoded", Authorization: BASIC });
  expect(form(a.calls[0].init)).toEqual({ code: "c0de", grant_type: "authorization_code", redirect_uri: REDIRECT, code_verifier: "verif" });
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: "tweet.read tweet.write users.read media.write offline.access" });
  expect(new Date(t.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + 7200_000 - 5);
  // No access token in a 200 is not a success.
  await expect(x.exchange(ctx([ok({ token_type: "bearer" })]).ctx, { code: "c", codeVerifier: "v" })).rejects.toMatchObject({ platform: "x", status: 502 });
});

test("refresh sends the refresh token with Basic auth and returns the rotated refresh token", async () => {
  const a = ctx([ok({ token_type: "bearer", expires_in: 7200, access_token: "at2", scope: "s", refresh_token: "rt2" })]);
  expect(await x.refresh(a.ctx, "rt1")).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  expect(a.calls[0].url).toBe("https://api.x.com/2/oauth2/token");
  expect(headers(a.calls[0].init).Authorization).toBe(BASIC);
  expect(form(a.calls[0].init)).toEqual({ grant_type: "refresh_token", refresh_token: "rt1" });
});

test("token errors { error, error_description } keep X's description; 5xx stays temporary", async () => {
  const bad = ok({ error: "invalid_request", error_description: "Value passed for the token was invalid." }, 400);
  await expect(x.refresh(ctx([bad]).ctx, "rt")).rejects.toMatchObject({ platform: "x", status: 400, reason: "invalid_request", message: "Value passed for the token was invalid." });
  await expect(x.exchange(ctx([ok({ error: "unauthorized_client", error_description: "Missing valid authorization header" }, 401)]).ctx, { code: "c", codeVerifier: "v" }))
    .rejects.toMatchObject({ status: 401, message: "Missing valid authorization header" });
  await expect(x.refresh(ctx([new Response("<html>down</html>", { status: 503 })]).ctx, "rt")).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
});

test("revoke withdraws the refresh token (else the access token) with Basic auth, best effort", async () => {
  const a = ctx([ok({ revoked: true })]);
  await x.revoke(a.ctx, { accessToken: "at", refreshToken: "rt" });
  expect(a.calls[0].url).toBe("https://api.x.com/2/oauth2/revoke");
  expect(a.calls[0].init.method).toBe("POST");
  expect(headers(a.calls[0].init)).toEqual({ "Content-Type": "application/x-www-form-urlencoded", Authorization: BASIC });
  expect(form(a.calls[0].init)).toEqual({ token: "rt", token_type_hint: "refresh_token" });
  const b = ctx([ok({}, 400)]);
  await expect(x.revoke(b.ctx, { accessToken: "at", refreshToken: null })).resolves.toBeUndefined();
  expect(form(b.calls[0].init)).toEqual({ token: "at", token_type_hint: "access_token" });
  await expect(x.revoke(ctx([new TypeError("fetch failed")]).ctx, { accessToken: "at", refreshToken: "rt" })).resolves.toBeUndefined();
});

test("profile reads id, @username and avatar", async () => {
  const a = ctx([ok({ data: { id: "42", name: "Mo", username: "mo", profile_image_url: "https://pbs.twimg.com/a.jpg" } })]);
  expect(await x.profile(a.ctx, "at")).toEqual({ accountId: "42", displayName: "@mo", avatarUrl: "https://pbs.twimg.com/a.jpg" });
  expect(a.calls[0].url).toBe("https://api.x.com/2/users/me?user.fields=profile_image_url");
  expect(headers(a.calls[0].init).Authorization).toBe("Bearer at");
  expect(await x.profile(ctx([ok({ data: { id: "43", username: "bo" } })]).ctx, "at")).toEqual({ accountId: "43", displayName: "@bo", avatarUrl: null });
  await expect(x.profile(ctx([ok({ errors: [{ title: "Not Found" }] })]).ctx, "at")).rejects.toMatchObject({ status: 502, message: "X did not return the account." });
});

test("prepare initializes a chunked video upload and asks the phone to relay 4 MiB pieces", async () => {
  const a = ctx([ok({ data: { id: REF.mediaId, media_key: "7_1", expires_after_secs: 86400 } })]);
  const r = await x.prepare(a.ctx, "at", { ...INPUT, caption: "Beach day" });
  expect(a.calls[0].url).toBe("https://api.x.com/2/media/upload/initialize");
  expect(a.calls[0].init.method).toBe("POST");
  expect(headers(a.calls[0].init)).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json" });
  expect(JSON.parse(a.calls[0].init.body as string)).toEqual({ media_type: "video/mp4", total_bytes: INPUT.fileSize, media_category: "tweet_video" });
  expect(r).toEqual({ protocol: "relay", uploadUrl: null, uploadHeaders: {}, chunkSize: 4 * MB, ref: REF, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: true } });
  expect(X_CHUNK).toBe(4 * MB);
  expect(X_CHUNK).toBeLessThanOrEqual(MAX_RELAY_BYTES); // one relayed piece is one X segment
  // The caption is stored already cut to X's limit (the status path has only the ref).
  const long = await x.prepare(ctx([ok({ data: { id: "1" } })]).ctx, "at", { ...INPUT, caption: "a".repeat(300) });
  expect(long.ref).toEqual({ mediaId: "1", text: "a".repeat(280) });
  await expect(x.prepare(ctx([ok({ data: {} })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 502, message: "X did not return an upload id." });
});

describe("relayChunk", () => {
  const bytes = (n: number, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);
  /** The exact multipart body X's curl example (-F segment_index=… -F media=@file) describes. */
  function expected(boundary: string, segment: number, media: Uint8Array): Uint8Array {
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n${segment}\r\n--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="segment"\r\nContent-Type: application/octet-stream\r\n\r\n`, "latin1");
    return new Uint8Array(Buffer.concat([head, Buffer.from(media), Buffer.from(`\r\n--${boundary}--\r\n`, "latin1")]));
  }
  const boundaryOf = (init: RequestInit) => /^multipart\/form-data; boundary=([A-Za-z0-9_-]{20,70})$/.exec(headers(init)["Content-Type"])?.[1];

  test("appends segment 0 as multipart/form-data with the exact bytes", async () => {
    const piece = bytes(X_CHUNK);
    const a = ctx([ok({ data: { expires_at: 1767225600 } })]);
    expect(await x.relayChunk!(a.ctx, "at", REF, { offset: 0, total: 9 * MB, body: piece })).toEqual({ nextOffset: X_CHUNK });
    expect(a.calls[0].url).toBe(`https://api.x.com/2/media/upload/${REF.mediaId}/append`);
    expect(a.calls[0].init.method).toBe("POST");
    const h = headers(a.calls[0].init);
    expect(Object.keys(h).sort()).toEqual(["Authorization", "Content-Type"]); // no hand-set Content-Length: fetch computes it
    expect(h.Authorization).toBe("Bearer at");
    const boundary = boundaryOf(a.calls[0].init)!;
    expect(boundary).toBeDefined();
    const sent = a.calls[0].init.body as Uint8Array;
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sent).equals(Buffer.from(expected(boundary, 0, piece)))).toBe(true);
  });

  test("offset 12 MiB is segment 3; the last, shorter piece is accepted; a fresh boundary each time", async () => {
    const last = bytes(123, 3);
    const a = ctx([ok({}), ok({})]);
    expect(await x.relayChunk!(a.ctx, "at", REF, { offset: 12 * MB, total: 12 * MB + 123, body: last })).toEqual({ nextOffset: 12 * MB + 123 });
    const boundary = boundaryOf(a.calls[0].init)!;
    expect(Buffer.from(a.calls[0].init.body as Uint8Array).equals(Buffer.from(expected(boundary, 3, last)))).toBe(true);
    await x.relayChunk!(a.ctx, "at", REF, { offset: 12 * MB, total: 12 * MB + 123, body: last });
    expect(boundaryOf(a.calls[1].init)).not.toBe(boundary);
  });

  test("a standard multipart parser (the fetch Response's) reads both fields back", async () => {
    const piece = bytes(5000, 11);
    const { body, contentType } = appendBody(2, piece);
    const parsed = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    expect(parsed.get("segment_index")).toBe("2");
    const media = parsed.get("media") as Blob;
    expect(Buffer.from(await media.arrayBuffer()).equals(Buffer.from(piece))).toBe(true);
    // fetch computes the length from the bytes.
    const req = new Request("https://api.x.com/", { method: "POST", headers: { "Content-Type": contentType }, body });
    expect((await req.arrayBuffer()).byteLength).toBe(body.length);
  });

  test("a misaligned offset or a short piece that is not the last rejects without a request", async () => {
    const a = ctx([]);
    await expect(x.relayChunk!(a.ctx, "at", REF, { offset: 1000, total: 9 * MB, body: bytes(10) })).rejects.toMatchObject({ platform: "x", status: 400, message: "Unexpected upload position." });
    await expect(x.relayChunk!(a.ctx, "at", REF, { offset: 0, total: 9 * MB, body: bytes(10) })).rejects.toMatchObject({ status: 400, message: "Unexpected upload piece size." });
    expect(a.calls).toHaveLength(0);
  });

  test("a missing or malformed media id is a final 502 without a request", async () => {
    const a = ctx([]);
    for (const ref of [{}, { mediaId: "" }, { mediaId: "12/../34" }]) {
      await expect(x.relayChunk!(a.ctx, "at", ref, { offset: 0, total: 10, body: bytes(10) })).rejects.toMatchObject({ status: 502, code: "platform_error", message: "X upload reference is missing." });
    }
    await expect(x.status(a.ctx, "at", {})).rejects.toMatchObject({ status: 502, message: "X upload reference is missing." });
    await expect(x.finalize(a.ctx, "at", { ...S, ref: {} })).rejects.toMatchObject({ status: 502, message: "X upload reference is missing." });
    expect(a.calls).toHaveLength(0);
  });

  test("X's error on append keeps its words and status", async () => {
    await expect(x.relayChunk!(ctx([problem(400, "Segment index is out of order.", "https://api.x.com/2/problems/invalid-request", "Invalid Request")]).ctx, "at", REF, { offset: 0, total: 10, body: bytes(10) }))
      .rejects.toMatchObject({ status: 400, reason: "invalid-request", message: "Segment index is out of order." });
  });
});

describe("finalize and status", () => {
  test("finalize with no processing_info creates the post and returns its link", async () => {
    const a = ctx([info(), posted("99")]);
    expect(await x.finalize(a.ctx, "at", S)).toEqual({ status: "done", url: "https://x.com/i/status/99" });
    expect(a.calls[0].url).toBe(`https://api.x.com/2/media/upload/${REF.mediaId}/finalize`);
    expect(a.calls[0].init.method).toBe("POST");
    expect(headers(a.calls[0].init).Authorization).toBe("Bearer at");
    expect(a.calls[1].url).toBe("https://api.x.com/2/tweets");
    expect(a.calls[1].init.method).toBe("POST");
    expect(headers(a.calls[1].init)).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json" });
    expect(JSON.parse(a.calls[1].init.body as string)).toEqual({ text: "Beach day", media: { media_ids: [REF.mediaId] } });
  });

  test("finalize pending → processing, no post", async () => {
    const a = ctx([info("pending")]);
    expect(await x.finalize(a.ctx, "at", S)).toEqual({ status: "processing" });
    expect(a.calls).toHaveLength(1);
  });

  test("an empty caption posts the video alone", async () => {
    const a = ctx([info("succeeded"), posted("7")]);
    expect(await x.finalize(a.ctx, "at", { ...S, ref: { mediaId: REF.mediaId, text: "" } })).toEqual({ status: "done", url: "https://x.com/i/status/7" });
    expect(JSON.parse(a.calls[1].init.body as string)).toEqual({ media: { media_ids: [REF.mediaId] } });
  });

  test("a refused finalize looks once: an upload X is already processing goes on (an earlier finalize's answer was lost)", async () => {
    const a = ctx([problem(400, "Media already finalized.", "https://api.x.com/2/problems/invalid-request", "Invalid Request"), info("in_progress")]);
    expect(await x.finalize(a.ctx, "at", S)).toEqual({ status: "processing" });
    expect(a.calls[1].url).toBe(`https://api.x.com/2/media/upload?command=STATUS&media_id=${REF.mediaId}`);
    const b = ctx([problem(400, "Media already finalized."), info("succeeded"), posted("5")]);
    expect(await x.finalize(b.ctx, "at", S)).toEqual({ status: "done", url: "https://x.com/i/status/5" });
    // Nothing being processed: the refusal stands.
    await expect(x.finalize(ctx([problem(400, "Segments are missing."), info()]).ctx, "at", S)).rejects.toMatchObject({ status: 400, message: "Segments are missing." });
    await expect(x.finalize(ctx([problem(400, "Segments are missing."), new TypeError("net")]).ctx, "at", S)).rejects.toMatchObject({ status: 400, message: "Segments are missing." });
  });

  test("status in_progress → processing (no post)", async () => {
    const a = ctx([info("in_progress", { progress_percent: 40 })]);
    expect(await x.status(a.ctx, "at", REF)).toEqual({ status: "processing" });
    expect(a.calls[0].url).toBe(`https://api.x.com/2/media/upload?command=STATUS&media_id=${REF.mediaId}`);
    expect(a.calls[0].init.method ?? "GET").toBe("GET");
    expect(headers(a.calls[0].init).Authorization).toBe("Bearer at");
    expect(a.calls).toHaveLength(1);
  });

  test("status succeeded → posts once", async () => {
    const a = ctx([info("succeeded"), posted("12")]);
    expect(await x.status(a.ctx, "at", REF)).toEqual({ status: "done", url: "https://x.com/i/status/12" });
    expect(a.calls.map((c) => c.url)).toEqual([`https://api.x.com/2/media/upload?command=STATUS&media_id=${REF.mediaId}`, "https://api.x.com/2/tweets"]);
  });

  test("status failed → final 400 with X's message", async () => {
    await expect(x.status(ctx([info("failed", { error: { code: 1, name: "InvalidMedia", message: "Unsupported video codec." } })]).ctx, "at", REF))
      .rejects.toMatchObject({ platform: "x", status: 400, code: "platform_error", message: "X couldn't process this video. Unsupported video codec." });
    await expect(x.status(ctx([info("failed")]).ctx, "at", REF)).rejects.toMatchObject({ status: 400, message: "X couldn't process this video." });
  });

  test("create-post 403 duplicate → final, in X's words (never reported as done)", async () => {
    const dup = problem(403, "You are not allowed to create a Tweet with duplicate content.");
    await expect(x.status(ctx([info("succeeded"), dup]).ctx, "at", REF))
      .rejects.toMatchObject({ platform: "x", status: 403, code: "platform_error", message: "You are not allowed to create a Tweet with duplicate content." });
  });

  const UNKNOWN = "X didn't confirm the post. It may already be on your profile — check X before posting again.";
  test.each([
    ["the fetch rejecting (network)", () => new TypeError("fetch failed")],
    ["HTTP 500", () => new Response("", { status: 500 })],
    ["HTTP 503 with a problem body", () => problem(503, "Service Unavailable", "about:blank", "Service Unavailable")],
    ["HTTP 408", () => new Response("", { status: 408 })],
    ["HTTP 504", () => new Response("<html>", { status: 504 })],
    ["a 201 without an id", () => ok({ errors: [{ title: "Partial" }] }, 201)],
    ["a 200 that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("create-post with an unknown outcome (%s) is a FINAL 409, never temporary", async (_n, reply) => {
    for (const run of [(c: AdapterCtx) => x.status(c, "at", REF), (c: AdapterCtx) => x.finalize(c, "at", S)]) {
      const a = ctx([info("succeeded"), reply()]);
      const err = await run(a.ctx).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PlatformError);
      expect(err).toMatchObject({ platform: "x", status: 409, code: "platform_error", message: UNKNOWN });
      expect(a.calls.filter((c) => c.url === "https://api.x.com/2/tweets")).toHaveLength(1);
    }
  });

  test("create-post 403 other → final with X's detail; billing/enrolment problems are final too", async () => {
    await expect(x.status(ctx([info("succeeded"), problem(403, "This user is not allowed to post a video longer than 20 minutes.")]).ctx, "at", REF))
      .rejects.toMatchObject({ status: 403, code: "platform_error", message: "This user is not allowed to post a video longer than 20 minutes." });
    await expect(x.status(ctx([info("succeeded"), problem(403, "Your enrolled account does not have any credits to fulfill this request.", "https://api.x.com/2/problems/client-forbidden", "Client Forbidden")]).ctx, "at", REF))
      .rejects.toMatchObject({ status: 403, code: "platform_error", reason: "client-forbidden", message: "Your enrolled account does not have any credits to fulfill this request." });
    // Older shape: errors[0].message; a problem with only a title uses the title.
    await expect(x.status(ctx([info("succeeded"), ok({ errors: [{ message: "Old style refusal.", code: 187 }] }, 403)]).ctx, "at", REF)).rejects.toMatchObject({ status: 403, message: "Old style refusal." });
    await expect(x.status(ctx([info("succeeded"), ok({ title: "Unsupported Authentication", type: "https://api.x.com/2/problems/unsupported-authentication" }, 403)]).ctx, "at", REF))
      .rejects.toMatchObject({ status: 403, reason: "unsupported-authentication", message: "Unsupported Authentication" });
  });

  test("create-post 429 → temporary 429 (not accepted); a 5xx on the STATUS read (before any post) stays temporary", async () => {
    await expect(x.status(ctx([info("succeeded"), problem(429, "Too Many Requests", "about:blank", "Too Many Requests")]).ctx, "at", REF)).rejects.toMatchObject({ status: 429, code: "platform_unavailable" });
    await expect(x.status(ctx([new Response("<html>", { status: 503 })]).ctx, "at", REF)).rejects.toMatchObject({ status: 503, code: "platform_unavailable", message: "X is having trouble — try again." });
  });

  test("401 anywhere is status 401 (the handlers turn it into reconnect)", async () => {
    const unauth = () => problem(401, "Unauthorized", "about:blank", "Unauthorized");
    await expect(x.profile(ctx([unauth()]).ctx, "at")).rejects.toMatchObject({ status: 401 });
    await expect(x.prepare(ctx([unauth()]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 401 });
    await expect(x.relayChunk!(ctx([unauth()]).ctx, "at", REF, { offset: 0, total: 3, body: new Uint8Array(3) })).rejects.toMatchObject({ status: 401 });
    await expect(x.finalize(ctx([unauth()]).ctx, "at", S)).rejects.toMatchObject({ status: 401 });
    await expect(x.finalize(ctx([info(), unauth()]).ctx, "at", S)).rejects.toMatchObject({ status: 401 });
    await expect(x.status(ctx([unauth()]).ctx, "at", REF)).rejects.toMatchObject({ status: 401 });
    await expect(x.status(ctx([info("succeeded"), unauth()]).ctx, "at", REF)).rejects.toMatchObject({ status: 401 });
  });
});

describe("weighted length (X's counting rule)", () => {
  // Shared with the phone's test (src/publish/__tests__/adapters.test.ts): both copies of the rule answer the same.
  test.each(X_WEIGHT_VECTORS)("weightedLength(%j) = %i", (text, n) => { expect(weightedLength(text)).toBe(n); });
  test.each(X_LINK_VECTORS)("hasLink(%j) = %s (the same matcher)", (text, link) => { expect(hasLink(text)).toBe(link); });

  test("no invisible literal characters in the source (the ZWJ is written as an escape)", () => {
    const src = readFileSync(join(__dirname, "../platforms/x.ts"), "utf8");
    const invisible = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
    expect(Array.from(src).filter((c) => invisible.includes(c.codePointAt(0)!))).toEqual([]);
  });

  test("a long bare domain that does not fit is left out whole, counted at its plain length", () => {
    const dom = "a".repeat(30) + ".com"; // 34
    expect(cutToWeighted("b".repeat(250) + " " + dom, 280)).toBe("b".repeat(250) + " ");
    expect(cutToWeighted("b".repeat(245) + " " + dom, 280)).toBe("b".repeat(245) + " " + dom);
  });

  test("cutToWeighted never cuts inside a grapheme (ZWJ emoji, combining accent)", () => {
    const family = "👨‍👩‍👧";
    // 276 + 👨(2) + ZWJ(1) = 279, then 👩 does not fit: the whole family is dropped, not left as "👨‍".
    expect(cutToWeighted("a".repeat(276) + family, 280)).toBe("a".repeat(276));
    // e (1) fits at 280, its combining accent does not: the bare "e" is dropped too.
    expect(cutToWeighted("a".repeat(279) + "é", 280)).toBe("a".repeat(279));
    expect(cutToWeighted("a".repeat(278) + "é", 280)).toBe("a".repeat(278) + "é");
    expect(cutToWeighted("a".repeat(270) + family + "bcd", 280)).toBe("a".repeat(270) + family + "bc");
  });

  test("cutToWeighted keeps whole code points and whole links", () => {
    expect(cutToWeighted("hello", 280)).toBe("hello");
    expect(cutToWeighted("a".repeat(300), 280)).toBe("a".repeat(280));
    // 279 + an emoji (2) does not fit: the emoji is dropped whole, never half a surrogate pair.
    const cut = cutToWeighted("a".repeat(279) + "😀", 280);
    expect(cut).toBe("a".repeat(279));
    expect(cutToWeighted("日".repeat(141), 280)).toBe("日".repeat(140));
    // A link that does not fit is left out whole.
    expect(cutToWeighted("a".repeat(270) + " https://example.com", 280)).toBe("a".repeat(270) + " ");
    for (const s of ["😀".repeat(200), "x😀".repeat(150), "日本😀a".repeat(90)]) {
      const c = cutToWeighted(s, 280);
      expect(weightedLength(c)).toBeLessThanOrEqual(280);
      expect(c).toBe(Buffer.from(c, "utf8").toString("utf8")); // no lone surrogate
      expect(s.startsWith(c)).toBe(true);
    }
  });
});

test("no thrown message carries the client secret, the Basic header or a token", async () => {
  const errs: unknown[] = [];
  const grab = (p: Promise<unknown>) => p.catch((e: unknown) => errs.push(e));
  await grab(x.exchange(ctx([ok({ error: "invalid_client" }, 401)]).ctx, { code: "c", codeVerifier: "v" }));
  await grab(x.refresh(ctx([ok({}, 200)]).ctx, "rt-secret"));
  await grab(x.refresh(ctx([new Response("", { status: 500 })]).ctx, "rt-secret"));
  await grab(x.prepare(ctx([problem(403, "nope")]).ctx, "at-secret", INPUT));
  await grab(x.status(ctx([info("succeeded"), new Response("", { status: 400 })]).ctx, "at-secret", REF));
  expect(errs).toHaveLength(5);
  for (const e of errs) {
    expect(e).toBeInstanceOf(PlatformError);
    const all = JSON.stringify({ ...(e as object), message: (e as Error).message });
    for (const s of ["sec", BASIC, Buffer.from("cid:sec").toString("base64"), "Bearer", "at-secret", "rt-secret"]) expect(all).not.toContain(s);
  }
});
