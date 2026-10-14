import { createPublicKey, verify } from "crypto";
import { appleClientSecret, appleRevokeOn, pemBody, revokeApple } from "../apple.ts";
import type { Deps } from "../types.ts";
import { appleKey, fakeDeps } from "./fakes.ts";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const IAT = NOW.getTime() / 1000;
const CODE = "c0de1234.0.abcd.EfGh-ij_k";
const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const envOf = (pairs: [string, string][]) => { const m = new Map(pairs); return { get: (n: string) => m.get(n) }; };

let errors: jest.SpyInstance, logs: jest.SpyInstance;
beforeEach(() => { errors = jest.spyOn(console, "error").mockImplementation(() => {}); logs = jest.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { errors.mockRestore(); logs.mockRestore(); });
const said = () => JSON.stringify([...errors.mock.calls, ...logs.mock.calls]);

async function on(): Promise<{ deps: Deps; fetch: jest.Mock; pem: string }> {
  const { pem } = await appleKey();
  const fetch = jest.fn();
  return { deps: fakeDeps({ env: envOf([["APPLE_REVOKE_KEY", pem], ["APPLE_KEY_ID", "ABC123DEFG"]]), fetch: fetch as unknown as typeof globalThis.fetch }), fetch, pem };
}
const form = (init: { body: string }) => new URLSearchParams(init.body);

describe("the client secret", () => {
  test("an ES256 JWT as Apple describes it: header, claims, base64url, and a 64-byte r‖s signature that verifies", async () => {
    const k = await appleKey();
    const jwt = await appleClientSecret(k.pem, "ABC123DEFG", NOW);
    expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [h, p, s] = jwt.split(".");
    expect(part(h)).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(part(p)).toEqual({ iss: "H7WG867R7K", iat: IAT, exp: IAT + 300, aud: "https://appleid.apple.com", sub: "com.astinos.clipy" });
    const sig = Buffer.from(s, "base64url");
    expect(sig).toHaveLength(64);
    const data = Buffer.from(`${h}.${p}`);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.publicKey, sig, data)).toBe(true);
    // Node's own verifier, told the JWS form (RFC 7518 §3.4: R ‖ S, 32 bytes each), not DER: WebCrypto's output IS the JWS signature.
    expect(verify("sha256", data, { key: createPublicKey({ key: k.spki, format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });

  test("the key is read as Apple's file, with CRLF, squeezed onto one line, or with literal \\n", async () => {
    const { pem } = await appleKey();
    const want = pemBody(pem);
    expect(want.length).toBeGreaterThan(100);
    expect(pemBody(pem.replace(/\n/g, "\r\n"))).toEqual(want);
    expect(pemBody(pem.replace(/\s/g, ""))).toEqual(want);           // the README's clipboard command
    expect(pemBody(pem.replace(/\n/g, "\\n"))).toEqual(want);
    await expect(appleClientSecret(pem.replace(/\s/g, ""), "ABC123DEFG", NOW)).resolves.toMatch(/^eyJ/);
  });
});

describe("the switch", () => {
  test("on only with BOTH secrets, neither empty", () => {
    expect(appleRevokeOn(envOf([]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", "k"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", " "], ["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(false);
    expect(appleRevokeOn(envOf([["APPLE_REVOKE_KEY", "k"], ["APPLE_KEY_ID", "ABC123DEFG"]]))).toBe(true);
  });

  test("off: Apple is never asked", async () => {
    const fetch = jest.fn();
    expect(await revokeApple(fakeDeps({ fetch: fetch as unknown as typeof globalThis.fetch }), CODE)).toBe("off");
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("exchange, then revoke", () => {
  test("two form posts, exactly: the code for tokens, then the refresh token revoked", async () => {
    const { deps, fetch } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", token_type: "Bearer", expires_in: 3600, refresh_token: "apple-refresh", id_token: "a.b.c" }))
      .mockResolvedValueOnce(answer(200));
    expect(await revokeApple(deps, CODE)).toBe("revoked");
    expect(fetch).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetch.mock.calls[0];
    expect(tokenUrl).toBe("https://appleid.apple.com/auth/token");
    expect(tokenInit.method).toBe("POST");
    expect(tokenInit.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const secret = form(tokenInit).get("client_secret")!;
    expect(part(secret.split(".")[1]).sub).toBe("com.astinos.clipy");
    expect(tokenInit.body).toBe(`client_id=com.astinos.clipy&client_secret=${secret}&code=${CODE}&grant_type=authorization_code`);

    const [revokeUrl, revokeInit] = fetch.mock.calls[1];
    expect(revokeUrl).toBe("https://appleid.apple.com/auth/revoke");
    expect(revokeInit.method).toBe("POST");
    expect(revokeInit.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(revokeInit.body).toBe(`client_id=com.astinos.clipy&client_secret=${secret}&token=apple-refresh&token_type_hint=refresh_token`);
    expect(logs).toHaveBeenCalledWith("apple revoke: done");
  });

  test("only an access token came back: that is revoked, with its hint", async () => {
    const { deps, fetch } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", token_type: "Bearer", expires_in: 3600 })).mockResolvedValueOnce(answer(200));
    expect(await revokeApple(deps, CODE)).toBe("revoked");
    expect(form(fetch.mock.calls[1][1]).get("token")).toBe("apple-access");
    expect(form(fetch.mock.calls[1][1]).get("token_type_hint")).toBe("access_token");
  });

  const failures: [string, (f: jest.Mock) => void, number, string][] = [
    ["the code is refused (spent or older than five minutes)", (f) => f.mockResolvedValueOnce(answer(400, { error: "invalid_grant" })), 1, "invalid_grant"],
    ["the client is refused (wrong key, key id or App ID)", (f) => f.mockResolvedValueOnce(answer(400, { error: "invalid_client" })), 1, "invalid_client"],
    ["an answer without a token", (f) => f.mockResolvedValueOnce(answer(200, { token_type: "Bearer" })), 1, "no token"],
    ["an answer that is not JSON", (f) => f.mockResolvedValueOnce(new Response("<html>", { status: 200 })), 1, "no token"],
    ["the revoke is refused", (f) => f.mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request" })), 2, "invalid_request"],
    ["the network fails", (f) => f.mockRejectedValueOnce(new TypeError("fetch failed")), 1, "TypeError"],
  ];
  test.each(failures)("%s: failed, said in the log by status and code only", async (_n, script, calls, word) => {
    const { deps, fetch } = await on();
    script(fetch);
    expect(await revokeApple(deps, CODE)).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(calls);
    expect(said()).toContain(word);
    expect(logs).not.toHaveBeenCalledWith("apple revoke: done");
  });

  test("a key that will not import: failed, and Apple is never asked", async () => {
    const fetch = jest.fn();
    const deps = fakeDeps({ env: envOf([["APPLE_REVOKE_KEY", "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5\n-----END PRIVATE KEY-----"], ["APPLE_KEY_ID", "ABC123DEFG"]]), fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await revokeApple(deps, CODE)).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
    expect(said()).toContain("apple revoke: failed");
  });

  test("nothing of the code, the secret, a token or the key reaches the log — success or failure", async () => {
    const { deps, fetch, pem } = await on();
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    await revokeApple(deps, CODE);
    fetch.mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request", detail: "apple-refresh" }));
    await revokeApple(deps, CODE);
    const secret = form(fetch.mock.calls[0][1]).get("client_secret")!;
    const text = said();
    for (const s of [CODE, "c0de1234", secret.split(".")[2], "apple-refresh", "apple-access", pem.split("\n")[1].slice(0, 20), "eyJ"]) expect(text).not.toContain(s);
  });
});
