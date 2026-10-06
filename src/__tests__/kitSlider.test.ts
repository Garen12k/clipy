import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DIR = join(__dirname, "..", "editor", "components");
/** Editor components that still import the community slider directly instead of the kit's (src/ui/Slider.tsx). None is left: never add one. */
const ALLOW: string[] = [];

test("sliders in the editor come from the kit (one treatment)", () => {
  const direct = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && readFileSync(join(DIR, name), "utf8").includes("@react-native-community/slider")).sort();
  expect(direct).toEqual([...ALLOW].sort());
});

test("no kit slider's rest track is overridden: the kit's default is the one that shows on a bar", () => {
  const overriding = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !ALLOW.includes(name) && readFileSync(join(DIR, name), "utf8").includes("maximumTrackTintColor")).sort();
  expect(overriding).toEqual([]);
});

test("no editor component imports the community slider directly any more (Cover was the last)", () => {
  expect(ALLOW).toEqual([]);
});
