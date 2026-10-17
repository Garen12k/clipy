/**
 * Every word of Home's search, sort and pin (spec docs/superpowers/specs/2026-10-17-home-find-design.md §2.3). Buttons — Pin, Unpin,
 * Clear Search — are title style; the sheet's title, the headings, the sort rows, the no-match line and the VoiceOver labels are
 * sentence style. The casing guard cannot see through a table, so homeFindWords.test.ts pins each word.
 */
export const FIND_WORDS = {
  search: "Search projects",
  sortButton: "Sort projects",
  sortTitle: "Sort by",
  pinned: "Pinned",
  noMatch: "No projects match",
  clear: "Clear Search",
  pin: "Pin",
  unpin: "Unpin",
  sorts: { edited: "Last edited", created: "Date created", name: "Name", length: "Length" },
} as const;
