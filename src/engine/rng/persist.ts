import { readJson, writeJson, type StorageLike } from '../storage';
import { createFairState, type FairState } from './session';
import { commitServerSeed } from './seeds';
import { GAME_IDS } from './verify';

export const FAIR_KEY = 'freecasino.fair.v1';

const HEX = /^[0-9a-f]{64}$/;

function validRecord(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    Number.isSafeInteger(x.id) && Number.isSafeInteger(x.nonce) && typeof x.clientSeed === 'string' &&
    typeof x.game === 'string' && (GAME_IDS as readonly string[]).includes(x.game) &&
    !!x.params && typeof x.params === 'object' && 'result' in x &&
    // pre-"Candle Clusters" rounds used a different ruleset and cannot be replayed: drop them
    (x.game !== 'clusters' || (!!x.result && typeof x.result === 'object' && 'openingGrid' in x.result))
  );
}

export function parseFairState(raw: unknown): FairState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as FairState;
  const c = s.current;
  if (!c || typeof c.serverSeed !== 'string' || !HEX.test(c.serverSeed)) return null;
  if (typeof c.clientSeed !== 'string' || !Number.isSafeInteger(c.nonce) || c.nonce < 0) return null;
  if (c.commitment !== commitServerSeed(c.serverSeed)) return null;
  if (!Array.isArray(c.records) || !Array.isArray(s.revealed) || !Number.isSafeInteger(s.nextRecordId)) return null;
  if (!s.revealed.every((set) => set && typeof set.serverSeed === 'string' && HEX.test(set.serverSeed) && Array.isArray(set.records))) return null;
  // Keep the seeds, drop only malformed or unreplayable records.
  return {
    ...s,
    current: { ...c, records: c.records.filter(validRecord) },
    revealed: s.revealed.map((set) => ({ ...set, records: set.records.filter(validRecord) })),
  };
}

export function loadFairState(storage: StorageLike): FairState {
  return parseFairState(readJson(storage, FAIR_KEY)) ?? createFairState();
}

export function saveFairState(storage: StorageLike, state: FairState): void {
  writeJson(storage, FAIR_KEY, state);
}
