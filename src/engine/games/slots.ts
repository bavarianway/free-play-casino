/**
 * Slots: 3 reels, single centre payline, 3 visible rows (play chips only).
 *
 * Each reel has a 20-stop strip (identical strips). Every spin draws three
 * independent stops via nextInt(20) from the HMAC stream (reel 1, 2, 3). The
 * symbols one stop above/below are purely cosmetic; only the centre line pays.
 *
 * Paytable (multiplier of the bet, total return = bet * multiplier):
 *   three of a kind: see PAYTABLE_THREE
 *   any two CHERRY (not three):  CHERRY_PAIR_PAYS
 *   exactly one CHERRY:          CHERRY_SINGLE_PAYS
 *
 * RTP is computed EXACTLY by enumerating all 20^3 = 8000 equally likely stop
 * combinations (`computeRtp()`); the documented value is `DOCUMENTED_RTP`
 * and the unit tests assert they agree.
 */
import { createStream, type Seeds } from '../rng/stream';

export type SlotSymbol = 'SEVEN' | 'BAR' | 'BELL' | 'STAR' | 'CHERRY' | 'LEMON';

export const REEL_STRIP: readonly SlotSymbol[] = [
  'SEVEN',
  'BAR', 'BAR',
  'BELL', 'BELL', 'BELL',
  'STAR', 'STAR', 'STAR', 'STAR',
  'CHERRY', 'CHERRY', 'CHERRY', 'CHERRY',
  'LEMON', 'LEMON', 'LEMON', 'LEMON', 'LEMON', 'LEMON',
];

export const PAYTABLE_THREE: Readonly<Record<SlotSymbol, number>> = {
  SEVEN: 200,
  BAR: 50,
  BELL: 20,
  STAR: 10,
  CHERRY: 8,
  LEMON: 3,
};
export const CHERRY_PAIR_PAYS = 2;
export const CHERRY_SINGLE_PAYS = 1;

/** Exact RTP of the paytable above (see tests/slots.test.ts). */
export const DOCUMENTED_RTP = 0.9435; // 94.35%, house edge 5.65%
export const DOCUMENTED_HIT_RATE = 0.5275; // 52.75% of spins return >= 1x the bet
export const REELS = 3;

export type Reels = [SlotSymbol, SlotSymbol, SlotSymbol];

/** Multiplier of the bet returned for the centre-line symbols. */
export function lineMultiplier(line: readonly SlotSymbol[]): number {
  const [a, b, c] = line;
  if (a === b && b === c) return PAYTABLE_THREE[a!];
  const cherries = line.filter((s) => s === 'CHERRY').length;
  if (cherries === 2) return CHERRY_PAIR_PAYS;
  if (cherries === 1) return CHERRY_SINGLE_PAYS;
  return 0;
}

/** Exact RTP by full enumeration of the stop space. */
export function computeRtp(): number {
  const n = REEL_STRIP.length;
  let total = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        total += lineMultiplier([REEL_STRIP[i]!, REEL_STRIP[j]!, REEL_STRIP[k]!]);
  return total / n ** 3;
}

/** Probability that a spin pays anything (hit frequency), exact. */
export function computeHitRate(): number {
  const n = REEL_STRIP.length;
  let hits = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        if (lineMultiplier([REEL_STRIP[i]!, REEL_STRIP[j]!, REEL_STRIP[k]!]) > 0) hits++;
  return hits / n ** 3;
}

export interface SlotsParams {
  bet: number;
}
export interface SlotsResult {
  stops: [number, number, number];
  /** [above, centre, below] for each reel (cosmetic window). */
  window: [SlotSymbol[], SlotSymbol[], SlotSymbol[]];
  line: Reels;
  multiplier: number;
  bet: number;
  payout: number;
}

export function playSlots(seeds: Seeds, params: SlotsParams): SlotsResult {
  if (!Number.isInteger(params.bet) || params.bet <= 0) throw new RangeError('bet must be a positive integer');
  const rng = createStream(seeds);
  const n = REEL_STRIP.length;
  const stops: [number, number, number] = [rng.nextInt(n), rng.nextInt(n), rng.nextInt(n)];
  const at = (i: number) => REEL_STRIP[((i % n) + n) % n]!;
  const window = stops.map((s) => [at(s - 1), at(s), at(s + 1)]) as SlotsResult['window'];
  const line = stops.map((s) => at(s)) as Reels;
  const multiplier = lineMultiplier(line);
  return { stops, window, line, multiplier, bet: params.bet, payout: params.bet * multiplier };
}
