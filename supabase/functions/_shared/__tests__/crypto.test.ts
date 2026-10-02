import { decrypt, encrypt, importKey } from "../crypto.ts";

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

test("round-trips and uses a fresh IV each time", async () => {
  const key = await importKey(KEY);
  const a = await encrypt(key, "ya29.token");
  const b = await encrypt(key, "ya29.token");
  expect(a).not.toBe(b);
  expect(await decrypt(key, a)).toBe("ya29.token");
  expect(await decrypt(key, b)).toBe("ya29.token");
});

test("tampering is rejected", async () => {
  const key = await importKey(KEY);
  const bytes = Buffer.from(await encrypt(key, "secret"), "base64");
  bytes[bytes.length - 1] ^= 1;
  await expect(decrypt(key, bytes.toString("base64"))).rejects.toBeDefined();
});

test("a key of the wrong length is refused", async () => {
  await expect(importKey(Buffer.from("short").toString("base64"))).rejects.toThrow("TOKEN_ENC_KEY must be 32 bytes");
});