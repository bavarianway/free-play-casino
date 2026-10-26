/**
 * Candle Clusters: a cluster-pays tumble slot where every cell of the 7x7 board is a candlestick
 * pattern (play chips only).
 *
 * Provenance. The rule set below follows the structure of the first ("v1") published ruleset of a
 * public cluster-pays candle slot, as visible in that site's openly served fairness-verifier code:
 * 7x7 board, 5+ orthogonally connected matching candles pay per-candle values scaled by cluster
 * size, winning candles vanish and the rest tumble, a scatter ("God Candle") that is never part of
 * a cluster, and a free-spin bonus with a persistent position-multiplier grid that doubles where
 * candles are cleared. All code, art, names and the RNG plumbing here are original; the HMAC seed
 * scheme is this app's own. Nothing about money, wallets or chains is used. See README.
 *
 * Rules
 *  - Board: 7 columns x 7 rows (49 cells). Index = row * 7 + col, row 0 = top.
 *  - Nine candle patterns (CANDLES) with draw weights and a per-candle value (hundredths of the
 *    bet). The tenth symbol, the GOD candle, is a scatter. It is not part of clusters, is never
 *    removed by tumbles, and appears at most once per column on the opening board.
 *  - A cluster is 5+ identical candles connected up/down/left/right. Every cluster pays
 *    value * size * position multiplier (the position multiplier is 1 in the base game).
 *  - Winning candles vanish, survivors fall straight down, new candles (never God Candles) drop in
 *    from above, and the board is checked again until no cluster remains (max 50 steps).
 *  - 3+ God Candles on the opening board trigger FREE_SPINS_BY_SCATTER[n] free spins at no cost
 *    (3->10, 4->15, 5->20, 6->25, 7->25). There is no retrigger.
 *  - Free spins share one position-multiplier grid: 49 values drawn from {1,2,4,8}; cells that are
 *    cleared double (max 256) and the grid persists through every tumble and every free spin.
 *    A cluster's multiplier is the sum of the grid values >1 under it (or 1 if none).
 *  - Caps: base spin <= 100x bet; the whole round (base + bonus) <= 1000x bet. Hitting a cap stops the
 *    spin or the bonus there.
 *
 * Randomness: one HMAC stream per round from (serverSeed, clientSeed, nonce), never re-seeded.
 * Draw order (fixed, every draw is nextInt):
 *  1. Opening board: cells 0..48 in row-major order. Each draw is nextInt(TOTAL_WEIGHT_ALL). If the
 *     result is GOD and that column already holds one, that cell takes one extra draw
 *     nextInt(TOTAL_WEIGHT_PAYING) from the paying pool instead.
 *  2. Each tumble: columns left to right; per column one nextInt(TOTAL_WEIGHT_PAYING) per emptied
 *     cell, top emptied cell first.
 *  3. If 3+ God Candles: 49 draws nextInt(100) (row-major) for the multiplier grid; then each free
 *     spin in order: 49 paying-pool draws (row-major) followed by its tumbles as in step 2.
 *
 * Money is integers: values are hundredths of the bet; the chip payout is
 * floor(bet * hundredths / 100), so rounding never favours the player.
 */
import { createStream, type Seeds } from '../rng/stream';

export type CandleType =
  | 'DOJI' | 'SPINNING_TOP' | 'HAMMER' | 'SHOOTING_STAR'
  | 'ENGULFING' | 'HARAMI' | 'THREE_SOLDIERS' | 'MORNING_STAR'
  | 'MARUBOZU';
export type CandleSymbol = CandleType | 'GOD';

export const COLS = 7;
export const ROWS = 7;
export const CELLS = COLS * ROWS;
export const MIN_CLUSTER = 5;
export const MAX_STEPS = 50;
/** Base-spin cap, in multiples of the bet. */
export const BASE_WIN_CAP = 100;
/** Whole-round cap (base spin + bonus together), in multiples of the bet. */
export const BONUS_WIN_CAP = 1000;
/** Highest value a position multiplier can double to. */
export const MAX_POSITION_MULTIPLIER = 256;

export interface CandleDef {
  type: CandleType;
  /** Draw weight out of TOTAL_WEIGHT_PAYING (plus GOD_WEIGHT on the opening board). */
  weight: number;
  /** Value per candle in the cluster, in hundredths of the bet. */
  value: number;
  tier: 'low' | 'high' | 'premium';
}

/** Low -> high paying. */
export const CANDLES: readonly CandleDef[] = [
  { type: 'DOJI', weight: 150, value: 15, tier: 'low' },
  { type: 'SPINNING_TOP', weight: 148, value: 18, tier: 'low' },
  { type: 'HAMMER', weight: 144, value: 24, tier: 'low' },
  { type: 'SHOOTING_STAR', weight: 140, value: 30, tier: 'low' },
  { type: 'ENGULFING', weight: 85, value: 60, tier: 'high' },
  { type: 'HARAMI', weight: 75, value: 80, tier: 'high' },
  { type: 'THREE_SOLDIERS', weight: 65, value: 100, tier: 'high' },
  { type: 'MORNING_STAR', weight: 52, value: 170, tier: 'high' },
  { type: 'MARUBOZU', weight: 62, value: 330, tier: 'premium' },
];
export const CANDLE_TYPES: readonly CandleType[] = CANDLES.map((c) => c.type);
export const GOD_WEIGHT = 10;
export const TOTAL_WEIGHT_PAYING = CANDLES.reduce((s, c) => s + c.weight, 0);
export const TOTAL_WEIGHT_ALL = TOTAL_WEIGHT_PAYING + GOD_WEIGHT;

/** Free spins awarded for n God Candles on the opening board (n < 3 awards none). */
export const FREE_SPINS_BY_SCATTER: Readonly<Record<number, number>> = { 3: 10, 4: 15, 5: 20, 6: 25, 7: 25 };
export const MIN_SCATTERS = 3;

/** Starting position-multiplier values and their weights (out of 100). */
export const MULTIPLIER_SEEDS: readonly { value: number; weight: number }[] = [
  { value: 1, weight: 58 }, { value: 2, weight: 25 }, { value: 4, weight: 12 }, { value: 8, weight: 5 },
];

/** Documented, simulated (Monte Carlo) return to player incl. the bonus; asserted in tests. */
export const DOCUMENTED_RTP = 0.9587;
/** Simulated probability that a spin returns something. */
export const DOCUMENTED_HIT_RATE = 0.2393;
/** Simulated probability that a spin triggers the free-spin bonus. */
export const DOCUMENTED_BONUS_RATE = 0.0108;

export type Grid = CandleSymbol[]; // length CELLS, row-major

export interface Cluster {
  symbol: CandleType;
  size: number;
  /** Grid indexes, ascending. */
  cells: number[];
  /** Value per candle, hundredths of the bet. */
  value: number;
  /** Position multiplier applied (1 in the base game). */
  multiplier: number;
  /** value * size * multiplier, hundredths of the bet (before any cap trimming). */
  win: number;
}

export interface Step {
  /** Board evaluated in this step. */
  grid: Grid;
  clusters: Cluster[];
  /** Win of this step in hundredths of the bet (the last step is trimmed if the cap hit). */
  win: number;
  /** Position multipliers after this step's clears (free spins only). */
  multipliers?: number[];
}

export interface SpinResult {
  initialGrid: Grid;
  steps: Step[];
  finalGrid: Grid;
  /** Hundredths of the bet, after the cap. */
  winHundredths: number;
  capped: boolean;
}

export interface BonusResult {
  /** Multiplier grid before the first free spin. */
  startMultipliers: number[];
  spins: SpinResult[];
  freeSpinsAwarded: number;
  totalHundredths: number;
  capped: boolean;
}

export interface ClustersParams { bet: number }
export interface ClustersResult extends SpinResult {
  scatters: number;
  freeSpinsAwarded: number;
  bonus: BonusResult | null;
  /** Base-spin win in hundredths of the bet. */
  baseHundredths: number;
  /** Base + bonus in hundredths of the bet. */
  totalHundredths: number;
  /** totalHundredths / 100. */
  multiplier: number;
  bet: number;
  payout: number;
}

export interface IntSource { nextInt(maxExclusive: number): number }

const VALUE: Readonly<Record<CandleType, number>> = Object.fromEntries(CANDLES.map((c) => [c.type, c.value])) as Record<CandleType, number>;

export function candleValue(t: CandleType): number {
  return VALUE[t];
}

export function drawPaying(rng: IntSource): CandleType {
  let r = rng.nextInt(TOTAL_WEIGHT_PAYING);
  for (const c of CANDLES) {
    r -= c.weight;
    if (r < 0) return c.type;
  }
  return CANDLES[CANDLES.length - 1]!.type; // unreachable
}

/** Opening board: God Candles may land, at most one per column. */
export function drawOpeningGrid(rng: IntSource): Grid {
  const grid: Grid = new Array<CandleSymbol>(CELLS);
  const hasGod = new Array<boolean>(COLS).fill(false);
  for (let i = 0; i < CELLS; i++) {
    const col = i % COLS;
    let r = rng.nextInt(TOTAL_WEIGHT_ALL);
    let sym: CandleSymbol | null = null;
    for (const c of CANDLES) {
      r -= c.weight;
      if (r < 0) { sym = c.type; break; }
    }
    if (sym === null) {
      if (hasGod[col]) sym = drawPaying(rng);
      else { sym = 'GOD'; hasGod[col] = true; }
    }
    grid[i] = sym;
  }
  return grid;
}

export function drawPayingGrid(rng: IntSource): Grid {
  return Array.from({ length: CELLS }, () => drawPaying(rng));
}

export function drawMultiplierGrid(rng: IntSource): number[] {
  return Array.from({ length: CELLS }, () => {
    let r = rng.nextInt(100);
    for (const m of MULTIPLIER_SEEDS) {
      r -= m.weight;
      if (r < 0) return m.value;
    }
    return 1; // unreachable
  });
}

export function countScatters(grid: readonly CandleSymbol[]): number {
  return grid.reduce((n, s) => n + (s === 'GOD' ? 1 : 0), 0);
}

export function freeSpinsFor(scatters: number): number {
  if (scatters < MIN_SCATTERS) return 0;
  return FREE_SPINS_BY_SCATTER[Math.min(scatters, COLS)]!;
}

/**
 * All clusters (>= MIN_CLUSTER connected identical candles), ordered by lowest cell index.
 * `multipliers` is the position-multiplier grid (omit in the base game). God Candles never cluster.
 */
export function findClusters(grid: readonly CandleSymbol[], multipliers?: readonly number[]): Cluster[] {
  if (grid.length !== CELLS) throw new RangeError(`grid must have ${CELLS} cells`);
  const seen = new Array<boolean>(CELLS).fill(false);
  const out: Cluster[] = [];
  for (let start = 0; start < CELLS; start++) {
    if (seen[start]) continue;
    const symbol = grid[start]!;
    if (symbol === 'GOD') { seen[start] = true; continue; }
    const cells: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const nbrs: number[] = [];
      if (r > 0) nbrs.push(i - COLS);
      if (r < ROWS - 1) nbrs.push(i + COLS);
      if (c > 0) nbrs.push(i - 1);
      if (c < COLS - 1) nbrs.push(i + 1);
      for (const n of nbrs) {
        if (!seen[n] && grid[n] === symbol) { seen[n] = true; stack.push(n); }
      }
    }
    if (cells.length >= MIN_CLUSTER) {
      cells.sort((a, b) => a - b);
      let multiplier = 0;
      if (multipliers) for (const i of cells) if (multipliers[i]! > 1) multiplier += multipliers[i]!;
      if (multiplier === 0) multiplier = 1;
      const value = candleValue(symbol);
      out.push({ symbol, size: cells.length, cells, value, multiplier, win: value * cells.length * multiplier });
    }
  }
  return out;
}

/**
 * Remove the given cells, drop survivors (God Candles included) straight down and refill from the
 * top with paying candles. Draw order: columns left to right, top emptied cell first.
 */
export function tumble(grid: readonly CandleSymbol[], removed: ReadonlySet<number>, rng: IntSource): Grid {
  const next: Grid = new Array<CandleSymbol>(CELLS);
  for (let c = 0; c < COLS; c++) {
    const keep: CandleSymbol[] = [];
    for (let r = 0; r < ROWS; r++) if (!removed.has(r * COLS + c)) keep.push(grid[r * COLS + c]!);
    const fresh = ROWS - keep.length;
    for (let r = 0; r < fresh; r++) next[r * COLS + c] = drawPaying(rng);
    for (let k = 0; k < keep.length; k++) next[(fresh + k) * COLS + c] = keep[k]!;
  }
  return next;
}

export function payoutChips(bet: number, hundredths: number): number {
  return Math.floor((bet * hundredths) / 100);
}

/**
 * Resolve tumbles from `initialGrid` until no cluster remains, the step limit, or `cap`
 * (hundredths of the bet) is reached. `multipliers`, if given, is mutated (doubles on clears).
 */
export function resolveSpin(initialGrid: Grid, rng: IntSource, cap: number, multipliers?: number[]): SpinResult {
  const steps: Step[] = [];
  let grid = initialGrid;
  let total = 0;
  let capped = false;
  for (let n = 0; n < MAX_STEPS; n++) {
    const clusters = findClusters(grid, multipliers);
    if (clusters.length === 0) break;
    let win = clusters.reduce((s, c) => s + c.win, 0);
    const removed = new Set<number>();
    for (const c of clusters) for (const i of c.cells) removed.add(i);
    if (multipliers) for (const i of removed) multipliers[i] = Math.min(multipliers[i]! * 2, MAX_POSITION_MULTIPLIER);
    if (total + win >= cap) { win = cap - total; capped = true; }
    total += win;
    const step: Step = { grid, clusters, win };
    if (multipliers) step.multipliers = multipliers.slice();
    steps.push(step);
    if (capped) break;
    grid = tumble(grid, removed, rng);
  }
  return { initialGrid, steps, finalGrid: grid, winHundredths: total, capped };
}

/** Free-spin session: `spins` spins on one persistent multiplier grid, whole-bonus cap applied. */
export function playBonus(rng: IntSource, spins: number, baseHundredths = 0): BonusResult {
  const multipliers = drawMultiplierGrid(rng);
  const startMultipliers = multipliers.slice();
  const cap = BONUS_WIN_CAP * 100 - baseHundredths;
  const results: SpinResult[] = [];
  let total = 0;
  let capped = false;
  for (let i = 0; i < spins; i++) {
    const spin = resolveSpin(drawPayingGrid(rng), rng, cap - total, multipliers);
    results.push(spin);
    total += spin.winHundredths;
    if (spin.capped || total >= cap) { capped = true; break; }
  }
  return { startMultipliers, spins: results, freeSpinsAwarded: spins, totalHundredths: total, capped };
}

/** Play one round using any integer source (HMAC stream in the app, a fast PRNG in simulations). */
export function spinWith(rng: IntSource, bet = 1): ClustersResult {
  const base = resolveSpin(drawOpeningGrid(rng), rng, BASE_WIN_CAP * 100);
  const scatters = countScatters(base.finalGrid);
  const freeSpinsAwarded = freeSpinsFor(scatters);
  const bonus = freeSpinsAwarded > 0 ? playBonus(rng, freeSpinsAwarded, base.winHundredths) : null;
  const total = base.winHundredths + (bonus?.totalHundredths ?? 0);
  return {
    ...base,
    scatters,
    freeSpinsAwarded,
    bonus,
    baseHundredths: base.winHundredths,
    totalHundredths: total,
    multiplier: total / 100,
    bet,
    payout: payoutChips(bet, total),
  };
}

export function playClusters(seeds: Seeds, params: ClustersParams): ClustersResult {
  if (!Number.isInteger(params.bet) || params.bet <= 0) throw new RangeError('bet must be a positive integer');
  return spinWith(createStream(seeds), params.bet);
}

/** One character per cell: candle index 0-8, or G for a God Candle. */
export function gridCode(grid: readonly CandleSymbol[]): string {
  return grid.map((s) => (s === 'GOD' ? 'G' : String(CANDLE_TYPES.indexOf(s)))).join('');
}

export interface ClustersSummary {
  bet: number;
  payout: number;
  totalHundredths: number;
  baseHundredths: number;
  baseSteps: number;
  openingGrid: string;
  scatters: number;
  freeSpinsAwarded: number;
  freeSpinsPlayed: number;
  /** Win of each free spin, hundredths of the bet. */
  freeSpinWins: number[];
  startMultipliers: number[] | null;
  capped: boolean;
}

/** Compact, verifiable record of a round (what is stored; the full result is recomputable). */
export function summarizeClusters(r: ClustersResult): ClustersSummary {
  return {
    bet: r.bet,
    payout: r.payout,
    totalHundredths: r.totalHundredths,
    baseHundredths: r.baseHundredths,
    baseSteps: r.steps.length,
    openingGrid: gridCode(r.initialGrid),
    scatters: r.scatters,
    freeSpinsAwarded: r.freeSpinsAwarded,
    freeSpinsPlayed: r.bonus?.spins.length ?? 0,
    freeSpinWins: r.bonus?.spins.map((s) => s.winHundredths) ?? [],
    startMultipliers: r.bonus?.startMultipliers ?? null,
    capped: r.capped || (r.bonus?.capped ?? false),
  };
}
