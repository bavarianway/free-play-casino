import { readJson, writeJson, type StorageLike } from '../storage';
import { createWallet, type WalletState } from './wallet';

export const WALLET_KEY = 'freecasino.wallet.v1';

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Parse untrusted JSON into a valid wallet, or null (tampered/corrupt data is discarded, never trusted blindly). */
export function parseWallet(raw: unknown): WalletState | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (!isCount(w.balance) || !isCount(w.totalWagered) || !isCount(w.totalReturned) || !isCount(w.rounds) || !isCount(w.topUps)) return null;
  if (w.lastTopUpDay !== null && (typeof w.lastTopUpDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.lastTopUpDay))) return null;
  return {
    balance: w.balance,
    lastTopUpDay: w.lastTopUpDay as string | null,
    totalWagered: w.totalWagered,
    totalReturned: w.totalReturned,
    rounds: w.rounds,
    topUps: w.topUps,
  };
}

export function loadWallet(storage: StorageLike): WalletState {
  return parseWallet(readJson(storage, WALLET_KEY)) ?? createWallet();
}

export function saveWallet(storage: StorageLike, wallet: WalletState): void {
  writeJson(storage, WALLET_KEY, wallet);
}
