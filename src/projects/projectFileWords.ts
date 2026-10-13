import { formatBytes } from "@/src/export/estimate";
import { ProjectFileError } from "./projectFile";

/** Every word Save a Copy and Open Project File say outside the card (the card's are TRANSFER in TransferCard.tsx). Sentence style; never the system's text. */
export const FILE_WORDS = {
  cantOpen: "Can't open this file", cantSave: "Couldn't save a copy", noSpace: "Not enough free space",
  notClipy: "That isn't a Clipy project file.",
  damaged: "This project file is damaged or incomplete.",
  newer: "It was made with a newer version of Clipy. Update the app to open it.",
  openFailed: "Something went wrong while opening it. Nothing was added.",
  saveFailed: "Something went wrong while saving. Try again.",
  shareFailed: "The share sheet couldn't be opened. Try again.",
} as const;

/** The alert for a failed save or open; null for a cancel (which says nothing). Only a ProjectFileError's code picks a sentence — never an error's own message. */
export function failureWords(kind: "save" | "open", e: unknown): { title: string; message: string } | null {
  const code = e instanceof ProjectFileError ? e.code : null;
  if (code === "cancelled") return null;
  if (code === "space") { const err = e as ProjectFileError; return { title: FILE_WORDS.noSpace, message: `${kind === "save" ? "Saving a copy" : "Opening this project"} needs ${formatBytes(err.need)}. This iPhone has ${formatBytes(err.free)} free.` }; }
  if (kind === "save") return { title: FILE_WORDS.cantSave, message: FILE_WORDS.saveFailed };
  return { title: FILE_WORDS.cantOpen, message: code === "notClipy" ? FILE_WORDS.notClipy : code === "damaged" ? FILE_WORDS.damaged : code === "newer" ? FILE_WORDS.newer : FILE_WORDS.openFailed };
}
export const addedWords = (name: string): string => `${name} was added to your projects`;
export const missingWords = (n: number): string => (n === 1 ? "1 file of this project is missing and is not in the copy" : `${n} files of this project are missing and are not in the copy`);
