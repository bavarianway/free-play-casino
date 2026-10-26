import { describe, expect, it } from 'vitest';
import {
  CRASH_HOUSE_EDGE, CRASH_MAX_MULTIPLIER, crashPoint, crashPointFromUint32, isValidCashOut, multiplierAtTime,
  playCrash, settleCrash, theoreticalRtp, timeToReach, winProbability,
} from '../src/engine/games/crash';

const seeds = (nonce: number) => ({ serverSeed: '3'.repeat(64), clientSeed: 'crash', nonce });

describe('crash point mapping', () => {
  it('is >= 1.00 and capped', () => {
    expect(crashPointFromUint32(0)).toBe(1);
    expect(crashPointFromUint32(4294967295)).toBeLessThanOrEqual(CRASH_MAX_MULTIPLIER);
    expect(crashPointFromUint32(2147483648)).toBe(1.98); // u=0.5 -> 0.99/0.5
  });
  it('is monotonic in the underlying uint32', () => {
    let prev = 0;
    for (let u = 0; u < 4294967295; u += 100_000_000) {
      const p = crashPointFromUint32(u);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
  it('has 2 decimal places', () => {
    for (let i = 0; i < 200; i++) {
      const p = crashPoint(seeds(i));
      expect(Math.round(p * 100)).toBeCloseTo(p * 100, 6);
    }
  });
  it('is deterministic', () => expect(crashPoint(seeds(3))).toBe(crashPoint(seeds(3))));
});

describe('cash-out settlement (chips only)', () => {
  it('pays floor(bet * multiplier) if cashing out at or before the crash', () => {
    expect(settleCrash(100, 2, 2.5)).toEqual({ crashPoint: 2.5, cashedOut: true, bet: 100, payout: 200 });
    expect(settleCrash(100, 2.5, 2.5).payout).toBe(250); // equal wins
    expect(settleCrash(15, 1.5, 3).payout).toBe(22); // floor(22.5)
  });
  it('loses the stake if the crash comes first or no cash-out', () => {
    expect(settleCrash(100, 3, 2.5).payout).toBe(0);
    expect(settleCrash(100, null, 10).payout).toBe(0);
    expect(settleCrash(100, 1.5, 1).payout).toBe(0);
  });
  it('rejects invalid cash-out targets', () => {
    expect(isValidCashOut(1.0)).toBe(false);
    expect(isValidCashOut(1.01)).toBe(true);
    expect(isValidCashOut(NaN)).toBe(false);
    expect(settleCrash(100, 1.0, 5).payout).toBe(0);
  });
  it('playCrash uses the seed-derived point', () => {
    const p = crashPoint(seeds(11));
    expect(playCrash(seeds(11), { bet: 10, cashOutAt: null }).crashPoint).toBe(p);
  });
});

describe('time model', () => {
  it('multiplier grows monotonically from 1.00; timeToReach inverts it', () => {
    expect(multiplierAtTime(0)).toBe(1);
    expect(multiplierAtTime(7000)).toBeCloseTo(2, 1);
    let prev = 1;
    for (let t = 0; t < 60000; t += 500) {
      const m = multiplierAtTime(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    for (const m of [1.5, 2, 5, 10]) expect(multiplierAtTime(timeToReach(m) + 1)).toBeGreaterThanOrEqual(m);
  });
});

describe('statistical sanity: house edge', () => {
  const N = 200000;
  const points: number[] = [];
  for (let i = 0; i < N; i++) points.push(crashPoint(seeds(i)));

  it('~2% of rounds display a 1.00x crash (1% true instant bust + 1% rounded down from <1.01x)', () => {
    const f = points.filter((p) => p === 1).length / N;
    expect(f).toBeGreaterThan(0.016);
    expect(f).toBeLessThan(0.024);
  });
  it('P(crash >= m) ~ 0.99 / m', () => {
    for (const m of [1.5, 2, 5, 10]) {
      const f = points.filter((p) => p >= m).length / N;
      expect(Math.abs(f - winProbability(m))).toBeLessThan(0.006);
    }
  });
  it('fixed-target RTP ~ 99% for any target (house edge 1%)', () => {
    for (const target of [1.1, 1.5, 2, 3, 10]) {
      const bet = 100;
      let ret = 0;
      for (const p of points) ret += settleCrash(bet, target, p).payout;
      const rtp = ret / (N * bet);
      expect(Math.abs(rtp - (1 - CRASH_HOUSE_EDGE))).toBeLessThan(target >= 10 ? 0.09 : 0.03);
      expect(theoreticalRtp(target)).toBeCloseTo(0.99, 10);
    }
  });
});

describe('payout rounding (regression)', () => {
  it('uses integer maths: 100 chips at 1.15x pays 115, not 114 (float 100*1.15 = 114.99999999999999)', () => {
    expect(settleCrash(100, 1.15, 2).payout).toBe(115);
    expect(settleCrash(10, 1.15, 2).payout).toBe(11);
    expect(settleCrash(1000, 1.1, 2).payout).toBe(1100);
    expect(settleCrash(7, 1.29, 2).payout).toBe(9);
  });
});
