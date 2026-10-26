/**
 * European roulette (single zero, 37 pockets, play chips only).
 *
 * Outcome: pocket = nextInt(37) from the HMAC stream (uniform, unbiased).
 * Bets & payouts (profit : stake; total return = stake * (odds + 1)):
 *   straight (1 number) 35:1      split (2 adjacent)     17:1
 *   street (row of 3)   11:1      corner (4)              8:1
 *   six line (6)         5:1      dozen / column          2:1
 *   red/black, odd/even, low(1-18)/high(19-36)            1:1
 * Zero loses all outside bets. House edge = 1/37 = 2.703% on every bet (RTP 97.297%).
 * No "la partage"/"en prison" rules.
 *
 * Board layout: number n (1..36) is in column ((n-1) % 3) + 1 and row floor((n-1)/3) + 1;
 * 0 sits alone above the board.
 */
import { createStream, type Seeds } from '../rng/stream';

export const POCKETS = 37;
export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type InsideBetType = 'straight' | 'split' | 'street' | 'corner' | 'sixline';
export type OutsideBetType =
  | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high'
  | 'dozen1' | 'dozen2' | 'dozen3' | 'column1' | 'column2' | 'column3';
export type RouletteBetType = InsideBetType | OutsideBetType;

export interface RouletteBet {
  type: RouletteBetType;
  /** Required for inside bets: the covered pockets. Ignored for outside bets. */
  numbers?: number[];
  amount: number;
}

export const ODDS: Record<RouletteBetType, number> = {
  straight: 35, split: 17, street: 11, corner: 8, sixline: 5,
  red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
  dozen1: 2, dozen2: 2, dozen3: 2, column1: 2, column2: 2, column3: 2,
};

export function colorOf(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n <= 36;
const colOf = (n: number) => ((n - 1) % 3) + 1;
const rowOf = (n: number) => Math.floor((n - 1) / 3) + 1;

/** Classify a set of numbers as a valid inside bet shape, or null. */
export function identifyInsideBet(numbers: readonly number[]): InsideBetType | null {
  const ns = [...new Set(numbers)].sort((a, b) => a - b);
  if (ns.length !== numbers.length || !ns.every(inRange)) return null;
  if (ns.length === 1) return 'straight';
  // Anything involving zero on the layout (European): 0 pairs with 1,2,3 (split),
  // 0-1-2 / 0-2-3 (street / "trio"), 0-1-2-3 (first four / corner).
  if (ns[0] === 0) {
    const rest = ns.slice(1);
    if (rest.some((n) => n > 3)) return null;
    if (ns.length === 2) return 'split';
    if (ns.length === 3) return rest[1]! - rest[0]! === 1 ? 'street' : null;
    if (ns.length === 4) return rest.join() === '1,2,3' ? 'corner' : null;
    return null;
  }
  if (ns.length === 2) {
    const [a, b] = ns as [number, number];
    const horizontal = rowOf(a) === rowOf(b) && b - a === 1;
    const vertical = b - a === 3;
    return horizontal || vertical ? 'split' : null;
  }
  if (ns.length === 3) {
    const [a, b, c] = ns as [number, number, number];
    return rowOf(a) === rowOf(c) && c - a === 2 && b - a === 1 ? 'street' : null;
  }
  if (ns.length === 4) {
    const [a, b, c, d] = ns as [number, number, number, number];
    return colOf(a) < 3 && b - a === 1 && c - a === 3 && d - a === 4 ? 'corner' : null;
  }
  if (ns.length === 6) {
    const a = ns[0]!;
    const ok = colOf(a) === 1 && rowOf(a) <= 11 && ns.every((n, i) => n === a + i);
    return ok ? 'sixline' : null;
  }
  return null;
}

export function isInsideType(t: RouletteBetType): t is InsideBetType {
  return t === 'straight' || t === 'split' || t === 'street' || t === 'corner' || t === 'sixline';
}

/** Returns an error message, or null if the bet is well formed. */
export function validateBet(bet: RouletteBet): string | null {
  if (!Number.isInteger(bet.amount) || bet.amount <= 0) return 'amount must be a positive integer';
  if (!Object.prototype.hasOwnProperty.call(ODDS, bet.type)) return `unknown bet type ${String(bet.type)}`;
  if (isInsideType(bet.type)) {
    if (!bet.numbers) return 'inside bets need numbers';
    const kind = identifyInsideBet(bet.numbers);
    if (kind !== bet.type) return `numbers do not form a valid ${bet.type}`;
  }
  return null;
}

/** Does `bet` win on `pocket`? */
export function betWins(bet: RouletteBet, pocket: number): boolean {
  if (isInsideType(bet.type)) return (bet.numbers ?? []).includes(pocket);
  if (pocket === 0) return false;
  switch (bet.type) {
    case 'red': return colorOf(pocket) === 'red';
    case 'black': return colorOf(pocket) === 'black';
    case 'odd': return pocket % 2 === 1;
    case 'even': return pocket % 2 === 0;
    case 'low': return pocket <= 18;
    case 'high': return pocket >= 19;
    case 'dozen1': return pocket <= 12;
    case 'dozen2': return pocket >= 13 && pocket <= 24;
    case 'dozen3': return pocket >= 25;
    case 'column1': return colOf(pocket) === 1;
    case 'column2': return colOf(pocket) === 2;
    case 'column3': return colOf(pocket) === 3;
    default: return false;
  }
}

/** Total chips returned for one bet (stake included) on a pocket. */
export function betPayout(bet: RouletteBet, pocket: number): number {
  return betWins(bet, pocket) ? bet.amount * (ODDS[bet.type] + 1) : 0;
}

export function spinPocket(seeds: Seeds): number {
  return createStream(seeds).nextInt(POCKETS);
}

export interface RouletteParams {
  bets: RouletteBet[];
}
export interface RouletteResult {
  pocket: number;
  color: 'green' | 'red' | 'black';
  totalBet: number;
  payout: number;
}

export function playRoulette(seeds: Seeds, params: RouletteParams): RouletteResult {
  if (params.bets.length === 0) throw new Error('place at least one bet');
  for (const b of params.bets) {
    const err = validateBet(b);
    if (err) throw new Error(err);
  }
  const pocket = spinPocket(seeds);
  return {
    pocket,
    color: colorOf(pocket),
    totalBet: params.bets.reduce((s, b) => s + b.amount, 0),
    payout: params.bets.reduce((s, b) => s + betPayout(b, pocket), 0),
  };
}
