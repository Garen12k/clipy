const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-GCM key from 32 random bytes, base64 (`openssl rand -base64 32`), kept in the TOKEN_ENC_KEY function secret. */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = unb64(base64Key);
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
/** base64(iv ‖ ciphertext); a fresh 12-byte IV per call. */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const buf = unb64(payload);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}