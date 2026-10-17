import { FIND_WORDS } from "../homeFindWords";

// The casing guard cannot see words that reach a button through a table: every word is pinned here. Buttons (Pin, Unpin, Clear Search)
// are title style; the sheet's title, the headings, the sort rows, the line and the labels are sentence style.
test("every word of Home's search, sort and pin, exactly", () => {
  expect(FIND_WORDS).toEqual({
    search: "Search projects",
    sortButton: "Sort projects",
    sortTitle: "Sort by",
    pinned: "Pinned",
    noMatch: "No projects match",
    clear: "Clear Search",
    pin: "Pin",
    unpin: "Unpin",
    sorts: { edited: "Last edited", created: "Date created", name: "Name", length: "Length" },
  });
});
