/**
 * HMAC-SHA256 primitives.
 *
 * Uses the audited, pure-JS, synchronous `@noble/hashes` implementation so the
 * exact same code runs in browsers and in Node (Vitest) with no Web Crypto
 * async plumbing. Only seed *generation* needs entropy, which is taken from
 * `crypto.getRandomValues` (available in browsers and Node >= 19) via noble's
 * `randomBytes`.
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export { bytesToHex };

/** HMAC-SHA256(key, message) with UTF-8 encoded string inputs; returns 32 raw bytes. */
export function hmacSha256(key: string, message: string): Uint8Array {
  return hmac(sha256, utf8ToBytes(key), utf8ToBytes(message));
}

/** HMAC-SHA256(key, message) as lowercase hex. */
export function hmacSha256Hex(key: string, message: string): string {
  return bytesToHex(hmacSha256(key, message));
}

/** SHA-256 of a UTF-8 string as lowercase hex. */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

/** Cryptographically random hex string with `bytes` bytes of entropy (default 32). */
export function randomHex(bytes = 32): string {
  try {
    return bytesToHex(randomBytes(bytes));
  } catch {
    // Very old / locked-down WebViews without crypto.getRandomValues. Seeds only drive play-chip games,
    // so fall back to a hashed mix of Math.random + clock (the HMAC/SHA-256 itself is pure JS and always available).
    let pool = '';
    for (let i = 0; i < 8; i++) pool += Math.random().toString(36) + ':' + Date.now() + ':' + (typeof performance !== 'undefined' ? performance.now() : i) + ';';
    let out = sha256Hex(pool);
    while (out.length < bytes * 2) out += sha256Hex(out + Math.random());
    return out.slice(0, bytes * 2);
  }
}
