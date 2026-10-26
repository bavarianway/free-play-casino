import { describe, expect, it } from 'vitest';
import {
  CHERRY_PAIR_PAYS, CHERRY_SINGLE_PAYS, DOCUMENTED_HIT_RATE, DOCUMENTED_RTP, PAYTABLE_THREE, REEL_STRIP,
  computeHitRate, computeRtp, lineMultiplier, playSlots,
} from '../src/engine/games/slots';

const seeds = (nonce: number) => ({ serverSeed: '1'.repeat(64), clientSeed: 'slots', nonce });

describe('slots paytable', () => {
  it('pays three of a kind per paytable', () => {
    for (const [sym, mult] of Object.entries(PAYTABLE_THREE)) {
      expect(lineMultiplier([sym, sym, sym] as never)).toBe(mult);
    }
  });
  it('cherry rules and losing lines', () => {
    expect(lineMultiplier(['CHERRY', 'CHERRY', 'LEMON'])).toBe(CHERRY_PAIR_PAYS);
    expect(lineMultiplier(['LEMON', 'CHERRY', 'CHERRY'])).toBe(CHERRY_PAIR_PAYS);
    expect(lineMultiplier(['LEMON', 'CHERRY', 'BAR'])).toBe(CHERRY_SINGLE_PAYS);
    expect(lineMultiplier(['LEMON', 'BAR', 'BELL'])).toBe(0);
    expect(lineMultiplier(['SEVEN', 'SEVEN', 'BAR'])).toBe(0);
  });
  it('strip has 20 stops', () => expect(REEL_STRIP).toHaveLength(20));
  it('exact RTP and hit rate match documentation', () => {
    expect(computeRtp()).toBeCloseTo(DOCUMENTED_RTP, 4);
    expect(computeHitRate()).toBeCloseTo(DOCUMENTED_HIT_RATE, 4);
    expect(computeRtp()).toBeLessThan(1);
  });
});

describe('playSlots', () => {
  it('is deterministic and payout = bet * multiplier', () => {
    const a = playSlots(seeds(1), { bet: 50 });
    expect(a).toEqual(playSlots(seeds(1), { bet: 50 }));
    expect(a.payout).toBe(50 * a.multiplier);
    expect(a.multiplier).toBe(lineMultiplier(a.line));
    expect(a.window.map((w) => w[1])).toEqual(a.line);
  });
  it('rejects bad bets', () => {
    expect(() => playSlots(seeds(0), { bet: 0 })).toThrow();
    expect(() => playSlots(seeds(0), { bet: 2.5 })).toThrow();
  });
  it('statistical: simulated RTP ~ documented RTP', () => {
    const N = 100000;
    let ret = 0;
    for (let i = 0; i < N; i++) ret += playSlots(seeds(i), { bet: 1 }).payout;
    expect(Math.abs(ret / N - DOCUMENTED_RTP)).toBeLessThan(0.06);
  });
  it('statistical: reel stops are uniform', () => {
    const counts = new Array(20).fill(0);
    const N = 40000;
    for (let i = 0; i < N; i++) counts[playSlots(seeds(i), { bet: 1 }).stops[0]]++;
    const exp = N / 20;
    const chi = counts.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(43.8); // chi-square df=19, p=0.001
  });
});
