import { ApiError, isRejectionStatus, isTemporaryStatus, PlatformError, toResponse } from "../errors.ts";

test("ApiError becomes its status and {code,message}", async () => {
  const r = toResponse(new ApiError(404, "not_connected", "Connect YouTube first."));
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ code: "not_connected", message: "Connect YouTube first." });
});

test("PlatformError keeps the platform's own words", async () => {
  const r = toResponse(new PlatformError("youtube", 403, "The request cannot be completed because you have exceeded your quota."));
  expect(r.status).toBe(403);
  expect(await r.json()).toEqual({ code: "platform_error", message: "The request cannot be completed because you have exceeded your quota." });
});

test("an upstream status outside 400–599 becomes 502 instead of throwing", async () => {
  for (const status of [200, 302, 308, 600, 0]) {
    const r = toResponse(new PlatformError("youtube", status, "odd"));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ code: "platform_error", message: "odd" });
  }
});

test.each([
  [400, "platform_error"], [403, "platform_error"], [404, "platform_error"],
  [408, "platform_unavailable"], [429, "platform_unavailable"], [500, "platform_unavailable"], [502, "platform_unavailable"], [503, "platform_unavailable"],
])("a platform %i is sent as %s with the same status", async (status, code) => {
  const r = toResponse(new PlatformError("tiktok", status, "words"));
  expect(r.status).toBe(status);
  expect(await r.json()).toEqual({ code, message: "words" });
});

test("a code set by the caller is kept whatever the status", async () => {
  expect(await toResponse(new PlatformError("youtube", 502, "x", "platform_error")).json()).toMatchObject({ code: "platform_error" });
  expect(await toResponse(new ApiError(502, "platform_unreachable", "x")).json()).toMatchObject({ code: "platform_unreachable" });
  expect(await toResponse(new ApiError(401, "reconnect", "x")).json()).toMatchObject({ code: "reconnect" });
});

test("rejection and temporary statuses never overlap", () => {
  for (let s = 100; s < 700; s++) expect(isRejectionStatus(s) && isTemporaryStatus(s)).toBe(false);
  expect([400, 403, 404, 409, 422].every(isRejectionStatus)).toBe(true);
  expect([401, 408, 429, 500, 503].some(isRejectionStatus)).toBe(false);
});

test("unknown errors are a generic 500", async () => {
  const r = toResponse(new Error("boom"));
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ code: "internal", message: "Something went wrong." });
});