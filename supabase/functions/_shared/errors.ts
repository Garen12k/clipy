export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
/** A failure reported by a platform; `message` is the platform's own text, shown to the user verbatim. */
export class PlatformError extends ApiError {
  constructor(public platform: string, status: number, message: string, code = "platform_error") { super(status, code, message); }
}
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
export function toResponse(e: unknown): Response {
  if (e instanceof ApiError) return json({ code: e.code, message: e.message }, e.status);
  console.error(e);
  return json({ code: "internal", message: "Something went wrong." }, 500);
}