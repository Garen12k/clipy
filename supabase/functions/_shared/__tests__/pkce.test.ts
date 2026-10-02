import { challengeFor, randomToken } from "../pkce.ts";

test("randomToken is url-safe and unique", () => {
  const a = randomToken(), b = randomToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a).not.toBe(b);
});

test("challengeFor matches the RFC 7636 example", async () => {
  expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});