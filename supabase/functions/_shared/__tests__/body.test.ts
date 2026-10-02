import { readCapped } from "../body.ts";

const tooLarge = { status: 413, code: "too_large" };

function streamed(pieces: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(c) {
      const n = pieces.shift();
      if (n === undefined) c.close(); else c.enqueue(new Uint8Array(n).fill(7));
    },
  });
}

test("reads a body within the cap", async () => {
  const r = new Request("https://x/", { method: "POST", body: new Uint8Array([1, 2, 3]) });
  expect(Array.from(await readCapped(r, 10))).toEqual([1, 2, 3]);
});

test("reads a streamed body made of several pieces", async () => {
  const r = new Request("https://x/", { method: "POST", body: streamed([4, 4, 2]), duplex: "half" } as RequestInit);
  const out = await readCapped(r, 10);
  expect(out.length).toBe(10);
  expect(out.every((b) => b === 7)).toBe(true);
});

test("an empty or missing body is an empty chunk", async () => {
  expect((await readCapped(new Request("https://x/", { method: "POST" }), 10)).length).toBe(0);
});

test("a Content-Length over the cap is refused before any byte is read", async () => {
  const r = new Request("https://x/", { method: "POST", body: streamed([4]), duplex: "half", headers: { "Content-Length": "11" } } as RequestInit);
  await expect(readCapped(r, 10)).rejects.toMatchObject(tooLarge);
  expect(r.bodyUsed).toBe(false);
});

test("a body larger than the cap is refused even when Content-Length lies or is absent", async () => {
  const r = new Request("https://x/", { method: "POST", body: streamed([6, 6]), duplex: "half", headers: { "Content-Length": "5" } } as RequestInit);
  await expect(readCapped(r, 10)).rejects.toMatchObject(tooLarge);
  const r2 = new Request("https://x/", { method: "POST", body: streamed([6, 6]), duplex: "half" } as RequestInit);
  await expect(readCapped(r2, 10)).rejects.toMatchObject(tooLarge);
});
