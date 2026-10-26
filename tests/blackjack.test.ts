import { describe, expect, it } from 'vitest';
import {
  applyAction, buildShoe, canDouble, cardToString, deal, handValue, isBlackjack, payoutFor, replayBlackjack,
  shuffledShoe, summarize, type BlackjackState, type Card, type Rank, type Suit,
} from '../src/engine/games/blackjack';
import { createStream } from '../src/engine/rng';

const c = (s: string): Card => ({ rank: s[0] as Rank, suit: (s[1] ?? 'S') as Suit });
/** Build a shoe that deals the given cards first (P, D, P, D, then draws), padded with 2s. */
const shoe = (...cards: string[]): Card[] => [...cards.map(c), ...Array.from({ length: 50 }, () => c('2C'))];
const hv = (...cards: string[]) => handValue(cards.map(c));

describe('hand values', () => {
  it('counts aces as 1 or 11, face cards as 10', () => {
    expect(hv('AS', 'KH')).toEqual({ total: 21, soft: true });
    expect(hv('AS', 'AH')).toEqual({ total: 12, soft: true });
    expect(hv('AS', '6H', 'KD')).toEqual({ total: 17, soft: false });
    expect(hv('KS', 'QH', '5D')).toEqual({ total: 25, soft: false });
    expect(hv('AS', 'AH', 'AD', '8C')).toEqual({ total: 21, soft: true });
  });
  it('three-card 21 is not a blackjack', () => {
    expect(isBlackjack(['7S', '7H', '7D'].map(c))).toBe(false);
    expect(isBlackjack(['AS', 'KH'].map(c))).toBe(true);
  });
});

describe('shoe', () => {
  it('has 6 decks and shuffles deterministically', () => {
    const s = buildShoe();
    expect(s).toHaveLength(312);
    const seeds = { serverSeed: 'a'.repeat(64), clientSeed: 'bj', nonce: 0 };
    const a = shuffledShoe(seeds).map(cardToString);
    expect(a).toEqual(shuffledShoe(seeds).map(cardToString));
    expect([...a].sort()).toEqual(s.map(cardToString).sort());
  });
});

describe('payouts', () => {
  it('blackjack pays 3:2', () => {
    expect(payoutFor('blackjack', 100)).toBe(250);
    expect(payoutFor('blackjack', 10)).toBe(25);
    expect(payoutFor('blackjack', 15)).toBe(15 + 22); // odd profit rounds down
    expect(payoutFor('win', 100)).toBe(200);
    expect(payoutFor('push', 100)).toBe(100);
    expect(payoutFor('lose', 100)).toBe(0);
    expect(payoutFor('bust', 100)).toBe(0);
  });
});

describe('deal and naturals', () => {
  it('player natural pays 3:2 immediately', () => {
    const s = deal(shoe('AS', '9H', 'KS', '8D'), 100);
    expect(s.finished && s.outcome).toBe('blackjack');
    expect(s.payout).toBe(250);
  });
  it('both naturals push', () => {
    const s = deal(shoe('AS', 'AH', 'KS', 'KD'), 100);
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });
  it('dealer natural (peek) beats a non-natural 20', () => {
    const s = deal(shoe('KS', 'AH', 'QS', 'KD'), 100);
    expect(s.outcome).toBe('lose');
    expect(s.payout).toBe(0);
  });
  it('rejects invalid bets', () => {
    expect(() => deal(shoe('2S'), 0)).toThrow();
    expect(() => deal(shoe('2S'), 1.5)).toThrow();
  });
});

describe('hit / stand / double', () => {
  it('stand: player 20 beats dealer 18', () => {
    // P: K,Q  D: 9,9
    let s = deal(shoe('KS', '9H', 'QS', '9D'), 100);
    expect(s.finished).toBe(false);
    s = applyAction(s, 'stand');
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(200);
  });
  it('stand: lower total loses, equal pushes', () => {
    let s = applyAction(deal(shoe('KS', 'TH', '8S', '9D'), 100), 'stand');
    expect(s.outcome).toBe('lose');
    s = applyAction(deal(shoe('KS', 'TH', '9S', '9D'), 100), 'stand');
    expect(s.outcome).toBe('push');
    expect(s.payout).toBe(100);
  });
  it('hit to bust loses immediately without dealer drawing', () => {
    // P: K,6 -> hit 9 => 25. D: 5,5
    let s = deal(shoe('KS', '5H', '6S', '5D', '9C'), 100);
    s = applyAction(s, 'hit');
    expect(s.outcome).toBe('bust');
    expect(s.payout).toBe(0);
    expect(s.dealer).toHaveLength(2);
  });
  it('hit to 21 auto-stands', () => {
    // P: 5,6 -> hit 10 => 21. D: K,7 (17)
    let s = deal(shoe('5S', 'KH', '6S', '7D', 'TC'), 100);
    s = applyAction(s, 'hit');
    expect(s.finished).toBe(true);
    expect(s.outcome).toBe('win');
  });
  it('dealer stands on 17 (including soft 17) and draws on 16', () => {
    // dealer A,6 = soft 17 -> stands; player 18 wins
    let s = applyAction(deal(shoe('TS', 'AH', '8S', '6D'), 100), 'stand');
    expect(s.dealer).toHaveLength(2);
    expect(handValue(s.dealer)).toEqual({ total: 17, soft: true });
    expect(s.outcome).toBe('win');
    // dealer 10,6 = 16 -> draws 5 => 21, beats player 20
    s = applyAction(deal(shoe('TS', 'TH', 'QS', '6D', '5C'), 100), 'stand');
    expect(s.dealer).toHaveLength(3);
    expect(handValue(s.dealer).total).toBe(21);
    expect(s.outcome).toBe('lose');
  });
  it('dealer bust pays the player', () => {
    // dealer 10,6 draws K => 26
    const s = applyAction(deal(shoe('9S', 'TH', '8S', '6D', 'KC'), 100), 'stand');
    expect(handValue(s.dealer).total).toBe(26);
    expect(s.outcome).toBe('win');
  });
  it('double: doubles stake, exactly one card, then settles', () => {
    // P: 5,6 (11) double draws 9 => 20; D: 10,8 (18)
    let s = deal(shoe('5S', 'TH', '6S', '8D', '9C'), 100);
    expect(canDouble(s)).toBe(true);
    s = applyAction(s, 'double');
    expect(s.bet).toBe(200);
    expect(s.player).toHaveLength(3);
    expect(s.finished).toBe(true);
    expect(s.outcome).toBe('win');
    expect(s.payout).toBe(400);
  });
  it('double loss returns nothing; double bust loses', () => {
    let s = applyAction(deal(shoe('5S', 'TH', '6S', '8D', '2C'), 100), 'double'); // 13 vs 18
    expect(s.outcome).toBe('lose');
    expect(s.payout).toBe(0);
    s = applyAction(deal(shoe('KS', 'TH', '6S', '8D', 'KC'), 100), 'double'); // 26
    expect(s.outcome).toBe('bust');
  });
  it('double is not allowed after a hit or after the round ends', () => {
    let s = deal(shoe('2S', 'TH', '3S', '8D', '2C', '2C'), 100);
    s = applyAction(s, 'hit');
    expect(canDouble(s)).toBe(false);
    expect(() => applyAction(s, 'double')).toThrow();
    const done = applyAction(s, 'stand');
    expect(() => applyAction(done, 'hit')).toThrow();
  });
  it('applyAction does not mutate the previous state', () => {
    const s = deal(shoe('2S', 'TH', '3S', '8D', '2C'), 100);
    const before: BlackjackState = JSON.parse(JSON.stringify(s));
    applyAction(s, 'hit');
    expect(JSON.parse(JSON.stringify(s))).toEqual(before);
  });
});

describe('replay from seeds', () => {
  it('full-round replay equals a manual play with the same actions', () => {
    // find a seed where the round continues, then play stand
    for (let nonce = 0; nonce < 50; nonce++) {
      const seeds = { serverSeed: 'a'.repeat(64), clientSeed: 'bj', nonce };
      const s = deal(shuffledShoe(seeds), 100);
      if (s.finished) continue;
      const manual = summarize(applyAction(s, 'stand'));
      expect(replayBlackjack(seeds, { bet: 100, actions: ['stand'] })).toEqual(manual);
      return;
    }
    throw new Error('no playable round found');
  });
});

describe('statistical sanity: dealer-mimic player', () => {
  it('RTP is below 100% and in a plausible range; naturals ~4.7%', () => {
    const N = 10000;
    let bet = 0;
    let ret = 0;
    let naturals = 0;
    for (let nonce = 0; nonce < N; nonce++) {
      const seeds = { serverSeed: 'f'.repeat(64), clientSeed: 'stat', nonce };
      let s = deal(createStream(seeds).shuffle(buildShoe()), 100);
      while (!s.finished) s = applyAction(s, handValue(s.player).total < 17 ? 'hit' : 'stand');
      bet += s.bet;
      ret += s.payout;
      if (s.outcome === 'blackjack') naturals++;
    }
    const rtp = ret / bet;
    expect(rtp).toBeGreaterThan(0.88);
    expect(rtp).toBeLessThan(1.0);
    expect(naturals / N).toBeGreaterThan(0.04);
    expect(naturals / N).toBeLessThan(0.055);
  }, 60_000);
});
