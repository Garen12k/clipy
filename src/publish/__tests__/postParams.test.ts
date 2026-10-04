jest.mock("expo-file-system", () => ({ Paths: { cache: { uri: "file:///var/app/Library/Caches/" }, document: { uri: "file:///var/app/Documents" } } }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: jest.fn() }));
import { fileSize } from "@/src/lib/fileInfo";
import { isAppFileUri, videoFromParams } from "../postParams";

const CACHE = "file:///var/app/Library/Caches/exports/p1-1.mp4";
const ok = { fileUri: CACHE, durationSec: "21", mimeType: "video/mp4", projectId: "p1", title: "Beach day" };
beforeEach(() => { (fileSize as jest.Mock).mockReset().mockReturnValue(14000000); });

test("a valid export: size read from disk, values passed through", () => {
  expect(videoFromParams({ ...ok, fileSize: "1" })).toEqual({ video: { fileUri: CACHE, durationSec: 21, fileSize: 14000000, mimeType: "video/mp4" }, projectId: "p1", title: "Beach day", coverMs: null });
  expect(fileSize).toHaveBeenCalledWith(CACHE); // the fileSize param is never trusted
});

test("files in the cache or the projects folder are accepted, also via /private and doubled slashes", () => {
  expect(isAppFileUri(CACHE)).toBe(true);
  expect(isAppFileUri("file:///var/app/Documents/projects/a.mov")).toBe(true);
  expect(isAppFileUri("file:///private/var/app/Documents//projects/p1/media/b.mp4")).toBe(true);
  expect(isAppFileUri("file:///private/var/app/Library/Caches/ImagePicker/x.mov")).toBe(true);
  expect(isAppFileUri("file:///var/app/Library//Caches/x.mov")).toBe(true);
});

test.each([
  ["an https URI", { fileUri: "https://evil.example/v.mp4" }],
  ["a content-less scheme", { fileUri: "ph://ABC" }],
  ["a file outside cache/documents", { fileUri: "file:///var/app/Library/Preferences/x.plist" }],
  ["a file directly in Documents", { fileUri: "file:///var/app/Documents/x.mp4" }],
  ["the sign-in database in Documents", { fileUri: "file:///var/app/Documents/SQLite/expo-sqlite-localstorage.db" }],
  ["another Documents folder", { fileUri: "file:///var/app/Documents/ExponentExperienceData/x.mp4" }],
  ["a sibling of the projects folder with the same prefix", { fileUri: "file:///var/app/Documents/projects2/x.mp4" }],
  ["the projects folder itself", { fileUri: "file:///var/app/Documents/projects/" }],
  ["a projects/.. escape", { fileUri: "file:///var/app/Documents/projects/../SQLite/x.db" }],
  ["a sibling directory with the same prefix", { fileUri: "file:///var/app/Documents2/x.mp4" }],
  ["the cache directory itself", { fileUri: "file:///var/app/Library/Caches/" }],
  ["a path with ..", { fileUri: "file:///var/app/Library/Caches/../Preferences/x.plist" }],
  ["an encoded ..", { fileUri: "file:///var/app/Library/Caches/%2e%2e/Preferences/x.plist" }],
  ["no file", { fileUri: undefined }],
  ["NaN duration", { durationSec: "abc" }],
  ["missing duration", { durationSec: undefined }],
  ["zero duration", { durationSec: "0" }],
  ["over 6 hours", { durationSec: String(6 * 3600 + 1) }],
  ["a non-video MIME type", { mimeType: "text/html" }],
  ["a malformed MIME type", { mimeType: "video/<script>" }],
])("rejects %s", (_n, over) => {
  expect(videoFromParams({ ...ok, ...over })).toBeNull();
});

test("a missing or empty file is rejected", () => {
  (fileSize as jest.Mock).mockReturnValue(0);
  expect(videoFromParams(ok)).toBeNull();
});

test("defaults and limits: MIME type defaults to video/mp4, title is cut to 100, missing title / project are null", () => {
  const r = videoFromParams({ fileUri: CACHE, durationSec: "21", title: "x".repeat(150) })!;
  expect(r.video.mimeType).toBe("video/mp4");
  expect(r.title).toBe("x".repeat(100));
  expect(r.projectId).toBeNull();
  expect(videoFromParams({ fileUri: CACHE, durationSec: "21", mimeType: "video/quicktime" })!.title).toBeNull();
});

test("coverMs is a whole number of milliseconds inside the video; anything else is null and the rest stays valid", () => {
  expect(videoFromParams({ ...ok, coverMs: "2500" })!.coverMs).toBe(2500);
  expect(videoFromParams({ ...ok, coverMs: "0" })!.coverMs).toBe(0);
  expect(videoFromParams({ ...ok, coverMs: "20999" })!.coverMs).toBe(20999);
  expect(videoFromParams(ok)!.coverMs).toBeNull();
  // The video's own length (21 s) is its end, not a frame in it.
  for (const bad of ["-1", "abc", "2.5", "21000", "21001", ""]) {
    const t = videoFromParams({ ...ok, coverMs: bad });
    expect(t).not.toBeNull();
    expect(t!.coverMs).toBeNull();
    expect(t!.projectId).toBe("p1");
  }
});
