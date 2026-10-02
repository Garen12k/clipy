import { PlatformError } from "../errors.ts";
import type { PlatformId } from "../types.ts";

/** Reads a platform response as JSON; on a non-2xx throws PlatformError with the message `pick` finds (or the raw text). */
export async function readJson<T>(platform: PlatformId, res: Response, pick: (body: unknown) => string | undefined): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new PlatformError(platform, res.status, pick(body) ?? (text.slice(0, 300) || `${platform} returned ${res.status}`));
  return body as T;
}
export const formBody = (params: Record<string, string>) => new URLSearchParams(params).toString();
export const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
