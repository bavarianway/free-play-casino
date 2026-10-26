import { randomHex, sha256Hex } from './hmac';

export const MAX_CLIENT_SEED_LENGTH = 64;

/** New random 256-bit server seed (hex). */
export function generateServerSeed(): string {
  return randomHex(32);
}

/** New random client seed (hex, 64 bits) used as the editable default. */
export function generateClientSeed(): string {
  return randomHex(8);
}

/** Commitment shown to the player *before* play: SHA-256(serverSeed) hex. */
export function commitServerSeed(serverSeed: string): string {
  return sha256Hex(serverSeed);
}

/** True when `commitment` is SHA-256(serverSeed). */
export function verifyCommitment(serverSeed: string, commitment: string): boolean {
  return commitServerSeed(serverSeed) === commitment.trim().toLowerCase();
}

/** Returns a cleaned client seed or null if invalid (empty / too long). */
export function sanitizeClientSeed(input: string): string | null {
  const s = input.trim();
  if (s.length === 0 || s.length > MAX_CLIENT_SEED_LENGTH) return null;
  return s;
}
