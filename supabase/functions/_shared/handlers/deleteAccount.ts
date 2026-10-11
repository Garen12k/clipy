import { ApiError } from "../errors.ts";
import type { Deps } from "../types.ts";
import { disconnect } from "./accounts.ts";

/** The one sentence for a deletion that did not finish. The phone shows it as it is; asking again is safe. */
export const DELETE_FAILED = "Couldn't delete the account. Try again.";
/** How long ALL the platforms together get to forget their connections before the deletion goes on without them. */
export const REVOKE_BUDGET_MS = 8000;

const failed = () => new ApiError(500, "delete_failed", DELETE_FAILED);

/**
 * Delete my account, for the CALLER ONLY: `userId` is the id in the verified token (runtime.ts) — nothing of the request's body is read.
 *
 * The order, and why:
 * 1. Each connected platform is asked to forget the connection — the SAME `disconnect` the Accounts screen's Disconnect runs (its
 *    revoke, then its row), best effort: a refusal, a failure or a platform that does not answer within `budgetMs` blocks nothing.
 * 2. Every row of the user is deleted EXPLICITLY (connected accounts with their encrypted tokens, pending connects, post sessions).
 *    The three tables also `references auth.users (id) on delete cascade`, so step 3 alone would remove them — but the tokens are
 *    what matters most, so they go first and do not depend on a constraint: if step 3 then fails, what is left is a bare sign-in
 *    with nothing behind it. The cascade stays the net for a row written between step 2 and step 3 (a connect finishing meanwhile).
 * 3. The sign-in itself (the auth user), LAST: the caller hears `ok` only when it is gone. Any failure in step 2 or 3 is
 *    `delete_failed`, and a second call is safe — each step finds less to do. A user that is already gone (404: a second call
 *    with a token that has not run out yet) is the wanted end, so it is `ok`.
 */
export async function deleteAccount(deps: Deps, userId: string, budgetMs = REVOKE_BUDGET_MS): Promise<{ ok: true }> {
  if (typeof userId !== "string" || !userId) throw new ApiError(401, "unauthorized", "Sign in to Clipy first.");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await deps.db.listAccounts(userId);
    await Promise.race([
      Promise.allSettled(rows.map((r) => disconnect(deps, userId, r.platform))),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, budgetMs); }),
    ]);
  } catch { console.error("delete-account: could not ask the platforms to forget"); }
  finally { if (timer !== undefined) clearTimeout(timer); }

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
