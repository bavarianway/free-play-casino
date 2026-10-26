import { describe, expect, it } from 'vitest';
import {
  BASE_WIN_CAP, BONUS_WIN_CAP, CANDLES, CANDLE_TYPES, CELLS, COLS, DOCUMENTED_BONUS_RATE, DOCUMENTED_HIT_RATE, DOCUMENTED_RTP,
  FREE_SPINS_BY_SCATTER, MAX_POSITION_MULTIPLIER, MIN_CLUSTER, ROWS, TOTAL_WEIGHT_ALL, TOTAL_WEIGHT_PAYING, countScatters,
  findClusters, freeSpinsFor, gridCode, payoutChips, playClusters, spinWith, summarizeClusters, tumble,
  type CandleSymbol, type CandleType, type Grid, type IntSource,
} from '../src/engine/games/clusters';
import { createWallet, placeBet, settle } from '../src/engine/wallet';
import { replayRound, seedOnlyOutcome, verifyRecord, canonicalJson } from '../src/engine/rng/verify';
import { parseFairState } from '../src/engine/rng/persist';
import { createFairState } from '../src/engine/rng/session';
import { simulate } from '../scripts/clusters-rtp';

const seeds = (nonce: number) => ({ serverSeed: '3'.repeat(64), clientSeed: 'candles', nonce });

/** Board from 7 strings of 7 chars: d=Doji s=Spinning top h=Hammer k=Shooting star e=Engulfing a=Harami t=Three soldiers m=Morning star u=Marubozu G=God Candle. */
const KEY: Record<string, CandleSymbol> = {
  d: 'DOJI', s: 'SPINNING_TOP', h: 'HAMMER', k: 'SHOOTING_STAR', e: 'ENGULFING', a: 'HARAMI', t: 'THREE_SOLDIERS', m: 'MORNING_STAR', u: 'MARUBOZU', G: 'GOD',
};
const mk = (rows: string[]): Grid => rows.join('').split('').map((ch) => KEY[ch]!);
/** Checkerboard of two candles: no two orthogonal neighbours match, so never a cluster. */
const checker = (i: number): CandleType => ((Math.floor(i / COLS) + (i % COLS)) % 2 === 0 ? 'DOJI' : 'SPINNING_TOP');
const NO_WIN = ['dsdsdsd', 'sdsdsds', 'dsdsdsd', 'sdsdsds', 'dsdsdsd', 'sdsdsds', 'dsdsdsd'];

/** Draw value that makes the weighted draw return `type` (or GOD on the opening board). */
function rFor(type: CandleSymbol): number {
  if (type === 'GOD') return TOTAL_WEIGHT_PAYING;
  let acc = 0;
  for (const c of CANDLES) {
    if (c.type === type) return acc;
    acc += c.weight;
  }
  throw new Error('unknown type');
}

/** Scripted integer source: returns queued values in order and fails loudly on over-draw. */
function scripted(queue: number[]): IntSource & { left: () => number } {
  let i = 0;
  return {
    nextInt(max) {
      if (i >= queue.length) throw new Error(`script exhausted after ${i} draws`);
      const v = queue[i++]!;
      if (v < 0 || v >= max) throw new Error(`scripted value ${v} out of range for nextInt(${max}) at draw ${i - 1}`);
      return v;
    },
    left: () => queue.length - i,
  };
}

/** Opening-board draws for a checkerboard with God Candles on the top row at the given columns. */
function openingWithGods(godCols: number[]): number[] {
  return Array.from({ length: CELLS }, (_, i) => (godCols.includes(i % COLS) && i < COLS ? rFor('GOD') : rFor(checker(i))));
}
const checkerBoardDraws = () => Array.from({ length: CELLS }, (_, i) => rFor(checker(i)));
const flatMultiplierDraws = () => new Array<number>(CELLS).fill(0); // all x1

describe('candle set', () => {
  it('has 9 distinct candle types with positive weights and values, plus a God Candle scatter', () => {
    expect(CANDLES).toHaveLength(9);
    expect(new Set(CANDLE_TYPES).size).toBe(9);
    for (const c of CANDLES) { expect(c.weight).toBeGreaterThan(0); expect(Number.isInteger(c.value)).toBe(true); expect(c.value).toBeGreaterThan(0); }
    expect(TOTAL_WEIGHT_ALL).toBeGreaterThan(TOTAL_WEIGHT_PAYING);
    expect(ROWS * COLS).toBe(CELLS);
    expect(CELLS).toBe(49);
  });
  it('values rise with rarity', () => {
    for (let i = 1; i < CANDLES.length; i++) expect(CANDLES[i]!.value).toBeGreaterThanOrEqual(CANDLES[i - 1]!.value);
  });
});

describe('cluster detection', () => {
  it('finds nothing on a board without clusters', () => expect(findClusters(mk(NO_WIN))).toEqual([]));
  it('requires 5 orthogonally connected candles (4 is not enough)', () => {
    const four = mk(['hhhhsds', 'sdsdhds', ...NO_WIN.slice(2)]);
    expect(findClusters(four).filter((c) => c.symbol === 'HAMMER')).toEqual([]);
    const five = mk(['hhhhhsd', 'sdsdsds', ...NO_WIN.slice(2)]);
    const found = findClusters(five);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ symbol: 'HAMMER', size: MIN_CLUSTER, cells: [0, 1, 2, 3, 4], value: 24, multiplier: 1, win: 24 * 5 });
  });
  it('diagonal neighbours do not connect', () => expect(findClusters(mk(NO_WIN))).toEqual([]));
  it('connects around corners and through columns (L / T shapes)', () => {
    const g = mk(['hsdsdsd', 'hdsdsds', 'hhhsdsd', ...NO_WIN.slice(3)]);
    const c = findClusters(g).find((x) => x.symbol === 'HAMMER')!;
    expect(c.cells).toEqual([0, 7, 14, 15, 16]);
  });
  it('does not wrap around the board edges', () => {
    const g = mk(['sdsdshh', 'hhhsdsd', ...NO_WIN.slice(2)]);
    expect(findClusters(g).filter((c) => c.symbol === 'HAMMER')).toEqual([]);
  });
  it('God Candles never form or join a cluster', () => {
    const g = mk(['GGGGGGG', ...NO_WIN.slice(1)]);
    expect(findClusters(g)).toEqual([]);
  });
  it('pays several separate clusters and sizes pay value * size', () => {
    const g = mk(['uuuuuds', 'sdsdsds', 'dsdsdsd', 'sdsdsds', 'dsdsdsd', 'sdsdsds', 'tttttsd']);
    const cs = findClusters(g);
    expect(cs.map((c) => c.symbol)).toEqual(['MARUBOZU', 'THREE_SOLDIERS']);
    expect(cs[0]!.win).toBe(330 * 5);
    expect(cs[1]!.win).toBe(100 * 5);
  });
  it('position multiplier is the SUM of the multipliers >1 under the cluster (1 if none)', () => {
    const g = mk(['hhhhhsd', 'sdsdsds', ...NO_WIN.slice(2)]);
    const none = new Array<number>(CELLS).fill(1);
    expect(findClusters(g, none)[0]!.multiplier).toBe(1);
    const some = none.slice(); some[0] = 2; some[3] = 8; some[10] = 4; // index 10 is outside the cluster
    const c = findClusters(g, some)[0]!;
    expect(c.multiplier).toBe(10);
    expect(c.win).toBe(24 * 5 * 10);
  });
  it('rejects a grid of the wrong size', () => expect(() => findClusters(['DOJI'])).toThrow());
});

describe('tumble', () => {
  it('drops survivors straight down (God Candles included) and refills only from the top', () => {
    const g = mk(['Gdsdsds', 'hsdsdsd', 'hdsdsds', 'hsdsdsd', 'hdsdsds', 'hsdsdsd', 'dsdsdsd']);
    const removed = new Set([7, 14, 21, 28]); // four hammers in column 0 (rows 1..4)
    const rng = scripted([rFor('MARUBOZU'), rFor('MARUBOZU'), rFor('MARUBOZU'), rFor('MARUBOZU')]);
    const next = tumble(g, removed, rng);
    expect(rng.left()).toBe(0);
    expect(next[0]).toBe('MARUBOZU'); expect(next[7]).toBe('MARUBOZU'); expect(next[14]).toBe('MARUBOZU'); expect(next[21]).toBe('MARUBOZU');
    expect(next[28]).toBe('GOD'); // fell from row 0 to row 4
    expect(next[35]).toBe('HAMMER'); expect(next[42]).toBe('DOJI'); // untouched below
  });
  it('refill never produces a God Candle even for the largest draw', () => {
    const g = mk(['dsdsdsd', ...NO_WIN.slice(1)]);
    const next = tumble(g, new Set([0]), { nextInt: (n) => n - 1 });
    expect(next[0]).toBe('MARUBOZU');
  });
  it('conserves non-removed candles and refills in column order', () => {
    const g = mk(NO_WIN);
    const removed = new Set([0, 1]);
    const calls: number[] = [];
    const next = tumble(g, removed, { nextInt: (n) => { calls.push(n); return 0; } });
    expect(calls).toEqual([TOTAL_WEIGHT_PAYING, TOTAL_WEIGHT_PAYING]);
    expect(next.filter((x) => x === 'DOJI' || x === 'SPINNING_TOP').length).toBe(CELLS);
  });
});

describe('payout maths', () => {
  it('floors in chips so rounding never favours the player', () => {
    expect(payoutChips(100, 150)).toBe(150);
    expect(payoutChips(10, 15)).toBe(1);
    expect(payoutChips(7, 15)).toBe(1);
    expect(payoutChips(10, 0)).toBe(0);
  });
});

describe('God Candle trigger rules', () => {
  it('free spins by scatter count: 3->10, 4->15, 5->20, 6->25, 7->25; below 3 none', () => {
    expect([0, 1, 2].map(freeSpinsFor)).toEqual([0, 0, 0]);
    expect([3, 4, 5, 6, 7].map(freeSpinsFor)).toEqual([10, 15, 20, 25, 25]);
    expect(FREE_SPINS_BY_SCATTER).toEqual({ 3: 10, 4: 15, 5: 20, 6: 25, 7: 25 });
  });
  it('2 God Candles never trigger', () => {
    const rng = scripted(openingWithGods([0, 3]));
    const r = spinWith(rng, 100);
    expect(r.scatters).toBe(2);
    expect(r.freeSpinsAwarded).toBe(0);
    expect(r.bonus).toBeNull();
    expect(r.totalHundredths).toBe(0);
    expect(rng.left()).toBe(0);
  });
  for (const [n, spins] of [[3, 10], [4, 15], [5, 20], [6, 25], [7, 25]] as const) {
    it(`${n} God Candles anywhere trigger exactly ${spins} free spins, no cost, no retrigger`, () => {
      const cols = [0, 1, 2, 3, 4, 5, 6].slice(0, n);
      const queue = [...openingWithGods(cols), ...flatMultiplierDraws()];
      for (let i = 0; i < spins; i++) queue.push(...checkerBoardDraws());
      const rng = scripted(queue);
      const r = spinWith(rng, 50);
      expect(r.scatters).toBe(n);
      expect(r.freeSpinsAwarded).toBe(spins);
      expect(r.bonus!.spins).toHaveLength(spins);
      expect(rng.left()).toBe(0); // every draw consumed in the documented order, none extra
      expect(r.payout).toBe(0);
      expect(countScatters(r.bonus!.spins[0]!.initialGrid)).toBe(0);
    });
  }
  it('God Candles can be anywhere (not just the top row)', () => {
    const draws = checkerBoardDraws();
    for (const i of [8, 24, 40]) draws[i] = rFor('GOD');
    const rng = scripted([...draws, ...flatMultiplierDraws(), ...Array.from({ length: 10 }, checkerBoardDraws).flat()]);
    const r = spinWith(rng, 10);
    expect(r.scatters).toBe(3);
    expect(r.freeSpinsAwarded).toBe(10);
  });
  it('a second God Candle in the same column is replaced by a paying candle (extra draw)', () => {
    const draws: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      draws.push(i === 0 || i === COLS ? rFor('GOD') : rFor(checker(i)));
      if (i === COLS) draws.push(rFor(checker(i))); // the replacement draw (nextInt(TOTAL_WEIGHT_PAYING))
    }
    const rng = scripted(draws);
    const r = spinWith(rng, 10);
    expect(r.initialGrid[0]).toBe('GOD');
    expect(r.initialGrid[COLS]).toBe(checker(COLS));
    expect(r.scatters).toBe(1);
    expect(rng.left()).toBe(0);
  });
  it('at most one God Candle per column even if every draw asks for one', () => {
    const r = spinWith({ nextInt: (n) => n - 1 }, 10);
    for (let c = 0; c < COLS; c++) {
      let gods = 0;
      for (let row = 0; row < ROWS; row++) if (r.initialGrid[row * COLS + c] === 'GOD') gods++;
      expect(gods).toBeLessThanOrEqual(1);
    }
    expect(r.scatters).toBeLessThanOrEqual(COLS);
  });
  it('God Candles stay put through tumbles (they fall with gravity but are never cleared)', () => {
    const draws = checkerBoardDraws();
    // five hammers along the bottom row (cols 0..4); a God Candle sits directly above the first hammer
    for (let c = 0; c < 5; c++) draws[6 * COLS + c] = rFor('HAMMER');
    draws[5 * COLS + 0] = rFor('GOD');
    // the checker cells above the hammers are DOJI/SPINNING_TOP, so the hammers form exactly one cluster.
    // refill: five alternating candles that cannot cluster with anything
    const alt = [rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU')];
    const rng = scripted([...draws, ...alt]);
    const r = spinWith(rng, 10);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.clusters[0]!.symbol).toBe('HAMMER');
    expect(r.finalGrid[6 * COLS + 0]).toBe('GOD'); // fell one row, still there
    expect(r.scatters).toBe(1);
    expect(rng.left()).toBe(0);
  });
});

describe('free spins', () => {
  const withHammerRow = (extra: Record<number, CandleType> = {}) => {
    const d = checkerBoardDraws();
    for (let c = 0; c < 5; c++) d[c] = rFor('HAMMER'); // row 0, cols 0..4 -> neighbours below are checker so no extension
    for (const [i, t] of Object.entries(extra)) d[Number(i)] = rFor(t);
    return d;
  };

  it('multiplier grid draws 1/2/4/8 from nextInt(100) with weights 58/25/12/5', () => {
    const md = flatMultiplierDraws();
    md[0] = 57; md[1] = 58; md[2] = 82; md[3] = 83; md[4] = 94; md[5] = 95; md[6] = 99;
    const q = [...openingWithGods([0, 1, 2]), ...md];
    for (let i = 0; i < 10; i++) q.push(...checkerBoardDraws());
    const r = spinWith(scripted(q), 10);
    expect(r.bonus!.startMultipliers.slice(0, 7)).toEqual([1, 2, 2, 4, 4, 8, 8]);
    expect(r.bonus!.startMultipliers.slice(7).every((m) => m === 1)).toBe(true);
  });
  it('free-spin clusters are multiplied by the sum of the multipliers beneath them, and winners double', () => {
    const md = flatMultiplierDraws();
    md[0] = 60; // x2
    md[1] = 90; // x4
    const first = withHammerRow();
    // refill after the hammer clear: row 0 cols 0..4 get alternating candles (no cluster)
    const refill = [rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU')];
    const queue = [...openingWithGods([0, 1, 2]), ...md, ...first, ...refill];
    for (let i = 1; i < 10; i++) queue.push(...checkerBoardDraws());
    const rng = scripted(queue);
    const r = spinWith(rng, 100);
    const spin = r.bonus!.spins[0]!;
    expect(spin.steps).toHaveLength(1);
    const cl = spin.steps[0]!.clusters[0]!;
    expect(cl.symbol).toBe('HAMMER');
    expect(cl.multiplier).toBe(6); // 2 + 4, the three x1 cells add nothing
    expect(cl.win).toBe(24 * 5 * 6);
    // cleared cells doubled: x2->x4, x4->x8, x1->x2
    expect(spin.steps[0]!.multipliers!.slice(0, 5)).toEqual([4, 8, 2, 2, 2]);
    expect(rng.left()).toBe(0);
  });
  it('the multiplier grid persists into the next free spin', () => {
    const md = flatMultiplierDraws();
    const second = withHammerRow();
    const refill = [rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU'), rFor('ENGULFING'), rFor('MARUBOZU')];
    const first = withHammerRow();
    const q = [...openingWithGods([0, 1, 2]), ...md, ...first, ...refill, ...second, ...refill];
    for (let i = 2; i < 10; i++) q.push(...checkerBoardDraws());
    const r = spinWith(scripted(q), 100);
    const [s1, s2] = r.bonus!.spins;
    expect(s1!.steps[0]!.clusters[0]!.multiplier).toBe(1);
    expect(s2!.steps[0]!.clusters[0]!.multiplier).toBe(10); // five cells that doubled once: 5 x 2
    expect(s2!.steps[0]!.multipliers!.slice(0, 5)).toEqual([4, 4, 4, 4, 4]);
  });
  it('multipliers never exceed the maximum', () => {
    expect(MAX_POSITION_MULTIPLIER).toBe(256);
    const r = spinWith({ nextInt: (n) => n - 1 }, 1);
    for (const spin of r.bonus!.spins) for (const s of spin.steps) for (const m of s.multipliers!) expect(m).toBeLessThanOrEqual(MAX_POSITION_MULTIPLIER);
  });
  it('free-spin boards never contain God Candles: there is no retrigger', () => {
    let seen = 0;
    for (let n = 0; n < 4000 && seen < 5; n++) {
      const r = playClusters(seeds(n), { bet: 10 });
      if (!r.bonus) continue;
      seen++;
      expect(r.bonus.spins.length).toBeLessThanOrEqual(r.freeSpinsAwarded);
      for (const s of r.bonus.spins) {
        expect(countScatters(s.initialGrid)).toBe(0);
        expect(countScatters(s.finalGrid)).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('caps', () => {
  it('base spin is capped at 100x and the whole round at 1000x', () => {
    // every draw takes the top band: God Candles along the top row, Marubozu everywhere else, x8 everywhere
    const res = spinWith({ nextInt: (n) => n - 1 }, 10);
    expect(res.capped).toBe(true);
    expect(res.baseHundredths).toBe(BASE_WIN_CAP * 100);
    expect(res.bonus).not.toBeNull();
    expect(res.bonus!.capped).toBe(true);
    expect(res.totalHundredths).toBe(BONUS_WIN_CAP * 100);
    expect(res.payout).toBe(10 * BONUS_WIN_CAP);
    expect(res.bonus!.spins).toHaveLength(1); // the session stops at the cap
  });
  it('trims the winning step so step wins always add up to the capped total', () => {
    const res = spinWith({ nextInt: (n) => n - 1 }, 1);
    expect(res.steps.reduce((s, x) => s + x.win, 0)).toBe(res.baseHundredths);
    const b = res.bonus!;
    expect(b.spins.reduce((s, x) => s + x.steps.reduce((a, st) => a + st.win, 0), 0)).toBe(b.totalHundredths);
  });
});

describe('random rounds (HMAC stream)', () => {
  it('structure is consistent for 600 rounds', () => {
    for (let n = 0; n < 600; n++) {
      const r = playClusters(seeds(n), { bet: 100 });
      expect(r.initialGrid).toHaveLength(CELLS);
      expect(r.steps.reduce((s, x) => s + x.win, 0)).toBe(r.baseHundredths);
      expect(r.totalHundredths).toBe(r.baseHundredths + (r.bonus?.totalHundredths ?? 0));
      expect(r.payout).toBe(payoutChips(100, r.totalHundredths));
      expect(r.payout).toBeLessThanOrEqual(100 * BONUS_WIN_CAP);
      expect(r.scatters).toBe(countScatters(r.initialGrid));
      expect(countScatters(r.finalGrid)).toBe(r.scatters);
      expect(r.freeSpinsAwarded).toBe(freeSpinsFor(r.scatters));
      expect(r.bonus === null).toBe(r.freeSpinsAwarded === 0);
      if (!r.capped) expect(findClusters(r.finalGrid)).toEqual([]);
      if (r.steps.length === 0) expect(r.baseHundredths).toBe(0);
      for (const s of r.steps) for (const c of s.clusters) {
        expect(c.size).toBeGreaterThanOrEqual(MIN_CLUSTER);
        expect(c.win).toBe(c.value * c.size * c.multiplier);
      }
    }
  });
  it('each column has at most one God Candle on every opening board', () => {
    for (let n = 0; n < 300; n++) {
      const g = playClusters(seeds(n), { bet: 10 }).initialGrid;
      for (let c = 0; c < COLS; c++) {
        let k = 0;
        for (let row = 0; row < ROWS; row++) if (g[row * COLS + c] === 'GOD') k++;
        expect(k).toBeLessThanOrEqual(1);
      }
    }
  });
  it('rejects invalid bets', () => {
    expect(() => playClusters(seeds(0), { bet: 0 })).toThrow();
    expect(() => playClusters(seeds(0), { bet: 1.5 })).toThrow();
    expect(() => playClusters(seeds(0), { bet: -5 })).toThrow();
  });
});

describe('determinism & verification', () => {
  it('same seeds => identical result (bonus included); different nonce or seed differs', () => {
    expect(playClusters(seeds(5), { bet: 50 })).toEqual(playClusters(seeds(5), { bet: 50 }));
    expect(playClusters(seeds(5), { bet: 50 }).initialGrid).not.toEqual(playClusters(seeds(6), { bet: 50 }).initialGrid);
    expect(playClusters({ ...seeds(5), clientSeed: 'other' }, { bet: 50 }).initialGrid).not.toEqual(playClusters(seeds(5), { bet: 50 }).initialGrid);
  });
  it('a bonus round replays identically from the seeds', () => {
    let n = 0;
    let r = playClusters(seeds(n), { bet: 10 });
    while (!r.bonus && n < 5000) r = playClusters(seeds(++n), { bet: 10 });
    expect(r.bonus).not.toBeNull();
    expect(canonicalJson(playClusters(seeds(n), { bet: 10 }))).toBe(canonicalJson(r));
  });
  it('bet does not influence the board', () => {
    expect(playClusters(seeds(9), { bet: 10 }).initialGrid).toEqual(playClusters(seeds(9), { bet: 5000 }).initialGrid);
  });
  it('replayRound / verifyRecord recompute the compact summary and detect tampering', () => {
    for (let n = 0; n < 150; n++) {
      const s = seeds(n);
      const res = playClusters(s, { bet: 100 });
      const summary = summarizeClusters(res);
      expect(canonicalJson(replayRound('clusters', s, { bet: 100 }))).toBe(canonicalJson(summary));
      const rec = { id: 1, game: 'clusters' as const, nonce: n, clientSeed: s.clientSeed, params: { bet: 100 }, result: summary, at: 0 };
      expect(verifyRecord(s.serverSeed, rec).ok).toBe(true);
      expect(verifyRecord(s.serverSeed, { ...rec, result: { ...summary, payout: summary.payout + 1 } }).ok).toBe(false);
      expect(verifyRecord(s.serverSeed, { ...rec, result: { ...summary, openingGrid: summary.openingGrid.replace(/./, (ch) => (ch === '0' ? '1' : '0')) } }).ok).toBe(false);
    }
  });
  it('summary of a bonus round carries the free-spin wins and multiplier start grid', () => {
    let n = 0;
    let r = playClusters(seeds(n), { bet: 10 });
    while (!r.bonus && n < 5000) r = playClusters(seeds(++n), { bet: 10 });
    const sum = summarizeClusters(r);
    expect(sum.freeSpinsAwarded).toBe(r.freeSpinsAwarded);
    expect(sum.freeSpinWins).toEqual(r.bonus!.spins.map((s) => s.winHundredths));
    expect(sum.startMultipliers).toEqual(r.bonus!.startMultipliers);
    expect(sum.openingGrid).toBe(gridCode(r.initialGrid));
    expect(JSON.stringify(sum).length).toBeLessThan(900); // compact enough to store 500 rounds per seed
  });
  it('seed-only outcome (manual verifier) exists, is stable and depends on the nonce', () => {
    const a = seedOnlyOutcome('clusters', seeds(1));
    expect(a).toEqual(seedOnlyOutcome('clusters', seeds(1)));
    expect(a).not.toEqual(seedOnlyOutcome('clusters', seeds(2)));
    expect((a.openingBoard as string[]).length).toBe(ROWS);
    expect(typeof a.godCandles).toBe('number');
  });
  it('stored rounds from the retired fruit-and-gem ruleset are dropped on load, others kept', () => {
    const st = createFairState({ serverSeed: 'a'.repeat(64) });
    const good = { id: 1, game: 'clusters', nonce: 0, clientSeed: 'x', params: { bet: 10 }, result: { openingGrid: '0' }, at: 0 };
    const legacy = { id: 2, game: 'clusters', nonce: 1, clientSeed: 'x', params: { bet: 10 }, result: { initialGrid: [] }, at: 0 };
    const junk = { id: 3, nope: true };
    const parsed = parseFairState({ ...st, current: { ...st.current, records: [good, legacy, junk] } })!;
    expect(parsed.current.records).toEqual([good]);
  });
});

describe('wallet invariants', () => {
  it('balance = start - sum(bets) + sum(payouts); never negative; only integers', () => {
    let w = createWallet();
    const start = w.balance;
    let bets = 0, pays = 0;
    for (let n = 0; n < 200; n++) {
      const bet = 10 + (n % 7) * 15;
      w = placeBet(w, bet);
      const r = playClusters(seeds(n), { bet });
      w = settle(w, r.payout);
      bets += bet; pays += r.payout;
      expect(Number.isInteger(w.balance)).toBe(true);
      expect(w.balance).toBeGreaterThanOrEqual(0);
    }
    expect(w.balance).toBe(start - bets + pays);
    expect(w.totalWagered).toBe(bets);
    expect(w.totalReturned).toBe(pays);
  });
});

describe('RTP sanity', () => {
  it('documented figures sit in the 95-97% band', () => {
    expect(DOCUMENTED_RTP).toBeGreaterThan(0.95);
    expect(DOCUMENTED_RTP).toBeLessThan(0.97);
  });
  it('a 1M-spin Monte Carlo (fixed seed) lands near the documented RTP, hit rate and bonus rate, and is below 100%', () => {
    // The bonus makes single-spin variance large (std error ~0.7 points at 1M spins); allow ~5 sigma on RTP.
    // Hit rate and bonus rate are far less noisy, so they are held tighter. The 80M-spin figure is in the README.
    const s = simulate(1_000_000, 2026);
    expect(s.rtp).toBeGreaterThan(DOCUMENTED_RTP - 0.04);
    expect(s.rtp).toBeLessThan(DOCUMENTED_RTP + 0.04);
    expect(s.rtp).toBeLessThan(1);
    expect(s.baseRtp).toBeGreaterThan(0.38);
    expect(s.baseRtp).toBeLessThan(0.43);
    expect(Math.abs(s.hitRate - DOCUMENTED_HIT_RATE)).toBeLessThan(0.005);
    expect(Math.abs(s.bonusRate - DOCUMENTED_BONUS_RATE)).toBeLessThan(0.001);
    expect(s.maxMultiplier).toBeLessThanOrEqual(BONUS_WIN_CAP);
  }, 120_000);
  it('the real HMAC stream behaves too (20k spins: plausible bonus rate, bounded payouts)', () => {
    let bonuses = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const r = playClusters(seeds(i), { bet: 1000 });
      if (r.bonus) bonuses++;
      expect(r.payout).toBeLessThanOrEqual(1000 * BONUS_WIN_CAP);
    }
    expect(bonuses / n).toBeGreaterThan(0.006);
    expect(bonuses / n).toBeLessThan(0.016);
  }, 120_000);
});
