const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomToken(bytes = 32): string { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}