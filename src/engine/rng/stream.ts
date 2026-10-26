/**
 * Deterministic random stream derived from (serverSeed, clientSeed, nonce).
 *
 * Block r (r = 0, 1, 2, ...) is:
 *     HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${r}`)
 * giving 32 bytes per block. Bytes are consumed in order; a new block is
 * computed lazily when the previous one is exhausted. Because `nonce` and `r`
 * are integers appended on the right, the message is unambiguous even if the
 * client seed contains ':'.
 *
 * Derived values:
 *  - nextUint32():   4 bytes, big-endian.
 *  - nextFloat():    nextUint32() / 2^32, uniform in [0, 1).
 *  - nextInt(n):     uniform integer in [0, n) using rejection sampling over
 *                    uint32 values (no modulo bias).
 */
import { hmacSha256 } from './hmac';

export interface Seeds {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

const TWO_32 = 4294967296;

export class RngStream {
  private block: Uint8Array = new Uint8Array(0);
  private offset = 0;
  private round = 0;

  constructor(
    readonly serverSeed: string,
    readonly clientSeed: string,
    readonly nonce: number,
  ) {
    if (!Number.isSafeInteger(nonce) || nonce < 0) {
      throw new RangeError('nonce must be a non-negative integer');
    }
  }

  private nextByte(): number {
    if (this.offset >= this.block.length) {
      this.block = hmacSha256(this.serverSeed, `${this.clientSeed}:${this.nonce}:${this.round}`);
      this.round += 1;
      this.offset = 0;
    }
    return this.block[this.offset++]!;
  }

  nextUint32(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) v = v * 256 + this.nextByte();
    return v;
  }

  nextFloat(): number {
    return this.nextUint32() / TWO_32;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_32) {
      throw new RangeError('maxExclusive must be an integer in [1, 2^32]');
    }
    const limit = Math.floor(TWO_32 / maxExclusive) * maxExclusive;
    for (;;) {
      const v = this.nextUint32();
      if (v < limit) return v % maxExclusive;
    }
  }

  /** Fisher–Yates shuffle (returns a new array). */
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}

export function createStream({ serverSeed, clientSeed, nonce }: Seeds): RngStream {
  return new RngStream(serverSeed, clientSeed, nonce);
}
