import { describe, expect, it } from 'vitest';
import { CasinoStore } from '../src/ui/store';
import { MemoryStorage } from '../src/engine/storage';
import { STARTING_BALANCE } from '../src/engine/wallet';

describe('UI store (engine wiring + persistence)', () => {
  it('starts with 10,000 chips, unknown age, and persists bets across reloads', () => {
    const storage = new MemoryStorage();
    const s = new CasinoStore(storage, () => 1_000);
    expect(s.getState().wallet.balance).toBe(STARTING_BALANCE);
    expect(s.getState().age).toBe('unknown');
    expect(s.placeBet(100).ok).toBe(true);
    const s2 = new CasinoStore(storage, () => 2_000);
    expect(s2.getState().wallet.balance).toBe(STARTING_BALANCE - 100);
  });

  it('remembers the age answer, including a decline', () => {
    const storage = new MemoryStorage();
    new CasinoStore(storage).declineAdult();
    expect(new CasinoStore(storage).getState().age).toBe('underage');
    const s = new CasinoStore(new MemoryStorage());
    s.confirmAdult();
    expect(s.getState().age).toBe('ok');
  });

  it('rejects invalid bets without changing state', () => {
    const s = new CasinoStore(new MemoryStorage());
    const before = s.getState().wallet;
    expect(s.placeBet(-5).ok).toBe(false);
    expect(s.placeBet(5).ok).toBe(false);
    expect(s.placeBet(10_000_000).ok).toBe(false);
    expect(s.getState().wallet).toEqual(before);
  });

  it('blocks betting once a self-imposed session limit is reached', () => {
    let t = 0;
    const s = new CasinoStore(new MemoryStorage(), () => t);
    expect(s.setSettings({ limitMinutes: 10, reminderMinutes: 30 })).toBe(true);
    expect(s.placeBet(50).ok).toBe(true);
    t = 10 * 60_000;
    const r = s.placeBet(50);
    expect(r.ok).toBe(false);
    s.restartSession();
    expect(s.placeBet(50).ok).toBe(true);
  });

  it('consumes nonces and rotating reveals the old seed', () => {
    const s = new CasinoStore(new MemoryStorage());
    const a = s.nextSeeds();
    const b = s.nextSeeds();
    expect(b.nonce).toBe(a.nonce + 1);
    s.rotateSeed();
    expect(s.getState().fair.revealed[0]!.serverSeed).toBe(a.serverSeed);
    expect(s.getState().fair.current.nonce).toBe(0);
  });

  it('top-up only when broke, once per day', () => {
    const t = new Date(2026, 0, 5, 12).getTime();
    const s = new CasinoStore(new MemoryStorage(), () => t);
    expect(s.canTopUp().ok).toBe(false);
    for (let i = 0; i < 2 && s.getState().wallet.balance >= 10; i++) { s.placeBet(5000); s.settle(0); }
    expect(s.getState().wallet.balance).toBe(0);
    expect(s.claimTopUp()).toBeNull();
    expect(s.getState().wallet.balance).toBe(STARTING_BALANCE);
  });
});
