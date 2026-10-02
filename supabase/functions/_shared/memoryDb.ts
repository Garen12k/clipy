import type { AccountRow, Db, OAuthStateRow, PostSessionRow } from "./types.ts";

/** In-memory Db for tests (and a reference for supabaseDb's behaviour). */
export function memoryDb(): Db {
  const accounts = new Map<string, AccountRow>();
  const states = new Map<string, OAuthStateRow>();
  const sessions = new Map<string, PostSessionRow>();
  let n = 0;
  const k = (u: string, p: string) => `${u}|${p}`;
  return {
    getAccount: async (u, p) => accounts.get(k(u, p)) ?? null,
    listAccounts: async (u) => [...accounts.values()].filter((a) => a.userId === u),
    upsertAccount: async (row) => { accounts.set(k(row.userId, row.platform), { ...row }); },
    deleteAccount: async (u, p) => { accounts.delete(k(u, p)); },
    putState: async (row) => { states.set(row.state, { ...row }); },
    takeState: async (s) => { const row = states.get(s) ?? null; states.delete(s); return row; },
    createSession: async (row) => { const id = `session-${++n}`; sessions.set(id, { ...row, id }); return id; },
    getSession: async (id) => sessions.get(id) ?? null,
    updateSession: async (id, patch) => { const s = sessions.get(id); if (s) sessions.set(id, { ...s, ...patch }); },
    claimSession: async (id, from, to) => { const s = sessions.get(id); if (!s || s.status !== from) return false; sessions.set(id, { ...s, status: to }); return true; },
  };
}
