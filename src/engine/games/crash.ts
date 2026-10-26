/**
 * Crash (play chips only).
 *
 * The crash multiplier is derived from the first 32 bits of the HMAC stream:
 *     u = uint32 / 2^32            (uniform in [0, 1))
 *     crash = max(1.00, floor(100 * (1 - HOUSE_EDGE) / (1 - u)) / 100)
 * so P(crash >= m) = (1 - HOUSE_EDGE) / m for any m >= 1 (before the 0.01
 * rounding, which slightly *lowers* the player's chances). Consequently the
 * expected return of ANY cash-out target m >= 1.01 is ~ (1 - HOUSE_EDGE) = 99%
 * (RTP ~ 99%, 1% house edge). About 2% of rounds end at 1.00x: 1% are a true
 * instant bust (u < 1%) and another ~1% round down from just under 1.01x; nobody can cash out there.
 *
 * Cash-out: the player wins floor(bet * cashOutAt) chips if cashOutAt <= crash
 * (the multiplier is a chip multiplier ONLY; there is no cash value).
 * Otherwise the stake is lost.
 */
import { createStream, type Seeds } from '../rng/stream';

export const CRASH_HOUSE_EDGE = 0.01;
export const CRASH_MAX_MULTIPLIER = 1_000_000;
export const CRASH_MIN_CASHOUT = 1.01;
/** Visual growth rate for the UI: multiplier(t) = e^(RATE * t_ms). ~2x after 7s. */
export const CRASH_GROWTH_PER_MS = Math.LN2 / 7000;

export function crashPointFromUint32(u32: number): number {
  const u = u32 / 4294967296;
  const raw = Math.floor((100 * (1 - CRASH_HOUSE_EDGE)) / (1 - u));
  return Math.min(CRASH_MAX_MULTIPLIER, Math.max(100, raw)) / 100;
}

export function crashPoint(seeds: Seeds): number {
  return crashPointFromUint32(createStream(seeds).nextUint32());
}

/** Multiplier shown after `ms` milliseconds of flight (floored to 2 dp, min 1.00). */
export function multiplierAtTime(ms: number): number {
  return Math.max(1, Math.floor(100 * Math.exp(CRASH_GROWTH_PER_MS * Math.max(0, ms))) / 100);
}

/** Milliseconds of flight until the displayed multiplier first reaches `m`. */
export function timeToReach(m: number): number {
  return Math.max(0, Math.log(m) / CRASH_GROWTH_PER_MS);
}

export function isValidCashOut(m: number): boolean {
  return Number.isFinite(m) && m >= CRASH_MIN_CASHOUT && m <= CRASH_MAX_MULTIPLIER;
}

export interface CrashParams {
  bet: number;
  /** Multiplier at which the player cashed out (2 dp), or null if they never did. */
  cashOutAt: number | null;
}
export interface CrashResult {
  crashPoint: number;
  cashedOut: boolean;
  bet: number;
  payout: number;
}

export function settleCrash(bet: number, cashOutAt: number | null, point: number): CrashResult {
  const won = cashOutAt !== null && isValidCashOut(cashOutAt) && cashOutAt <= point;
  return {
    crashPoint: point,
    cashedOut: won,
    bet,
    payout: won ? Math.floor((bet * Math.floor(cashOutAt! * 100 + 1e-9)) / 100) : 0, // integer maths: 100 * 1.15 must pay 115, not 114
  };
}

export function playCrash(seeds: Seeds, params: CrashParams): CrashResult {
  return settleCrash(params.bet, params.cashOutAt, crashPoint(seeds));
}

/** Theoretical probability that the round reaches (or passes) multiplier m. */
export function winProbability(m: number): number {
  return Math.min(1, (1 - CRASH_HOUSE_EDGE) / m);
}

/** Theoretical RTP of a fixed cash-out target m >= 1.01 (= 1 - house edge). */
export function theoreticalRtp(m: number): number {
  return winProbability(m) * m;
}
