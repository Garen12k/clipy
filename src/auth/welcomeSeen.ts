import "expo-sqlite/localStorage/install";

/** The one key of the "welcome screen was seen" flag. Nothing outside this file reads or writes it. */
export const WELCOME_SEEN_KEY = "clipy.welcomeSeen";

/**
 * Whether the welcome screen has been left once (signed in, or "Continue without an account"). Synchronous — the same localStorage
 * the Supabase client keeps its session in — so the first render already knows and the projects never flash. Storage that fails
 * counts as seen: nobody is ever held on the welcome screen.
 */
export function hasSeenWelcome(): boolean {
  try { return localStorage.getItem(WELCOME_SEEN_KEY) !== null; } catch { return true; }
}

export function markWelcomeSeen(): void {
  try { localStorage.setItem(WELCOME_SEEN_KEY, "1"); } catch { /* not stored: hasSeenWelcome answers "seen" when storage fails */ }
}
