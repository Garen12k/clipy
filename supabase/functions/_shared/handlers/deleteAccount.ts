import { revokeApple } from "../apple.ts";
import { ApiError } from "../errors.ts";
import type { Deps } from "../types.ts";
import { disconnect } from "./accounts.ts";

/** The one sentence for a deletion that did not finish. The phone shows it as it is; asking again is safe. */
export const DELETE_FAILED = "Couldn't delete the account. Try again.";
/** How long ALL the platforms together (and Apple, for an Apple user) get to forget their connections before the deletion goes on without them. */
export const REVOKE_BUDGET_MS = 8000;
/** The longest Apple authorization code accepted from the phone (Apple's are far shorter; this only bounds what is read). */
export const APPLE_CODE_MAX = 2048;

const failed = () => new ApiError(500, "delete_failed", DELETE_FAILED);

/**
 * The Apple authorization code an Apple user's phone sends with the request (`{ "appleCode": "…" }`), or null: a string of 1 to
 * APPLE_CODE_MAX printable ASCII characters without spaces. Nothing else of the body is read — never WHO (that is the token's).
 */
export function appleCodeOf(body: unknown): string | null {
  const v = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as { appleCode?: unknown }).appleCode : undefined;
  return typeof v === "string" && v.length > 0 && v.length <= APPLE_CODE_MAX && /^[\x21-\x7e]+$/.test(v) ? v : null;
}

/**
 * Delete my account, for the CALLER ONLY: `userId` is the id in the verified token (runtime.ts) — of the body only Apple's code is read (`appleCodeOf`).
 *
 * The order, and why:
 * 1. Each connected platform is asked to forget the connection — the SAME `disconnect` the Accounts screen's Disconnect runs (its
 *    revoke, then its row), best effort: a refusal, a failure or a platform that does not answer within `budgetMs` blocks nothing.
 *    For an Apple user whose phone sent `appleCode`, Apple is asked beside them, first, to revoke what that sign-in granted
 *    (`revokeApple`, apple.ts — only while its switch is on): best effort too, inside the same budget, and always before step 3.
 * 2. Every row of the user is deleted EXPLICITLY (connected accounts with their encrypted tokens, pending connects, post sessions).
 *    The three tables also `references auth.users (id) on delete cascade`, so step 3 alone would remove them — but the tokens are
 *    what matters most, so they go first and do not depend on a constraint: if step 3 then fails, what is left is a bare sign-in
 *    with nothing behind it. The cascade stays the net for a row written between step 2 and step 3 (a connect finishing meanwhile).
 * 3. The sign-in itself (the auth user), LAST: the caller hears `ok` only when it is gone. Any failure in step 2 or 3 is
 *    `delete_failed`, and a second call is safe — each step finds less to do. A user that is already gone (404: a second call
 *    with a token that has not run out yet) is the wanted end, so it is `ok`.
 */
export async function deleteAccount(deps: Deps, userId: string, budgetMs = REVOKE_BUDGET_MS, appleCode: string | null = null): Promise<{ ok: true }> {
  if (typeof userId !== "string" || !userId) throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");

  const forget: Promise<unknown>[] = appleCode ? [revokeApple(deps, appleCode)] : [];
  try {
    const rows = await deps.db.listAccounts(userId);
    for (const r of rows) forget.push(disconnect(deps, userId, r.platform));
  } catch { console.error("delete-account: could not ask the platforms to forget"); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(forget),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, budgetMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }

  try { await deps.db.deleteUserData(userId); }
  catch { console.error("delete-account: rows not deleted"); throw failed(); }

  let refusal: { status?: number; code?: string } | null;
  try { refusal = await deps.deleteAuthUser(userId); }
  catch { console.error("delete-account: sign-in not deleted (no answer)"); throw failed(); }
  if (refusal && refusal.status !== 404) {
    console.error("delete-account: sign-in not deleted", refusal.status ?? "", typeof refusal.code === "string" ? refusal.code : "");
    throw failed();
  }
  return { ok: true };
}
