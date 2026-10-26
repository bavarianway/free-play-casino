/**
 * Play-chip wallet. Chips are FAKE: they cannot be bought, sold, withdrawn or
 * redeemed. There is deliberately no deposit/withdraw/cash-out API here.
 *
 * Invariants (tested):
 *  - balance is always a non-negative safe integer
 *  - a bet is rejected (state unchanged) if it is not an integer, is outside
 *    [minBet, maxBet], or exceeds the balance
 *  - the only way chips are created is `settle` (game winnings) and the free
 *    once-per-day `claimTopUp` when broke
 */
export const STARTING_BALANCE = 10_000;
export const MIN_BET = 10;
export const MAX_BET = 5_000;
/** You count as "broke" when you cannot afford the minimum bet. */
export const BROKE_THRESHOLD = MIN_BET;
/** Free daily top-up restores the balance to the starting amount. */
export const TOP_UP_TO = STARTING_BALANCE;

export interface WalletState {
  balance: number;
  /** Local calendar day (YYYY-MM-DD) of the last free top-up, or null. */
  lastTopUpDay: string | null;
  totalWagered: number;
  totalReturned: number;
  rounds: number;
  topUps: number;
}

export type BetCheck = { ok: true } | { ok: false; reason: string };

export class WalletError extends Error {}

export function createWallet(): WalletState {
  return { balance: STARTING_BALANCE, lastTopUpDay: null, totalWagered: 0, totalReturned: 0, rounds: 0, topUps: 0 };
}

export function validateBet(
  state: WalletState,
  amount: number,
  limits: { minBet?: number; maxBet?: number } = {},
): BetCheck {
  const min = limits.minBet ?? MIN_BET;
  const max = limits.maxBet ?? MAX_BET;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return { ok: false, reason: 'Bet must be a whole number of chips.' };
  if (amount < min) return { ok: false, reason: `Minimum bet is ${min} chips.` };
  if (amount > max) return { ok: false, reason: `Maximum bet is ${max} chips.` };
  if (amount > state.balance) return { ok: false, reason: 'Not enough chips.' };
  return { ok: true };
}

/** Deduct a stake. Throws WalletError (state untouched) if the bet is invalid. */
export function placeBet(
  state: WalletState,
  amount: number,
  limits: { minBet?: number; maxBet?: number } = {},
): WalletState {
  const check = validateBet(state, amount, limits);
  if (!check.ok) throw new WalletError(check.reason);
  return { ...state, balance: state.balance - amount, totalWagered: state.totalWagered + amount };
}

/** Credit a round's total return (stake included; 0 for a loss) and count the round. */
export function settle(state: WalletState, payout: number): WalletState {
  if (!Number.isSafeInteger(payout) || payout < 0) throw new WalletError('Payout must be a non-negative integer.');
  return { ...state, balance: state.balance + payout, totalReturned: state.totalReturned + payout, rounds: state.rounds + 1 };
}

/**
 * Add an extra stake to a round in progress (blackjack double). Same validation as a bet,
 * but does not count as a new round (rounds only increment in `settle`).
 */
export const placeExtraStake = placeBet;

export function isBroke(state: WalletState): boolean {
  return state.balance < BROKE_THRESHOLD;
}

/** Local calendar day key, e.g. "2026-10-25". */
export function dayKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

export type TopUpCheck = { ok: true } | { ok: false; reason: 'not-broke' | 'already-claimed'; message: string };

export function canClaimTopUp(state: WalletState, now: Date): TopUpCheck {
  if (!isBroke(state)) return { ok: false, reason: 'not-broke', message: 'The free top-up is only available when you are out of chips.' };
  if (state.lastTopUpDay === dayKey(now))
    return { ok: false, reason: 'already-claimed', message: 'You already used today’s free top-up. Come back tomorrow.' };
  return { ok: true };
}

/** Free daily reset when broke: balance returns to TOP_UP_TO. Throws if not allowed. */
export function claimTopUp(state: WalletState, now: Date): WalletState {
  const check = canClaimTopUp(state, now);
  if (!check.ok) throw new WalletError(check.message);
  return { ...state, balance: TOP_UP_TO, lastTopUpDay: dayKey(now), topUps: state.topUps + 1 };
}
