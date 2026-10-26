import { describe, expect, it } from 'vitest';
import {
  ODDS, POCKETS, betPayout, betWins, colorOf, identifyInsideBet, playRoulette, validateBet, type RouletteBet,
} from '../src/engine/games/roulette';

const seeds = (nonce: number) => ({ serverSeed: '2'.repeat(64), clientSeed: 'roulette', nonce });

describe('wheel', () => {
  it('European: 37 pockets, 18 red, 18 black, one green zero', () => {
    expect(POCKETS).toBe(37);
    const colors = Array.from({ length: 37 }, (_, n) => colorOf(n));
    expect(colors.filter((x) => x === 'red')).toHaveLength(18);
    expect(colors.filter((x) => x === 'black')).toHaveLength(18);
    expect(colors.filter((x) => x === 'green')).toEqual(['green']);
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
    expect(colorOf(36)).toBe('red');
  });
});

describe('inside bet shapes', () => {
  it('identifies valid shapes', () => {
    expect(identifyInsideBet([17])).toBe('straight');
    expect(identifyInsideBet([0])).toBe('straight');
    expect(identifyInsideBet([1, 2])).toBe('split');
    expect(identifyInsideBet([1, 4])).toBe('split');
    expect(identifyInsideBet([0, 2])).toBe('split');
    expect(identifyInsideBet([1, 2, 3])).toBe('street');
    expect(identifyInsideBet([0, 1, 2])).toBe('street');
    expect(identifyInsideBet([0, 2, 3])).toBe('street');
    expect(identifyInsideBet([1, 2, 4, 5])).toBe('corner');
    expect(identifyInsideBet([0, 1, 2, 3])).toBe('corner');
    expect(identifyInsideBet([1, 2, 3, 4, 5, 6])).toBe('sixline');
    expect(identifyInsideBet([31, 32, 33, 34, 35, 36])).toBe('sixline');
  });
  it('rejects invalid shapes', () => {
    expect(identifyInsideBet([3, 4])).toBeNull(); // wraps row
    expect(identifyInsideBet([1, 3])).toBeNull();
    expect(identifyInsideBet([2, 3, 4])).toBeNull();
    expect(identifyInsideBet([2, 3, 5, 6, 8])).toBeNull();
    expect(identifyInsideBet([3, 4, 6, 7])).toBeNull(); // wraps columns
    expect(identifyInsideBet([2, 3, 4, 5, 6, 7])).toBeNull();
    expect(identifyInsideBet([0, 1, 3])).toBeNull();
    expect(identifyInsideBet([37])).toBeNull();
    expect(identifyInsideBet([1, 1])).toBeNull();
    expect(identifyInsideBet([])).toBeNull();
  });
});

describe('payout odds', () => {
  const win = (b: RouletteBet, n: number) => betPayout(b, n);
  it('inside bets pay 35/17/11/8/5 to 1 (stake included)', () => {
    expect(win({ type: 'straight', numbers: [7], amount: 10 }, 7)).toBe(360);
    expect(win({ type: 'split', numbers: [7, 8], amount: 10 }, 8)).toBe(180);
    expect(win({ type: 'street', numbers: [7, 8, 9], amount: 10 }, 9)).toBe(120);
    expect(win({ type: 'corner', numbers: [7, 8, 10, 11], amount: 10 }, 10)).toBe(90);
    expect(win({ type: 'sixline', numbers: [7, 8, 9, 10, 11, 12], amount: 10 }, 12)).toBe(60);
    expect(win({ type: 'straight', numbers: [7], amount: 10 }, 8)).toBe(0);
  });
  it('outside bets pay 1:1 and 2:1; zero loses them all', () => {
    expect(win({ type: 'red', amount: 10 }, 1)).toBe(20);
    expect(win({ type: 'black', amount: 10 }, 2)).toBe(20);
    expect(win({ type: 'odd', amount: 10 }, 3)).toBe(20);
    expect(win({ type: 'even', amount: 10 }, 4)).toBe(20);
    expect(win({ type: 'low', amount: 10 }, 18)).toBe(20);
    expect(win({ type: 'high', amount: 10 }, 19)).toBe(20);
    expect(win({ type: 'dozen1', amount: 10 }, 12)).toBe(30);
    expect(win({ type: 'dozen2', amount: 10 }, 13)).toBe(30);
    expect(win({ type: 'dozen3', amount: 10 }, 36)).toBe(30);
    expect(win({ type: 'column1', amount: 10 }, 34)).toBe(30);
    expect(win({ type: 'column2', amount: 10 }, 35)).toBe(30);
    expect(win({ type: 'column3', amount: 10 }, 36)).toBe(30);
    for (const t of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'] as const)
      expect(betWins({ type: t, amount: 1 }, 0)).toBe(false);
  });
  it('every bet type has house edge exactly 1/37 (RTP 36/37)', () => {
    const bets: RouletteBet[] = [
      { type: 'straight', numbers: [5], amount: 1 },
      { type: 'split', numbers: [5, 6], amount: 1 },
      { type: 'street', numbers: [4, 5, 6], amount: 1 },
      { type: 'corner', numbers: [4, 5, 7, 8], amount: 1 },
      { type: 'sixline', numbers: [4, 5, 6, 7, 8, 9], amount: 1 },
      ...(['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'] as const).map(
        (type) => ({ type, amount: 1 }) as RouletteBet,
      ),
    ];
    for (const b of bets) {
      let total = 0;
      for (let n = 0; n < 37; n++) total += betPayout(b, n);
      expect(total / 37).toBeCloseTo(36 / 37, 10);
    }
    expect(Object.keys(ODDS)).toHaveLength(17);
  });
});

describe('validation and play', () => {
  it('validates bets', () => {
    expect(validateBet({ type: 'red', amount: 5 })).toBeNull();
    expect(validateBet({ type: 'red', amount: 0 })).not.toBeNull();
    expect(validateBet({ type: 'red', amount: 1.5 })).not.toBeNull();
    expect(validateBet({ type: 'split', numbers: [1, 5], amount: 5 })).not.toBeNull();
    expect(validateBet({ type: 'straight', amount: 5 })).not.toBeNull();
    expect(() => playRoulette(seeds(0), { bets: [] })).toThrow();
  });
  it('is deterministic; payout sums all bets', () => {
    const bets: RouletteBet[] = [
      { type: 'red', amount: 10 },
      { type: 'straight', numbers: [0], amount: 5 },
    ];
    const r = playRoulette(seeds(4), { bets });
    expect(r).toEqual(playRoulette(seeds(4), { bets }));
    expect(r.totalBet).toBe(15);
    expect(r.payout).toBe(betPayout(bets[0]!, r.pocket) + betPayout(bets[1]!, r.pocket));
    expect(r.color).toBe(colorOf(r.pocket));
  });
  it('statistical: pockets are uniform (chi-square, df=36, p=0.001)', () => {
    const N = 74000;
    const counts = new Array(37).fill(0);
    for (let i = 0; i < N; i++) counts[playRoulette(seeds(i), { bets: [{ type: 'red', amount: 1 }] }).pocket]++;
    const exp = N / 37;
    const chi = counts.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(67.99);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });
  it('statistical: red bet RTP ~ 97.3%', () => {
    const N = 100000;
    let ret = 0;
    for (let i = 0; i < N; i++) ret += playRoulette(seeds(i + 1_000_000), { bets: [{ type: 'red', amount: 1 }] }).payout;
    expect(Math.abs(ret / N - 36 / 37)).toBeLessThan(0.015);
  });
});

describe('bet validation (regression)', () => {
  it('rejects inherited object keys as bet types', () => {
    for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(validateBet({ type, numbers: [], amount: 10 } as unknown as RouletteBet)).toMatch(/unknown bet type/);
    }
  });
});
