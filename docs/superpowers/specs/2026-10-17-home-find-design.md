# Home search, sort and pin (design)

Date: 2026-10-17. Branch: `home-find` (from `next-build`, at 5ea0795). Status: approved by the owner from a drawing; this spec fixes the details.
Plan: `docs/superpowers/plans/2026-10-17-home-find.md`.

## 0. What the owner gets

1. Under Home's header (the glass pill and the title "Projects"), at the top of the list: a search field **Search projects** with a magnifier, and beside it a **sort** button. Both scroll with the cards; neither is pinned over the list.
2. The field and the sort button show once there are **6 or more projects** — or while something is typed in the field (so deleting projects down to 5 never takes the field away from under a search). Below 6 nothing is added and Home looks exactly as today, except for the Pinned headings (point 4).
3. Typing matches project names as you type (case and accents do not matter). Nothing matching → one plain line **No projects match** and a **Clear Search** button.
4. The sort button opens a sheet **Sort by**: **Last edited** (the default, ticked), **Date created**, **Name**, **Length**. Choosing one ticks it, closes the sheet and re-orders the cards. The choice is remembered on this phone.
5. Hold a project (or tap its More) → the actions sheet gains **Pin** (or **Unpin** on a pinned project), first in the sheet. Pinned projects show first under a small heading **Pinned**, then the rest under a heading naming the sort (**Last edited**, …). The headings are there only while at least one shown project is pinned. A pinned card carries a small pin mark on its picture (decoration, not a target; VoiceOver reads "Pinned" after the name).
6. Pinning never changes a project: nothing is written into the project, its "edited" time does not move, its kept undo history stays.

Out of scope: folders, tags, multi-select, searching anything but the name, sorting order reversed, pins across phones, a search that survives leaving Home for good (it survives a trip to the editor while Home stays mounted, see §5.3).

## 1. What exists (read on this branch)

- Home is `ProjectsScreen` in `app/index.tsx`: the header `home-header` (the glass pill `home-header-actions` with Post / Open Project File / Accounts, then the title), the constant wrapper `home-list` (its `pointerEvents` and `opacity` change while `inert = busy || transfer !== null`), and inside it the loading state, the `EmptyState` (no projects) or the `FlatList` `home-grid` with `numColumns={2}`, wrapped in `EnterView`. The two bottom actions `home-actions` float over the list (Quick Edit's glass pill, New Project). Three glass surfaces in all (`home.glass.test.tsx`, `toolbar.glass.test.tsx`).
- `ProjectCard` (`src/projects/ProjectCard.tsx`): cell `project-card-cell` (`width: "50%"`), the picture (THE VoiceOver button, labelled with the name), the length pill top right (`project-length`, `scrimStrong` / `onScrim`), the words, More. Its two icons are `plain` (`PLAIN` in `src/ui/__tests__/sfSymbols.map.test.ts`: `"src/projects/ProjectCard.tsx": 2`).
- `ProjectActionsSheet` (`src/projects/ProjectActionsSheet.tsx`): the kit `Sheet` titled with the project's name; Rename / Duplicate / Save As Style / Save a Copy (not on a broken project), Delete. `run(fn, needsAlert)` closes first and waits `AFTER_SHEET_MS` only before an alert or a system sheet.
- `useProjects()` (`src/projects/useProjects.ts`): `projects` (initially `[]`), `loading`, `reload` (no catch: a failed listing leaves `projects` as it was), `remove(id)` (`storage.deleteProject`, then `reload`; a failure is a toast).
- `storage.listProjects()` (`src/projects/storage.ts:240-253`) → `ProjectSummary { id, name, durationSec, updatedAt, thumbUri, broken, postedTo, coverTitle }`, sorted broken last, then `updatedAt` newest first. `durationSec` is already `totalDuration(p)` of the loaded document. The document has `createdAt` (`Project.createdAt`, `types.ts:569`), but the summary does not carry it. A broken project is `{ name: "Can't open", durationSec: 0, updatedAt: "" }`.
- `updatedAt` is stamped by the editor's ops on every change (`ops.ts:30`, `beats.ts`, `collageOps.ts`), by Rename (`storage.ts:296`), by a restore (`:496`), and at creation / duplication. A save of an unchanged project (the leave save, the history's write) does not stamp it — so it already IS "last edited", and it is today's order.
- Phone preferences: TWO mechanisms exist. (a) The synchronous `localStorage` of `expo-sqlite/localStorage/install` (the same store the Supabase session lives in), one key per module: `clipy.welcomeSeen` (`src/auth/welcomeSeen.ts`), `clipy.readAloud.v1` (`src/editor/speechPrefs.ts`), `clipy.noiseProbe.v1`; under Jest `jest.setup.ts:109-113` makes it a `Map`. (b) `<documents>/prefs.json` (`src/projects/prefs.ts`, recent emoji; asynchronous, through `expoFs`).
- The kit: `Field` (`src/ui/Field.tsx`: `fieldStyle` + the family's tile / text / muted), `IconButton` (40 pt, `hitSlop` 8), `Sheet`, `QuietButton`, `Body`, `Icon`, `PressableScale`, `largeContent`. `swap-vertical-outline` is already an icon of the app (`arrow.up.arrow.down`, Flip vertical); `search-outline` and `pin-outline` are not (`USED` has 131 names).
- Tests that draw Home mock `@/src/projects`' `storage` (e.g. `home.layout.test.tsx:15-17`); the light audit is `wear("light")` + `leftovers({ onPicture: ["project-length", "project-cover-title"] })` (`home.layout.test.tsx:255-275`).

## 2. Decisions

### 2.1 Pin and sort are phone preferences, never project data

Pinning must not write `project.json`: a write changes the file's stamp and so drops the project's kept undo history (AGENTS.md, Undo history: `loadHistory` gives a history only to the stamp of the text it was written beside), it would stamp `updatedAt` and move the project in "Last edited", and it costs a turn of the project's chain. So pins and the sort are stored together, as ONE value of the synchronous `localStorage` (mechanism (a) above), key **`clipy.home.v1`**, by ONE module, `src/projects/homePrefs.ts` — the only file that names the key.

Why `localStorage` and not `prefs.json`: it is synchronous, so the first render of Home already has the sort and the pins (no reorder flash after the list appears), and it is the mechanism of every other small phone preference; `prefs.json` is asynchronous and holds the emoji row only.

The stored value:

```json
{ "version": 1, "sort": "edited", "pins": ["<project id>", "…"] }
```

Reading (`loadHomePrefs`), the version FIRST, then the shape (as the styles file does):
- nothing stored, storage that throws → the defaults (`sort: "edited"`, no pins);
- not JSON, not an object, no integer `version` ≥ 1 → **damaged** → the defaults (the next change overwrites it: a preference has nothing worth keeping aside);
- `version` > 1 → **newer** (a newer Clipy wrote it, then an older build was installed) → the defaults, and **every write is refused** (`saveHomePrefs` reads the version again before each write), so the newer value is kept as it is; this session's changes stay in memory only;
- version 1: `sort` one of the four ids, else the default sort (pins kept); `pins` an array, else none; from it only strings of 1–64 characters, each once, in their order.

Never a crash: every read and write is inside `try`.

Pins are a SET of project ids (their stored order is the order they were pinned in, and means nothing on screen). **No limit**: a pin is dropped as soon as its project is not listed (below), so the list can never be longer than the number of projects; a cap would only add a refusal to word.

- **Dropped when not listed** (`keepListed`, pure): whenever a listing has SUCCEEDED (`useProjects` now says `listed`), pins whose id is not among the listed ids are dropped and the value written — only when something was dropped. A failed listing never prunes (the old list stays, and the very first failure would otherwise drop every pin against the initial empty list). A broken project IS listed (its folder exists), so its pin is kept — it may read again later — but it is never shown in the Pinned part and its sheet offers no Pin / Unpin.
- **Deleting a project removes its pin** at once: `useProjects().remove` now answers whether the project was deleted, and Home unpins on `true` (a failed delete keeps the pin). The prune of the reload that follows would drop it too; the explicit unpin is what the tests pin.
- **Never pinned:** a duplicate, a restored `.clipy`, a Quick Edit draft, a new project — all get NEW ids, so nothing needs doing; a test pins the duplicate's case.
- Rename keeps the pin (same id).

### 2.2 Order and match are pure (`src/projects/homeOrder.ts`)

No React, no Expo, type imports only. Vectors in `src/projects/__tests__/homeOrder.test.ts`.

**What "Last edited" and "Date created" read.** Last edited = the summary's `updatedAt` (§1: already the edited time), newest first. Date created = the project's `createdAt`, newest first — the summary gains `createdAt` (`listProjects` copies `p.createdAt`; a broken project's is `""`). A date that does not parse counts as the oldest.

**Length** = the summary's `durationSec`, longest first. It is already computed by `listProjects` from the loaded document (`totalDuration(p)`, the number on every card's pill), so nothing new is read or computed. A broken project's is 0.

**Name** = A → Z by `compareNames`. **Changed from "locale-aware" (decision 2) — concrete reason:** Hermes' `Intl.Collator` / `localeCompare(…, options)` on iOS is not something a test here can pin — Jest runs Node's full ICU, the phone runs Hermes, and a vector that passes in Jest could order differently on the phone. So the comparison is our own and deterministic: both names are FOLDED (below), split into runs of ASCII digits and runs of everything else; a digit run compares by its number (leading zeros ignored: "Project 2" < "Project 10"), any other run by UTF-16 code unit of the folded text; a name that is a prefix of the other comes first. Digits sort before letters, Latin before Greek, Cyrillic, Hebrew, Arabic, CJK (code-point order of scripts). What it gives up: a language's own alphabet where it differs from code-point order (Persian پ چ ژ گ sort after all Arabic letters; Swedish å ä ö fold to a / o; CJK by code point, not by reading). Accepted: a projects list, not a dictionary — and the order is the same on every phone.

**Ties** (every sort): broken projects last (as today), then the chosen order, then `compareNames`, then the raw name by code unit (so "Beach" before "beach"), then the id. Stable whatever order the listing came in.

**Folding** (`foldName`), used by the match and the name order alike: `toLowerCase()`, then `normalize("NFD")`, then drop the code points of a hand-written table (no `\p{…}`, as `revealUnits` / `speakableText` do): the combining diacritics (U+0300–036F, U+1AB0–1AFF, U+1DC0–1DFF, U+20D0–20FF, U+FE20–FE2F), the Hebrew points (U+0591–05BD, 05BF, 05C1–05C2, 05C4–05C5, 05C7), the Arabic marks (U+0610–061A, 064B–065F, 0670, 06D6–06DC, 06DF–06E4, 06E7–06E8, 06EA–06ED), the tatweel U+0640, ZWNJ / ZWJ U+200C–200D and the variation selectors U+FE00–FE0F; and the Greek final sigma ς is read as σ.

What that does:
- Latin, Greek, Cyrillic, Vietnamese: accents and case do not matter ("Été" = "ete", "Tiếng Việt" = "tieng viet", "İstanbul" = "istanbul", "ΟΔΟΣ" = "οδοσ").
- **Arabic:** the short vowels and other harakat (fatha, damma, kasra, sukun, shadda, tanwin, the dagger alef) are ignored, and — because NFD splits them off — so are the hamza and madda seats: أ إ آ match ا, ؤ matches و, ئ matches ي; the tatweel is ignored ("مـــدرسة" = "مدرسة"). NOT folded (they are letters, not marks, and a typist means them): ة / ه, ى / ي, a lone ء. Arabic presentation forms (U+FB50–FEFF) are not decomposed by NFD and stay as they are (rare in typed text).
- **Persian:** ZWNJ is ignored, so "می‌خواهم" is found by "میخواهم".
- **Hebrew:** points (niqqud, cantillation) are ignored.
- **Indic scripts, Thai, Lao …:** their vowel signs and viramas are NOT in the table (they are part of the word, not an accent): "हिंदी" is found by "हिं", not by "हिदी".
- **CJK:** unchanged; a substring of characters matches. Korean syllables become jamo in NFD on BOTH sides, so a substring still matches (and a half-typed syllable finds its words).
- Emoji: "❤️" matches "❤" (the variation selector is dropped); a ZWJ sequence matches its parts.

**Match** (`matchesQuery(name, query)`): the query is trimmed, then folded; empty = everything; else a substring of the folded name. Internal spaces are kept. A broken project matches by its shown name, "Can't open".

**Order** (`orderProjects(list, { sort, pins, query })` → `{ pinned, rest }`): the list filtered by the match, sorted as above; `pinned` = the shown projects that are pinned and not broken, `rest` = all the others — each part in the chosen order.

**Rows** (`homeRows(order, sort)`): the list drawn as rows: with no pinned project in view, rows of two cards only (no heading — Home as today); else a heading row "Pinned", the pinned cards in rows of two, and — when the rest is not empty — a heading row naming the sort, the rest in rows of two. Keys: `heading:pinned`, `heading:rest`, `cards:<id>,<id>`.

**When the find row shows** (`showFind(count, query)`): `count >= 6` (all listed projects, broken included) or `query !== ""` (even a typed space keeps it).

### 2.3 The screen

**Where things go.** `home-grid` stays the one `FlatList` inside `home-list` and `EnterView`, but its data is now `homeRows` (a single column of rows; a cards row is a `flexDirection: "row"` view of up to two `ProjectCard`s, whose cells stay `width: "50%"`, so the grid looks exactly as with `numColumns={2}`: the same two columns, the same 16-pt gutter, an odd last card at the leading side). The find row is the list's `ListHeaderComponent` — passed as an ELEMENT, never as a component defined inline (a new component type on every render would remount the field and drop the keyboard). The no-match line is its `ListEmptyComponent`. So: the header `home-header`, the glass pill, the title, the bottom actions and every layout number of them are untouched; still exactly THREE glass surfaces; the list's `contentContainerStyle` is unchanged.

**The find row** (`HomeFind`, `src/projects/HomeFind.tsx`, testID `home-find`): one row, `gap` sm, padded by `theme.space.sm` at the sides (8 + the list's 8 = the 16-pt gutter, like the cards) and at the bottom. The kit `Field` (`home-search`): placeholder and VoiceOver label "Search projects", `returnKeyType="search"`, `autoCorrect={false}`, `autoCapitalize="none"`, `clearButtonMode="while-editing"` (the system's own clear button), its left padding widened by the magnifier's room; the magnifier `search-outline` (`magnifyingglass`) in `s.muted` drawn over the field's leading edge, no touches, hidden from VoiceOver. Then an `IconButton` `swap-vertical-outline`, label "Sort projects". The field's text is user input: no `fit`, the kit's cap (chrome role, `screen` 1.35). Nothing in the row is `fit`.

**Headings** (`HomeHeading`): a muted `Body` at `theme.type.label`, `accessibilityRole="header"`, on the gutter (`paddingHorizontal: theme.space.sm`), `paddingTop: md`, `paddingBottom: xs` — the kit `Group`'s label look. Sentence style: "Pinned", "Last edited", "Date created", "Name", "Length".

**No match** (`HomeNoMatch`, `home-no-match`): only when a query is typed and nothing matches: the muted line "No projects match" and a `QuietButton` "Clear Search", which empties the query (the keyboard is not opened again). The empty state of NO projects (`EmptyState`) is unchanged and still wins when there are none.

**The sort sheet** (`SortSheet`, `src/projects/SortSheet.tsx`): the kit `Sheet`, title "Sort by", four rows in `HOME_SORTS` order, each a `PressableScale` of `theme.size.row` (48) with a separator between rows, the label `Body` and — on the picked row only — `checkmark-outline` in `s.accentInk` (the mark, never colour alone); `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `largeContent(label)`. A tap on any row (the picked one too) sets the sort and closes the sheet. Opening it first dismisses the keyboard and clears the stale `pending` / `quickOpen` flags as Home's other sheets do.

**Pin / Unpin**: `ProjectActionsSheet` takes two OPTIONAL props, `isPinned?: (id) => boolean` and `onPin?: (p) => void`; with `onPin` given and the project not broken, a `SecondaryButton` "Pin" / "Unpin" comes FIRST, and runs at once (`run(onPin, false)`: no alert follows). Home passes `find.togglePin`. Optional so every existing caller and test is untouched.

**The pin mark**: `ProjectCard` takes an optional `pinned?: boolean` (Home passes `isPinned(id) && !broken`): a `theme.size.badge` (24) disc at the picture's top LEADING corner (the length pill is top trailing), `scrimStrong` with `pin-outline` in `onScrim` at `icon.sm`, `pointerEvents="none"`, hidden from VoiceOver, testID `project-pin`; the picture's button gets `accessibilityValue={{ text: "Pinned" }}` (its label stays the name, so every `getByRole("button", { name })` still finds it). The icon is `plain` — the card is in `PLAIN` because every card of a scrolling list would otherwise be a native view (ProjectCard's count 2 → 3).

**Keyboard**: the list has `keyboardDismissMode="on-drag"` (scrolling dismisses it) and `keyboardShouldPersistTaps="handled"` (a tap on a card with the keyboard up opens the card at once instead of only closing the keyboard); opening a project, its actions sheet or the sort sheet calls `Keyboard.dismiss()`; so does Home becoming inert. No `KeyboardAvoidingView` (the list scrolls; the field is at its top).

**Busy**: the find row and the headings are INSIDE `home-list`, so while a project is made, a style saved or a project file moved they take no touches and are dimmed with the cards — nothing new to do.

**The search's life**: the query is Home's state (memory only), kept while Home is mounted (a trip to the editor and back keeps it), never stored.

**Words**: one table, `FIND_WORDS` in `src/projects/homeFindWords.ts` (pure): "Search projects", "Sort projects", "Sort by", "Pinned", "No projects match", "Clear Search", "Pin", "Unpin", and the four sort names. Buttons title style ("Pin", "Unpin", "Clear Search"); the sheet's title, the headings, the rows and the line sentence style. The casing guard is blind to words that reach a button through a table, so `homeFindWords.test.ts` pins every one of them exactly.

**Colours**: everything through `useSurfaces()` (`s.text`, `s.muted`, `s.tile`, `s.separator`, `s.accentInk`); on the picture `theme.colors.scrimStrong` / `onScrim` as the length pill. Light (cream) and dark both: a test runs `wear("light")` + `leftovers({ onPicture: [..., "project-pin"] })` on Home with the find row, both headings, a pinned card and the sort sheet open.

**Motion**: nothing animated. The list still eases in once on mount (`EnterView`); a re-order, a filter, a heading appearing are a new render, nothing more. No layout animation.

**Icons**: two new names, `search-outline` → `magnifyingglass` and `pin-outline` → `pin` (both SF Symbols 1.0, well inside 4.2); `USED` 131 → 133; `PLAIN` ProjectCard 2 → 3.

## 3. Files

| File | What |
|---|---|
| `src/projects/homeFindWords.ts` (new) | `FIND_WORDS` |
| `src/projects/homeOrder.ts` (new, pure) | `HomeSort`, `HOME_SORTS`, `DEFAULT_SORT`, `FIND`, `foldName`, `matchesQuery`, `compareNames`, `compareProjects`, `orderProjects`, `HomeRow`, `homeRows`, `showFind`, `keepListed` |
| `src/projects/homePrefs.ts` (new) | `HOME_PREFS_KEY`, `HOME_PREFS`, `HomePrefs`, `loadHomePrefs`, `saveHomePrefs` |
| `src/projects/useHomeFind.ts` (new) | the hook: prefs + query → rows, pin / unpin / sort, the prune |
| `src/projects/HomeFind.tsx` (new) | `HomeFind`, `HomeHeading`, `HomeNoMatch` |
| `src/projects/SortSheet.tsx` (new) | the sheet |
| `src/projects/storage.ts` | `ProjectSummary.createdAt` (one field; nothing else) |
| `src/projects/useProjects.ts` | `listed`; `remove` answers a boolean |
| `src/projects/ProjectCard.tsx` | `pinned?` → the mark, the VoiceOver value |
| `src/projects/ProjectActionsSheet.tsx` | `isPinned?` / `onPin?` → Pin / Unpin first |
| `app/index.tsx` | the rows, the find row, the sheet, the keyboard, unpin on delete |
| `src/ui/sfSymbols.ts`, `src/ui/__tests__/sfSymbols.map.test.ts` | two names; `USED` 133; `PLAIN` 3 |
| fixtures | `createdAt` in the typed `ProjectSummary` literals (`ProjectCard.test.tsx`, `sheets.r2.test.tsx`, `homeFile.test.tsx`) |
| `AGENTS.md`, `docs/next-build-phone-checklist.md` | the line; part O |

Not touched: `project.json`'s shape (no schema bump), `saveProject` / `updateProject` / the chain, `history.ts`, `Glass.tsx`, `theme.ts`, the header and the bottom row, `Sheet.tsx`, `Field.tsx`, the PROOF tests (`storage.load.proof.test.ts`, `defaultTree.proof.test.tsx`, …).

## 4. Tests

- `homeOrder.test.ts`: folding vectors (Latin, Turkish İ, Greek ς, Vietnamese, Arabic harakat / hamza seats / tatweel, ة ≠ ه, Persian ZWNJ, Hebrew points, Hindi kept, CJK, Hangul, emoji VS16); match (trim, empty, spaces); name order vector (21 names incl. digits, accents, case, prefixes, Greek, Arabic, the empty name); each sort with ties (broken last, name, raw name, id; bad dates oldest); pinned split (a broken pinned project stays in rest; pins not listed ignored); rows (no pins → no headings; pins with and without a rest); `showFind`; `keepListed` (same array when nothing dropped).
- `homePrefs.test.ts`: defaults; round trip; damaged (not JSON, array, no version, version 0, 1.5) → defaults and overwritten by the next save; newer → defaults and NEVER overwritten; bad sort → default sort with pins kept; pins cleaned (non-strings, empty, > 64, duplicates); storage that throws on read and on write.
- `useHomeFind.test.tsx`: the first render already has the stored sort; prune only once `listed`; no write when nothing dropped; toggle / unpin write; a newer stored value stays.
- `homeFind.test.tsx` (Home, real `app/index.tsx`, `storage` mocked): no row under 6, a row at 6 inside `home-list` and not in `home-header`, header pill still 3 buttons; typing filters (accent-insensitive); no match → line + Clear Search; the row stays with a query when the list drops to 5; the sort sheet (default ticked, choose Name → closed, order, stored, kept after a remount); Pin → no `saveProject` / `renameProject` / `updateProject`, headings, pin mark, value "Pinned", Unpin; delete of a pinned project → its pin gone from storage; a duplicate is not pinned; busy → the row is inside the inert wrapper; `Keyboard.dismiss` on opening a project; the light audit.
- `ProjectCard.test.tsx` (added cases), `storage.test.ts` (`createdAt` listed), `sfSymbols.map.test.ts` (updated as stated).

## 5. Risks and what only a phone shows

1. The field in a `FlatList` header keeps the keyboard while the list re-renders on every keystroke (the header is an element, not an inline component; RN reconciles it) — pinned in Jest only as "the same `home-search` instance"; a phone shows whether the keyboard ever drops.
2. `keyboardShouldPersistTaps="handled"`: a tap on a card with the keyboard up should open it in one tap.
3. The system clear button (`clearButtonMode`) on the cream and navy field.
4. Whether a VoiceOver user hears "Pinned" after a card's name (the `accessibilityValue`).
5. The name order is code-point order of folded text, not a language's dictionary order (§2.2) — the owner should look at a list with mixed scripts.
6. A preference of the phone: a reinstall loses pins and the sort (like every other phone preference).

## 6. As built

Built on `home-find` (7a4ce4e, 03976c8, 26d2be6), reviewed, then fixed (the `fix(home)` commits after 26d2be6) and merged into `next-build`. As designed in §2, with these differences and additions:

- **The Sort sheet never sticks.** The review found that `onSort` only set its flag: if iOS declined to present the sheet (the actions sheet still fading out after Pin, the keyboard going down), `sortOpen` stayed true with nothing on screen and every later tap changed nothing. `onSort` now follows Quick Edit's rule — close first, open on the next tick — and New Project, Quick Edit, Open Project File, Post a video and a project's sheet each clear `sortOpen`. Pinned in `homeFind.test.tsx` ("the Sort button cannot stick"); phone checklist part O, item 74.
- **Pin / Unpin keeps its word during the fade.** The label is read when the sheet opens (a ref in `ProjectActionsSheet`), so the button just tapped does not flip as the sheet leaves.
- **A focused field stays.** The row also shows while the field has the keyboard (`useHomeFind().setFocused`), so emptying the field with five projects or fewer no longer unmounts it under the finger; it goes on blur.
- **A query is cleared when the last project goes**, so it can never hide the next project made.
- **Folding once.** `orderProjects` folds each name once per ordering and the query once; the comparator compares folded strings (`compareNames` itself is unchanged for its callers).
- **The magnifier and its inset are on the leading edge** (`start` / `paddingStart`); the same in left-to-right, right in case RTL is ever switched on.
- **§5.1 is now really pinned in Jest:** the `home-search` element is the same instance across keystrokes and a refresh of the list.
- Tests also needed: the table-key count in `sfSymbols.map.test.ts` (125 → 127) besides `USED` / `PLAIN`; the pin mark is hidden from VoiceOver, so tests find it with `includeHiddenElements`.

Left as it is (the review's minors, on purpose):

- **Rows re-keyed when the shown set changes** (m4): a row's key is its cards' ids, so a keystroke or a pin that shifts the pairs remounts the cards after it. Keying by the first card alone would not help in the common case (one card fewer shifts every pair after it). Watch for a flicker of the thumbnails on the phone while typing with many projects (§5, new point 7).
- **Persian / Arabic yeh and kaf, and Eastern Arabic digits** (m6): ی (U+06CC) and ي (U+064A), ک (U+06A9) and ك (U+0643) are not folded together, and ٠–٩ / ۰–۹ are not digit runs. The owner's call — the same letter typed on two keyboards; checklist item 69 asks for any name not found.

7. (added) With many projects, whether the thumbnails flicker while typing (rows re-keyed, above).
