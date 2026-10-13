import { ProjectFileError } from "../projectFile";
import { addedWords, failureWords, missingWords } from "../projectFileWords";

test("every failure has a title and a plain sentence; a cancel says nothing", () => {
  expect(failureWords("open", new ProjectFileError("cancelled"))).toBeNull();
  expect(failureWords("save", new ProjectFileError("cancelled"))).toBeNull();
  expect(failureWords("open", new ProjectFileError("notClipy"))).toEqual({ title: "Can't open this file", message: "That isn't a Clipy project file." });
  expect(failureWords("open", new ProjectFileError("damaged"))).toEqual({ title: "Can't open this file", message: "This project file is damaged or incomplete." });
  expect(failureWords("open", new ProjectFileError("newer"))).toEqual({ title: "Can't open this file", message: "It was made with a newer version of Clipy. Update the app to open it." });
  expect(failureWords("open", new ProjectFileError("space", 2.1e9, 1.4e9))).toEqual({ title: "Not enough free space", message: "Opening this project needs 2.1 GB. This iPhone has 1.4 GB free." });
  expect(failureWords("save", new ProjectFileError("space", 350e6, 20e6))).toEqual({ title: "Not enough free space", message: "Saving a copy needs 350 MB. This iPhone has 20 MB free." });
  expect(failureWords("open", new Error("ENOENT /private/var/x"))).toEqual({ title: "Can't open this file", message: "Something went wrong while opening it. Nothing was added." });
  expect(failureWords("save", "boom")).toEqual({ title: "Couldn't save a copy", message: "Something went wrong while saving. Try again." });
});
test("no sentence shows the system's own text", () => {
  for (const kind of ["save", "open"] as const) expect(JSON.stringify(failureWords(kind, new Error("NSCocoaErrorDomain 513 /private/var")))).not.toMatch(/NSCocoa|private/);
});
test("done and missing", () => {
  expect(addedWords("Beach trip")).toBe("Beach trip was added to your projects");
  expect(missingWords(1)).toBe("1 file of this project is missing and is not in the copy");
  expect(missingWords(3)).toBe("3 files of this project are missing and are not in the copy");
});
