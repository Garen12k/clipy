import { useEffect, useMemo, useRef, useState } from "react";
import { homeRows, keepListed, orderProjects, showFind, type HomeSort } from "./homeOrder";
import { loadHomePrefs, saveHomePrefs, type HomePrefs } from "./homePrefs";
import type { ProjectSummary } from "./storage";

/**
 * Home's search, sort and pins: the listed projects + the phone's preference (homePrefs.ts) + the typed query → the rows the list
 * draws. The query is memory only (kept while Home is mounted). Every change of the sort or a pin is written at once; nothing here
 * ever touches a project. `listed`: pins whose project is not in the listing are dropped only once a listing has come back.
 */
export function useHomeFind(projects: readonly ProjectSummary[], listed: boolean) {
  const [prefs, setPrefs] = useState<HomePrefs>(loadHomePrefs);
  const [query, setQuery] = useState("");
  /** The field has the keyboard: it is kept while focused, so emptying it under six projects never pulls it from under the finger. */
  const [focused, setFocused] = useState(false);
  const now = useRef(prefs);   // the latest value, for two changes in one tap
  const change = (next: HomePrefs) => { now.current = next; setPrefs(next); saveHomePrefs(next); };

  useEffect(() => {
    if (!listed) return;
    const kept = keepListed(now.current.pins, projects.map((p) => p.id));
    if (kept !== now.current.pins) change({ ...now.current, pins: kept });
  }, [projects, listed]);
  // The last project went with a query typed: clear it, or it would hide the next project made. The field went with the list
  // (Home's empty state), so it has no keyboard any more either — and an unmounted field sends no blur.
  useEffect(() => { if (listed && projects.length === 0) { setQuery(""); setFocused(false); } }, [projects, listed]);

  const order = useMemo(() => orderProjects(projects, { sort: prefs.sort, pins: prefs.pins, query }), [projects, prefs, query]);
  const rows = useMemo(() => homeRows(order, prefs.sort), [order, prefs.sort]);
  const pinned = useMemo(() => new Set(prefs.pins), [prefs.pins]);
  const shownCount = order.pinned.length + order.rest.length;

  return {
    query, setQuery, clearQuery: () => setQuery(""), setFocused,
    sort: prefs.sort,
    setSort: (sort: HomeSort) => { if (sort !== now.current.sort) change({ ...now.current, sort }); },
    isPinned: (id: string) => pinned.has(id),
    togglePin: (id: string) => {
      const pins = now.current.pins;
      change({ ...now.current, pins: pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id] });
    },
    unpin: (id: string) => { if (now.current.pins.includes(id)) change({ ...now.current, pins: now.current.pins.filter((x) => x !== id) }); },
    rows,
    showFind: showFind(projects.length, query) || focused,
    /** A query is typed and nothing matches (there ARE projects: no projects at all is Home's own empty state). */
    noMatch: projects.length > 0 && shownCount === 0,
  };
}
