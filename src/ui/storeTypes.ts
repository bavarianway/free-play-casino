import type { FairState } from '../engine/rng';
import type { SessionClock, SessionSettings } from '../engine/responsible/session';
import type { WalletState } from '../engine/wallet';

export const AGE_KEY_VALUE_OK = 'adult-18+';

export interface CasinoState {
  wallet: WalletState;
  fair: FairState;
  settings: SessionSettings;
  clock: SessionClock;
  age: 'unknown' | 'ok' | 'underage';
}
