/**
 * The phone's language, for Remove filler words — the only file that asks. Captions store no language: they were recognised in the
 * phone's (`SFSpeechRecognizer(locale: Locale.current)`), and the filler table is English ("um" is a common German word). Hermes reads
 * the same setting through Intl. A language that cannot be read counts as English.
 */
export function phoneLanguage(): string | null {
  try {
    const locale: unknown = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof locale !== "string") return null;
    const first = locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
    return /^[a-z]{2,3}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

/** True when filler words are looked for: the phone speaks English (or does not say). */
export const fillersSpoken = (): boolean => { const l = phoneLanguage(); return l === null || l === "en"; };
