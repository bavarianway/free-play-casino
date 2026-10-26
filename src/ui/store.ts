/**
 * UI state store: a tiny external store (useSyncExternalStore) that wires the
 * pure engine to localStorage. All game math lives in src/engine; this file only
 * holds state and persists it.
 */
import { useSyncExternalStore } from 'react';
import {
  AGE_KEY_VALUE_OK, type CasinoState,
} from './storeTypes';
import { compliance } from '../engine';
import type { StorageLike } from '../engine/storage';
import { readJson, writeJson } from '../engine/storage';
import {
  loadWallet, saveWallet, placeBet, settle, claimTopUp, canClaimTopUp, validateBet, type BetCheck, WalletError,
} from '../engine/wallet';
import {
  consumeNonce, loadFairState, recordRound, rotateSeed, saveFairState, setClientSeed,
  type GameId, type RoundParams, type Seeds,
} from '../engine/rng';
import {
  acknowledgeReminder, loadSettings, saveSettings, startSession, validateLimitMinutes, type SessionSettings,
} from '../engine/responsible/session';

export class CasinoStore {
  private state: CasinoState;
  private listeners = new Set<() => void>();

  constructor(private storage: StorageLike, now: () => number = Date.now) {
    this.now = now;
    const age = readJson(storage, compliance.AGE_KEY);
    this.state = {
      wallet: loadWallet(storage),
      fair: loadFairState(storage),
      settings: loadSettings(storage),
      clock: startSession(now()),
      age: age === AGE_KEY_VALUE_OK ? 'ok' : age === 'underage' ? 'underage' : 'unknown',
    };
  }
  private now: () => number;

  getState = (): CasinoState => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<CasinoState>) {
    this.state = { ...this.state, ...patch };
    saveWallet(this.storage, this.state.wallet);
    saveFairState(this.storage, this.state.fair);
    this.listeners.forEach((l) => l());
  }

  // ---- age gate
  confirmAdult() {
    writeJson(this.storage, compliance.AGE_KEY, AGE_KEY_VALUE_OK);
    this.set({ age: 'ok' });
  }
  declineAdult() {
    writeJson(this.storage, compliance.AGE_KEY, 'underage');
    this.set({ age: 'underage' });
  }

  // ---- wallet
  /** Deduct a stake; returns the check result (state unchanged on failure). */
  placeBet(amount: number, limits?: { minBet?: number; maxBet?: number }): BetCheck {
    if (this.sessionBlocked()) return { ok: false, reason: 'Session limit reached. Take a break.' };
    const check = validateBet(this.state.wallet, amount, limits);
    if (!check.ok) return check;
    this.set({ wallet: placeBet(this.state.wallet, amount, limits) });
    return check;
  }
  settle(payout: number) {
    this.set({ wallet: settle(this.state.wallet, payout) });
  }
  canTopUp() {
    return canClaimTopUp(this.state.wallet, new Date(this.now()));
  }
  claimTopUp(): string | null {
    try {
      this.set({ wallet: claimTopUp(this.state.wallet, new Date(this.now())) });
      return null;
    } catch (e) {
      return e instanceof WalletError ? e.message : 'Could not claim.';
    }
  }

  // ---- fairness
  nextSeeds(): Seeds {
    const { seeds, state } = consumeNonce(this.state.fair);
    this.set({ fair: state });
    return seeds;
  }
  record(game: GameId, seeds: Seeds, params: RoundParams, result: unknown) {
    this.set({ fair: recordRound(this.state.fair, { game, seeds, params, result, at: this.now() }) });
  }
  setClientSeed(input: string): boolean {
    const next = setClientSeed(this.state.fair, input);
    if (!next) return false;
    this.set({ fair: next });
    return true;
  }
  rotateSeed() {
    this.set({ fair: rotateSeed(this.state.fair, this.now()) });
  }

  // ---- responsible play
  setSettings(s: SessionSettings): boolean {
    if (!validateLimitMinutes(s.limitMinutes)) return false;
    saveSettings(this.storage, s);
    this.set({ settings: s });
    return true;
  }
  acknowledgeReminder() {
    this.set({ clock: acknowledgeReminder(this.state.clock, this.now()) });
  }
  restartSession() {
    this.set({ clock: startSession(this.now()) });
  }
  private sessionBlocked(): boolean {
    const { limitMinutes } = this.state.settings;
    return limitMinutes !== null && this.now() - this.state.clock.startedAt >= limitMinutes * 60_000;
  }
}

function browserStorage(): StorageLike {
  try {
    const k = '__fc_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

export const store = new CasinoStore(browserStorage());

export function useCasino(): CasinoState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
