import { describe, expect, it } from 'vitest';
import {
  MAX_BET, MIN_BET, STARTING_BALANCE, WALLET_KEY, WalletError, canClaimTopUp, claimTopUp,
  createWallet, dayKey, isBroke, loadWallet, nextLocalMidnight, parseWallet, placeBet, saveWallet, settle,
  validateBet, type WalletState,
} from '../src/engine/wallet';

import { MemoryStorage } from '../src/engine/storage';

const day1 = new Date(2026, 9, 25, 14, 0);
const day1Late = new Date(2026, 9, 25, 23, 59);
const day2 = new Date(2026, 9, 26, 0, 1);
const broke = (): WalletState => ({ ...createWallet(), balance: 0 });

describe('wallet basics', () => {
  it('starts with 10,000 play chips', () => {
    expect(createWallet().balance).toBe(10_000);
    expect(STARTING_BALANCE).toBe(10_000);
  });
  it('bet validation', () => {
    const w = createWallet();
    expect(validateBet(w, 100)).toEqual({ ok: true });
    expect(validateBet(w, MIN_BET - 1).ok).toBe(false);
    expect(validateBet(w, MAX_BET + 1).ok).toBe(false);
    expect(validateBet(w, 10.5).ok).toBe(false);
    expect(validateBet(w, NaN).ok).toBe(false);
    expect(validateBet(w, -50).ok).toBe(false);
    expect(validateBet(w, Infinity).ok).toBe(false);
    expect(validateBet({ ...w, balance: 50 }, 100).ok).toBe(false);
    expect(validateBet({ ...w, balance: 50 }, 50)).toEqual({ ok: true });
    expect(validateBet(w, 5, { minBet: 1 })).toEqual({ ok: true });
  });
  it('placeBet deducts, rejects invalid bets without changing state', () => {
    const w = createWallet();
    const w2 = placeBet(w, 500);
    expect(w2.balance).toBe(9500);
    expect(w2.totalWagered).toBe(500);
    expect(w.balance).toBe(10_000);
    expect(() => placeBet(w, 20_000)).toThrow(WalletError);
    expect(() => placeBet(w, -1)).toThrow(WalletError);
  });
  it('settle credits payout and counts the round; rejects bad payouts', () => {
    const w = settle(placeBet(createWallet(), 100), 250);
    expect(w.balance).toBe(10_150);
    expect(w.rounds).toBe(1);
    expect(w.totalReturned).toBe(250);
    expect(() => settle(w, -1)).toThrow();
    expect(() => settle(w, 1.5)).toThrow();
  });
  it('exposes no deposit/withdraw/cash-out API', async () => {
    const api = Object.keys(await import('../src/engine/wallet'));
    expect(api.filter((k) => /deposit|withdraw|cashout|redeem|purchase|buy|payment/i.test(k))).toEqual([]);
  });
});

describe('invariant: balance never negative (random walk)', () => {
  it('holds over thousands of random bets/payouts', () => {
    let w = createWallet();
    let x = 12345;
    const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 5000; i++) {
      const amount = Math.floor(rnd() * 6000) - 100;
      try {
        w = placeBet(w, amount);
        w = settle(w, rnd() < 0.5 ? 0 : amount * 2);
      } catch {
        /* rejected bet: state must be unchanged */
      }
      expect(Number.isSafeInteger(w.balance)).toBe(true);
      expect(w.balance).toBeGreaterThanOrEqual(0);
      if (isBroke(w) && rnd() < 0.3) w = claimTopUp({ ...w, lastTopUpDay: null }, day1);
    }
  });
});

describe('daily free top-up', () => {
  it('only available when broke', () => {
    const c = canClaimTopUp(createWallet(), day1);
    expect(c.ok).toBe(false);
    expect(() => claimTopUp(createWallet(), day1)).toThrow(WalletError);
    expect(isBroke({ ...createWallet(), balance: MIN_BET - 1 })).toBe(true);
    expect(isBroke({ ...createWallet(), balance: MIN_BET })).toBe(false);
  });
  it('resets to starting balance, once per local day', () => {
    let w = claimTopUp(broke(), day1);
    expect(w.balance).toBe(STARTING_BALANCE);
    expect(w.topUps).toBe(1);
    w = { ...w, balance: 3 };
    const again = canClaimTopUp(w, day1Late);
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toBe('already-claimed');
    expect(() => claimTopUp(w, day1Late)).toThrow();
    expect(claimTopUp(w, day2).balance).toBe(STARTING_BALANCE);
  });
  it('day keys and midnight', () => {
    expect(dayKey(day1)).toBe('2026-10-25');
    expect(nextLocalMidnight(day1).getDate()).toBe(26);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const st = new MemoryStorage();
    const w = settle(placeBet(createWallet(), 300), 0);
    saveWallet(st, w);
    expect(loadWallet(st)).toEqual(w);
  });
  it('defaults to a fresh wallet when empty or corrupt', () => {
    const st = new MemoryStorage();
    expect(loadWallet(st)).toEqual(createWallet());
    st.setItem(WALLET_KEY, 'garbage{');
    expect(loadWallet(st)).toEqual(createWallet());
  });
  it('rejects invalid stored values (negative, fractional, wrong type)', () => {
    const base = createWallet();
    for (const bad of [{ ...base, balance: -5 }, { ...base, balance: 1.5 }, { ...base, balance: '100' }, { ...base, lastTopUpDay: 'x' }, null, 5]) {
      expect(parseWallet(bad)).toBeNull();
    }
  });
});
