import { HISTORY_LIMIT } from "@/src/editor/store";
import { decodeHistory, encodeHistory, fitHistory, HISTORY_FILE, lineOf, stampOf } from "../history";

describe("stampOf", () => {
  test("the same text has the same stamp; it starts with the length", () => {
    expect(stampOf("abc")).toBe(stampOf("abc"));
    expect(stampOf("abc")).toMatch(/^3\.[0-9a-f]{1,8}\.[0-9a-f]{1,8}$/);
    expect(stampOf("")).toMatch(/^0\./);
  });
  test("one changed character, two swapped characters and one more character each change it", () => {
    const base = JSON.stringify({ id: "p1", name: "Beach", clips: [{ id: "a", trimEnd: 4 }] });
    const stamps = new Set([base, base.replace("Beach", "Beech"), base.replace("Beach", "Baech"), `${base} `, base.replace("4", "5")].map(stampOf));
    expect(stamps.size).toBe(5);
  });
  test("characters outside ASCII count (a caption in Arabic, an emoji)", () => {
    expect(stampOf("مرحبا")).not.toBe(stampOf("مرحبأ"));
    expect(stampOf("a🙂")).not.toBe(stampOf("a🙃"));
  });
});

describe("lineOf", () => {
  test("is JSON.stringify of the snapshot, made once per object", () => {
    const snap = { id: "p1", name: "A\nB C" };
    const spy = jest.spyOn(JSON, "stringify");
    const line = lineOf(snap);
    expect(lineOf(snap)).toBe(line);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(line).toBe(JSON.stringify(snap));
    expect(line).not.toContain("\n");                       // a line feed inside a text is escaped: one snapshot, one line
    expect(lineOf({ ...snap })).toBe(line);                 // another object with the same content: the same text
  });
});

describe("fitHistory", () => {
  const steps = (n: number, prefix: string, size = 10) => Array.from({ length: n }, (_, i) => `${prefix}${i}`.padEnd(size, "."));
  test("the store's limit and the file's are one number", () => { expect(HISTORY_FILE.maxSteps).toBe(HISTORY_LIMIT); });
  test("keeps the newest undo steps and the nearest redo steps", () => {
    const got = fitHistory(steps(60, "p"), steps(60, "f"), 50, 1e9);
    expect(got.past).toHaveLength(50);
    expect(got.past[0].startsWith("p10")).toBe(true);        // past is oldest first: the ten oldest went
    expect(got.past[49].startsWith("p59")).toBe(true);
    expect(got.future).toHaveLength(50);
    expect(got.future[0].startsWith("f0")).toBe(true);       // future is nearest first: the ten farthest went
    expect(got.future[49].startsWith("f49")).toBe(true);
  });
  test("over the size cap the OLDEST undo steps go first; each line counts with its line feed", () => {
    const past = steps(5, "p"), future = steps(2, "f");      // 7 lines of 10 + 1
    expect(fitHistory(past, future, 50, 77)).toEqual({ past, future });
    expect(fitHistory(past, future, 50, 76)).toEqual({ past: past.slice(1), future });
    expect(fitHistory(past, future, 50, 44)).toEqual({ past: past.slice(3), future });
  });
  test("with no undo step left the FARTHEST redo steps go; a snapshot bigger than the cap keeps nothing", () => {
    const past = steps(2, "p"), future = steps(3, "f");
    expect(fitHistory(past, future, 50, 30)).toEqual({ past: [], future: future.slice(0, 2) });
    expect(fitHistory(past, future, 50, 10)).toEqual({ past: [], future: [] });
    expect(fitHistory([], [], 50, 10)).toEqual({ past: [], future: [] });
  });
  test("the inputs are not changed", () => {
    const past = steps(3, "p"), future = steps(3, "f"), was = [[...past], [...future]];
    fitHistory(past, future, 2, 15);
    expect([past, future]).toEqual(was);
  });
});

describe("encodeHistory / decodeHistory", () => {
  const past = [lineOf({ id: "p1", n: 0, text: "two\nlines" }), lineOf({ id: "p1", n: 1 })], future = [lineOf({ id: "p1", n: 3, text: " " })];
  const text = encodeHistory("p1", 21, "9.aa.bb", { past, future });
  test("a header line, then past oldest first, then future nearest first; no trailing line feed", () => {
    const lines = text.split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0])).toEqual({ app: "clipy-history", version: 1, schemaVersion: 21, projectId: "p1", stamp: "9.aa.bb", past: 2, future: 1 });
    expect(lines.slice(1)).toEqual([...past, ...future]);
  });
  test("round trip", () => { expect(decodeHistory(text, "p1", 21, "9.aa.bb")).toEqual({ past, future }); });
  test("another stamp, project, schema, app or file version: null", () => {
    expect(decodeHistory(text, "p1", 21, "9.aa.bc")).toBeNull();
    expect(decodeHistory(text, "p2", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text, "p1", 22, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text, "p1", 20, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text.replace("clipy-history", "clipy"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text.replace('"version":1', '"version":2'), "p1", 21, "9.aa.bb")).toBeNull();
  });
  test("a file that is cut off, has a line too many, an empty line, or lying counts: null", () => {
    const lines = text.split("\n");
    const header = (patch: object) => [JSON.stringify({ ...JSON.parse(lines[0]), ...patch }), ...lines.slice(1)].join("\n");
    expect(decodeHistory(lines.slice(0, 3).join("\n"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(`${text}\n${past[0]}`, "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(`${text}\n`, "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory([lines[0], "", lines[2], lines[3]].join("\n"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 3, future: 0 }), "p1", 21, "9.aa.bb")).not.toBeNull();   // the same three lines, split another way, are still three lines
    expect(decodeHistory(header({ past: 1 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 2.5, future: 0.5 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: -1, future: 4 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: "2" }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 51, future: 0 }), "p1", 21, "9.aa.bb")).toBeNull();
  });
  test("no steps, no text, a header that is not an object, a text that is too long: null", () => {
    expect(decodeHistory(encodeHistory("p1", 21, "9.aa.bb", { past: [], future: [] }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("[1]\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("null\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("{not json\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    const huge = encodeHistory("p1", 21, "9.aa.bb", { past: ["x".repeat(HISTORY_FILE.maxChars + 5000)], future: [] });
    expect(decodeHistory(huge, "p1", 21, "9.aa.bb")).toBeNull();
  });
});
