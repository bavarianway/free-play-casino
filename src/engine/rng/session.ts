/**
 * Provably-fair session state (immutable updates).
 *
 *  - A server seed is generated and only its SHA-256 *commitment* is shown.
 *  - The client seed is user-editable at any time.
 *  - The nonce increments once per round and resets to 0 on rotation.
 *  - On rotation the old server seed is revealed (moved to `revealed`) together
 *    with every round played under it so it can be verified.
 *
 * NOTE: this is a client-only app, so the "server" lives in the browser. The
 * mechanism is real, but the trust model is a demo; see README "Fairness".
 */
import { commitServerSeed, generateClientSeed, generateServerSeed, sanitizeClientSeed } from './seeds';
import type { Seeds } from './stream';
import type { RoundParams, RoundRecord, GameId } from './verify';

export const MAX_RECORDS_PER_SEED = 500;
export const MAX_REVEALED_SETS = 20;

export interface FairSession {
  serverSeed: string;
  commitment: string;
  clientSeed: string;
  nonce: number;
  records: RoundRecord[];
}
export interface RevealedSeedSet {
  serverSeed: string;
  commitment: string;
  revealedAt: number;
  roundsPlayed: number;
  records: RoundRecord[];
}
export interface FairState {
  current: FairSession;
  revealed: RevealedSeedSet[];
  nextRecordId: number;
}

export interface SeedSource {
  serverSeed?: string;
  clientSeed?: string;
}

function newSession(src: SeedSource = {}, clientSeed?: string): FairSession {
  const serverSeed = src.serverSeed ?? generateServerSeed();
  return {
    serverSeed,
    commitment: commitServerSeed(serverSeed),
    clientSeed: clientSeed ?? src.clientSeed ?? generateClientSeed(),
    nonce: 0,
    records: [],
  };
}

export function createFairState(src: SeedSource = {}): FairState {
  return { current: newSession(src), revealed: [], nextRecordId: 1 };
}

/** Seeds for the next round, plus the state with the nonce consumed. */
export function consumeNonce(state: FairState): { seeds: Seeds; state: FairState } {
  const { serverSeed, clientSeed, nonce } = state.current;
  return {
    seeds: { serverSeed, clientSeed, nonce },
    state: { ...state, current: { ...state.current, nonce: nonce + 1 } },
  };
}

export function recordRound(
  state: FairState,
  entry: { game: GameId; seeds: Seeds; params: RoundParams; result: unknown; at: number },
): FairState {
  const rec: RoundRecord = {
    id: state.nextRecordId,
    game: entry.game,
    nonce: entry.seeds.nonce,
    clientSeed: entry.seeds.clientSeed,
    params: entry.params,
    result: entry.result,
    at: entry.at,
  };
  const records = [...state.current.records, rec].slice(-MAX_RECORDS_PER_SEED);
  return { ...state, nextRecordId: state.nextRecordId + 1, current: { ...state.current, records } };
}

/** Returns null if the client seed is invalid. Nonce is unchanged. */
export function setClientSeed(state: FairState, input: string): FairState | null {
  const s = sanitizeClientSeed(input);
  if (s === null) return null;
  return { ...state, current: { ...state.current, clientSeed: s } };
}

/** Reveal the current server seed and start a fresh one (nonce resets to 0). */
export function rotateSeed(state: FairState, now: number, next: SeedSource = {}): FairState {
  const cur = state.current;
  const revealed: RevealedSeedSet = {
    serverSeed: cur.serverSeed,
    commitment: cur.commitment,
    revealedAt: now,
    roundsPlayed: cur.nonce,
    records: cur.records,
  };
  return {
    ...state,
    current: newSession(next, cur.clientSeed),
    revealed: [revealed, ...state.revealed].slice(0, MAX_REVEALED_SETS),
  };
}

/** What the UI may display about the current (unrevealed) session. */
export function publicView(state: FairState) {
  const { commitment, clientSeed, nonce } = state.current;
  return { commitment, clientSeed, nonce };
}
