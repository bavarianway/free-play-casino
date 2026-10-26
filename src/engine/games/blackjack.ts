/**
 * Blackjack (play chips only).
 *
 * Rules
 *  - Fresh 6-deck shoe (312 cards) shuffled per round from (serverSeed, clientSeed, nonce).
 *  - Player actions: hit, stand, double (first two cards only; exactly one more card, then stand).
 *  - No split, no insurance, no surrender (documented simplification).
 *  - Dealer peeks for blackjack. Dealer draws to 16 and STANDS ON ALL 17s (including soft 17).
 *  - Natural blackjack pays 3:2 (bet 100 returns 250 total); odd bets round the profit down.
 *  - Win pays 1:1, push returns the bet, bust loses.
 *  - A natural beats a non-natural 21; two naturals push.
 *
 * All payouts are "total returned to the wallet" (stake included). 0 means the stake is lost.
 */
import { createStream, type Seeds } from '../rng/stream';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';
export interface Card {
  rank: Rank;
  suit: Suit;
}
export type BlackjackAction = 'hit' | 'stand' | 'double';
export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export const DECKS_IN_SHOE = 6;
export const BLACKJACK_PAYOUT_NUM = 3;
export const BLACKJACK_PAYOUT_DEN = 2;
/** Dealer stands on 17 and above, hard or soft. */
export const DEALER_STAND_ON = 17;

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export function cardToString(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function buildShoe(decks = DECKS_IN_SHOE): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const suit of SUITS) for (const rank of RANKS) shoe.push({ rank, suit });
  return shoe;
}

/** Deterministically shuffled shoe for a given set of seeds. */
export function shuffledShoe(seeds: Seeds): Card[] {
  return createStream(seeds).shuffle(buildShoe());
}

export function cardValue(c: Card): number {
  if (c.rank === 'A') return 11;
  if ('TJQK'.includes(c.rank)) return 10;
  return Number(c.rank);
}

export interface HandValue {
  total: number;
  soft: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export interface BlackjackState {
  shoe: Card[];
  /** Next card index in the shoe. */
  pos: number;
  player: Card[];
  dealer: Card[];
  /** Current stake (doubles after a double-down). */
  bet: number;
  doubled: boolean;
  /** true once the round is settled */
  finished: boolean;
  outcome: BlackjackOutcome | null;
  /** Total chips returned to the wallet (0 = stake lost). Set when finished. */
  payout: number;
  actions: BlackjackAction[];
}

function draw(s: BlackjackState): Card {
  return s.shoe[s.pos++]!;
}

/** Payout (total returned) for a given outcome and bet. */
export function payoutFor(outcome: BlackjackOutcome, bet: number): number {
  switch (outcome) {
    case 'blackjack':
      return bet + Math.floor((bet * BLACKJACK_PAYOUT_NUM) / BLACKJACK_PAYOUT_DEN);
    case 'win':
      return bet * 2;
    case 'push':
      return bet;
    default:
      return 0;
  }
}

function finish(s: BlackjackState, outcome: BlackjackOutcome): BlackjackState {
  s.finished = true;
  s.outcome = outcome;
  s.payout = payoutFor(outcome, s.bet);
  return s;
}

function clone(s: BlackjackState): BlackjackState {
  return { ...s, player: [...s.player], dealer: [...s.dealer], actions: [...s.actions] };
}

/** Deal a round. Pass the pre-shuffled shoe (see `shuffledShoe`). */
export function deal(shoe: Card[], bet: number): BlackjackState {
  if (!Number.isInteger(bet) || bet <= 0) throw new RangeError('bet must be a positive integer');
  const s: BlackjackState = {
    shoe,
    pos: 0,
    player: [],
    dealer: [],
    bet,
    doubled: false,
    finished: false,
    outcome: null,
    payout: 0,
    actions: [],
  };
  s.player.push(draw(s));
  s.dealer.push(draw(s));
  s.player.push(draw(s));
  s.dealer.push(draw(s));
  const pbj = isBlackjack(s.player);
  const dbj = isBlackjack(s.dealer);
  if (pbj && dbj) return finish(s, 'push');
  if (pbj) return finish(s, 'blackjack');
  if (dbj) return finish(s, 'lose');
  return s;
}

export function canDouble(s: BlackjackState): boolean {
  return !s.finished && s.player.length === 2 && !s.doubled;
}

function playDealer(s: BlackjackState): void {
  while (handValue(s.dealer).total < DEALER_STAND_ON) s.dealer.push(draw(s));
}

function settleAgainstDealer(s: BlackjackState): BlackjackState {
  playDealer(s);
  const p = handValue(s.player).total;
  const d = handValue(s.dealer).total;
  if (d > 21 || p > d) return finish(s, 'win');
  if (p === d) return finish(s, 'push');
  return finish(s, 'lose');
}

export function applyAction(state: BlackjackState, action: BlackjackAction): BlackjackState {
  if (state.finished) throw new Error('round already finished');
  const s = clone(state);
  s.actions.push(action);
  switch (action) {
    case 'hit': {
      s.player.push(draw(s));
      const t = handValue(s.player).total;
      if (t > 21) return finish(s, 'bust');
      if (t === 21) return settleAgainstDealer(s); // 21: auto-stand
      return s;
    }
    case 'stand':
      return settleAgainstDealer(s);
    case 'double': {
      if (!canDouble(state)) throw new Error('double is only allowed on the first two cards');
      s.bet = state.bet * 2;
      s.doubled = true;
      s.player.push(draw(s));
      if (handValue(s.player).total > 21) return finish(s, 'bust');
      return settleAgainstDealer(s);
    }
  }
}

export interface BlackjackParams {
  bet: number;
  actions: BlackjackAction[];
}
export interface BlackjackResult {
  outcome: BlackjackOutcome;
  /** Final stake (after any double). */
  bet: number;
  payout: number;
  player: string[];
  dealer: string[];
}

export function summarize(s: BlackjackState): BlackjackResult {
  if (!s.finished || !s.outcome) throw new Error('round not finished');
  return {
    outcome: s.outcome,
    bet: s.bet,
    payout: s.payout,
    player: s.player.map(cardToString),
    dealer: s.dealer.map(cardToString),
  };
}

/** Replay a full round from seeds + recorded actions (used by the verifier). */
export function replayBlackjack(seeds: Seeds, params: BlackjackParams): BlackjackResult {
  let s = deal(shuffledShoe(seeds), params.bet);
  for (const a of params.actions) s = applyAction(s, a);
  return summarize(s);
}
