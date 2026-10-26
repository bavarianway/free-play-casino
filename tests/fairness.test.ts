import { describe, expect, it } from 'vitest';
import {
  FAIR_KEY, canonicalJson, commitServerSeed, consumeNonce, createFairState, loadFairState,
  publicView, recordRound, replayRound, rotateSeed, saveFairState, seedOnlyOutcome, setClientSeed,
  verifyRecord, verifySeedSet, type GameId, type FairState, type RoundParams,
} from '../src/engine/rng';
import { MemoryStorage } from '../src/engine/storage';
import { playSlots } from '../src/engine/games/slots';
import { playRoulette } from '../src/engine/games/roulette';
import { playCrash } from '../src/engine/games/crash';
import { deal, replayBlackjack, shuffledShoe } from '../src/engine/games/blackjack';

const SEED = 'c'.repeat(64);

function play(state: FairState, game: GameId, params: RoundParams): FairState {
  const { seeds, state: s1 } = consumeNonce(state);
  if (game === 'blackjack') {
    const bet = (params as { bet: number }).bet;
    params = { bet, actions: deal(shuffledShoe(seeds), bet).finished ? [] : ['stand'] };
  }
  return recordRound(s1, { game, seeds, params, result: replayRound(game, seeds, params), at: 1 });
}

describe('fair session', () => {
  it('shows a commitment before play and hides the seed in the public view', () => {
    const s = createFairState({ serverSeed: SEED, clientSeed: 'abc' });
    expect(s.current.commitment).toBe(commitServerSeed(SEED));
    const v = publicView(s);
    expect(JSON.stringify(v)).not.toContain(SEED);
    expect(v).toEqual({ commitment: commitServerSeed(SEED), clientSeed: 'abc', nonce: 0 });
  });
  it('nonce increments per round; client seed editable without resetting nonce', () => {
    let s = createFairState({ serverSeed: SEED, clientSeed: 'abc' });
    s = play(s, 'slots', { bet: 10 });
    s = play(s, 'slots', { bet: 10 });
    expect(s.current.nonce).toBe(2);
    s = setClientSeed(s, 'new-seed')!;
    expect(s.current.nonce).toBe(2);
    expect(s.current.records.map((r) => r.nonce)).toEqual([0, 1]);
    expect(setClientSeed(s, '')).toBeNull();
  });
  it('rotation reveals the old seed, resets nonce, new commitment differs', () => {
    let s = createFairState({ serverSeed: SEED, clientSeed: 'abc' });
    s = play(s, 'roulette', { bets: [{ type: 'red', amount: 10 }] });
    const rotated = rotateSeed(s, 123, { serverSeed: 'd'.repeat(64) });
    expect(rotated.revealed).toHaveLength(1);
    expect(rotated.revealed[0]!.serverSeed).toBe(SEED);
    expect(rotated.revealed[0]!.commitment).toBe(commitServerSeed(SEED));
    expect(rotated.revealed[0]!.records).toHaveLength(1);
    expect(rotated.current.nonce).toBe(0);
    expect(rotated.current.commitment).not.toBe(s.current.commitment);
    expect(rotated.current.clientSeed).toBe('abc');
  });
});

describe('verifier', () => {
  const crashParams = { bet: 100, cashOutAt: 1.5 };
  it('recomputes every game from revealed seeds', () => {
    let s = createFairState({ serverSeed: SEED, clientSeed: 'verify-me' });
    s = play(s, 'slots', { bet: 25 });
    s = play(s, 'roulette', { bets: [{ type: 'straight', numbers: [17], amount: 5 }, { type: 'odd', amount: 20 }] });
    s = play(s, 'crash', crashParams);
    s = play(s, 'blackjack', { bet: 50, actions: ['stand'] });
    const r = rotateSeed(s, 5).revealed[0]!;
    const v = verifySeedSet(r.serverSeed, r.commitment, r.records);
    expect(v.commitmentOk).toBe(true);
    expect(v.records.every((x) => x.ok)).toBe(true);
    expect(v.allOk).toBe(true);
  });
  it('detects a tampered result', () => {
    let s = createFairState({ serverSeed: SEED, clientSeed: 'verify-me' });
    s = play(s, 'slots', { bet: 25 });
    const rec = s.current.records[0]!;
    const forged = { ...rec, result: { ...(rec.result as object), payout: 999999 } };
    expect(verifyRecord(SEED, forged).ok).toBe(false);
    expect(verifyRecord(SEED, rec).ok).toBe(true);
  });
  it('rejects a wrong server seed or wrong commitment', () => {
    let s = createFairState({ serverSeed: SEED, clientSeed: 'x' });
    s = play(s, 'slots', { bet: 25 });
    const rec = s.current.records[0]!;
    expect(verifyRecord('e'.repeat(64), rec).ok).toBe(false);
    expect(verifySeedSet(SEED, commitServerSeed('e'.repeat(64)), [rec]).commitmentOk).toBe(false);
  });
  it('is independent of key order (canonical JSON)', () => {
    expect(canonicalJson({ a: 1, b: { d: 1, c: 2 } })).toBe(canonicalJson({ b: { c: 2, d: 1 }, a: 1 }));
  });
  it('game modules are deterministic from (serverSeed, clientSeed, nonce)', () => {
    const seeds = { serverSeed: SEED, clientSeed: 'det', nonce: 3 };
    expect(playSlots(seeds, { bet: 10 })).toEqual(playSlots(seeds, { bet: 10 }));
    expect(playRoulette(seeds, { bets: [{ type: 'red', amount: 1 }] })).toEqual(
      playRoulette(seeds, { bets: [{ type: 'red', amount: 1 }] }),
    );
    expect(playCrash(seeds, crashParams)).toEqual(playCrash(seeds, crashParams));
    expect(replayBlackjack(seeds, { bet: 10, actions: ['stand'] })).toEqual(
      replayBlackjack(seeds, { bet: 10, actions: ['stand'] }),
    );
    for (const g of ['slots', 'roulette', 'crash', 'blackjack', 'clusters'] as const) {
      expect(seedOnlyOutcome(g, seeds)).toEqual(seedOnlyOutcome(g, seeds));
      expect(seedOnlyOutcome(g, seeds)).not.toEqual(seedOnlyOutcome(g, { ...seeds, nonce: 4 }));
    }
  });
});

describe('persistence', () => {
  it('round-trips and rejects tampered state', () => {
    const st = new MemoryStorage();
    let s = createFairState({ serverSeed: SEED, clientSeed: 'p' });
    s = play(s, 'slots', { bet: 10 });
    saveFairState(st, s);
    expect(loadFairState(st)).toEqual(s);
    const bad = JSON.parse(st.getItem(FAIR_KEY)!);
    bad.current.commitment = 'f'.repeat(64);
    st.setItem(FAIR_KEY, JSON.stringify(bad));
    const fresh = loadFairState(st);
    expect(fresh.current.serverSeed).not.toBe(SEED);
    st.setItem(FAIR_KEY, '{not json');
    expect(loadFairState(st).current.nonce).toBe(0);
  });
});
