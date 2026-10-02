import { ApiError, PlatformError, toResponse } from "../errors.ts";

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

test("unknown errors are a generic 500", async () => {
  const r = toResponse(new Error("boom"));
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({ code: "internal", message: "Something went wrong." });
});