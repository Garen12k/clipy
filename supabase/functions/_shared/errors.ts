export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
/** The platform is busy, timed out or failing (408, 429, 5xx): worth asking again, never a verdict on the video. */
export const isTemporaryStatus = (status: number) => status === 408 || status === 429 || (status >= 500 && status <= 599);
/** A final refusal by the platform (a 4xx that is not auth, a timeout or rate limiting). Auth failures become `reconnect` in withPlatformAuth. */
export const isRejectionStatus = (status: number) => status >= 400 && status < 500 && status !== 401 && !isTemporaryStatus(status);
/** A failure reported by a platform; `message` is the platform's own text, shown to the user verbatim. */
export class PlatformError extends ApiError {
  /** The platform's machine-readable reason (e.g. YouTube's `insufficientPermissions`), when it sent one. Never shown to the user. */
  public reason?: string;
  /** A temporary failure gets its own code, so the phone keeps a finished upload and asks again instead of uploading anew. */
  constructor(public platform: string, status: number, message: string, code = isTemporaryStatus(status) ? "platform_unavailable" : "platform_error") { super(status, code, message); }
}
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
export function toResponse(e: unknown): Response {
  // A platform can hand back any status (a 3xx, a 2xx with a bad body); only 400–599 are error responses, and `new Response` throws outside 200–599.
  if (e instanceof ApiError) return json({ code: e.code, message: e.message }, e.status >= 400 && e.status <= 599 ? e.status : 502);
  console.error(e);
  return json({ code: "internal", message: "Something went wrong." }, 500);
}
