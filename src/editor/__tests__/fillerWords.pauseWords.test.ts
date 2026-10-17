// The two sentences are one (spec §2.6); the row keeps a copy only because importing the strip pulls in the native wrappers.
import { PAUSE_WORDS } from "../components/RemovePausesSheet";
import { FILLER_WORDS } from "../components/FillerWordsRow";

test("Remove filler words says Remove pauses' own \"Nothing was removed.\"", () => {
  expect(FILLER_WORDS.notRemoved).toBe(PAUSE_WORDS.notRemoved);
});
