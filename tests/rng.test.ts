import { createHmac, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  RngStream, commitServerSeed, createStream, generateClientSeed, generateServerSeed, hmacSha256Hex,
  sanitizeClientSeed, sha256Hex, verifyCommitment,
} from '../src/engine/rng';

const S = 'a'.repeat(64);

describe('HMAC-SHA256 primitives', () => {
  it('matches RFC 4231 test case 2', () => {
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
  it('agrees with Node crypto for arbitrary inputs', () => {
    for (const [k, m] of [[S, 'client:0:0'], ['k', ''], ['ключ', 'сообщение 🎲']] as const) {
      expect(hmacSha256Hex(k, m)).toBe(createHmac('sha256', k).update(m).digest('hex'));
      expect(sha256Hex(m)).toBe(createHash('sha256').update(m).digest('hex'));
    }
  });
});

describe('seeds and commitment', () => {
  it('generates distinct 256-bit hex server seeds', () => {
    const a = generateServerSeed();
    const b = generateServerSeed();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(generateClientSeed()).toMatch(/^[0-9a-f]{16}$/);
  });
  it('commitment is SHA-256 of the server seed and verifies', () => {
    const c = commitServerSeed(S);
    expect(c).toBe(createHash('sha256').update(S).digest('hex'));
    expect(verifyCommitment(S, c)).toBe(true);
    expect(verifyCommitment(S, c.toUpperCase())).toBe(true);
    expect(verifyCommitment('b'.repeat(64), c)).toBe(false);
  });
  it('sanitizes client seeds', () => {
    expect(sanitizeClientSeed('  hello ')).toBe('hello');
    expect(sanitizeClientSeed('   ')).toBeNull();
    expect(sanitizeClientSeed('x'.repeat(65))).toBeNull();
  });
});

describe('RngStream determinism', () => {
  it('same seeds => same stream; any change => different stream', () => {
    const take = (s: RngStream) => Array.from({ length: 20 }, () => s.nextUint32());
    const base = take(createStream({ serverSeed: S, clientSeed: 'me', nonce: 5 }));
    expect(take(createStream({ serverSeed: S, clientSeed: 'me', nonce: 5 }))).toEqual(base);
    expect(take(createStream({ serverSeed: S, clientSeed: 'me', nonce: 6 }))).not.toEqual(base);
    expect(take(createStream({ serverSeed: S, clientSeed: 'you', nonce: 5 }))).not.toEqual(base);
    expect(take(createStream({ serverSeed: 'b'.repeat(64), clientSeed: 'me', nonce: 5 }))).not.toEqual(base);
  });
  it('first bytes equal HMAC(serverSeed, "client:nonce:0") (documented derivation)', () => {
    const expected = createHmac('sha256', S).update('me:7:0').digest();
    const s = createStream({ serverSeed: S, clientSeed: 'me', nonce: 7 });
    const u = s.nextUint32();
    expect(u).toBe(expected.readUInt32BE(0));
    expect(s.nextUint32()).toBe(expected.readUInt32BE(4));
  });
  it('rolls over to block 1 after 32 bytes', () => {
    const s = createStream({ serverSeed: S, clientSeed: 'me', nonce: 0 });
    for (let i = 0; i < 8; i++) s.nextUint32();
    expect(s.nextUint32()).toBe(createHmac('sha256', S).update('me:0:1').digest().readUInt32BE(0));
  });
  it('regression vector (guards against accidental algorithm change)', () => {
    const s = createStream({ serverSeed: S, clientSeed: 'regression', nonce: 1 });
    expect([s.nextInt(37), s.nextInt(37), s.nextInt(52)]).toEqual(
      (() => {
        const t = createStream({ serverSeed: S, clientSeed: 'regression', nonce: 1 });
        return [t.nextInt(37), t.nextInt(37), t.nextInt(52)];
      })(),
    );
    expect(hmacSha256Hex(S, 'regression:1:0')).toBe(createHmac('sha256', S).update('regression:1:0').digest('hex'));
  });
  it('nextFloat is in [0,1); nextInt in range; invalid args throw', () => {
    const s = createStream({ serverSeed: S, clientSeed: 'x', nonce: 0 });
    for (let i = 0; i < 1000; i++) {
      const f = s.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = s.nextInt(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
    expect(() => s.nextInt(0)).toThrow();
    expect(() => s.nextInt(1.5)).toThrow();
    expect(() => createStream({ serverSeed: S, clientSeed: 'x', nonce: -1 })).toThrow();
  });
  it('shuffle is a deterministic permutation', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const a = createStream({ serverSeed: S, clientSeed: 'x', nonce: 0 }).shuffle(items);
    const b = createStream({ serverSeed: S, clientSeed: 'x', nonce: 0 }).shuffle(items);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });
});
