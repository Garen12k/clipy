import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DIR = join(__dirname, "..", "editor", "components");
/** Editor components that still import the community slider directly instead of the kit's (src/ui/Slider.tsx). One per line: a task that converts a file deletes its line and no other. */
const ALLOW = [
  "CoverSheet.tsx",
];

test("sliders in the editor come from the kit (one treatment), except the files still listed", () => {
  const direct = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && readFileSync(join(DIR, name), "utf8").includes("@react-native-community/slider")).sort();
  expect(direct).toEqual([...ALLOW].sort());
});
