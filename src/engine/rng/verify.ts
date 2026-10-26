/**
 * Verifier: recompute any recorded round from revealed seeds and compare.
 * Pure functions; the Verify UI page is a thin wrapper over these.
 */
import { replayBlackjack, shuffledShoe, cardToString, type BlackjackParams } from '../games/blackjack';
import { crashPoint, playCrash, type CrashParams } from '../games/crash';
import { playRoulette, spinPocket, type RouletteParams } from '../games/roulette';
import { playSlots, type SlotsParams } from '../games/slots';
import { playClusters, summarizeClusters, gridCode, COLS, ROWS, type ClustersParams } from '../games/clusters';
import { verifyCommitment } from './seeds';
import { createStream, type Seeds } from './stream';

export type GameId = 'blackjack' | 'slots' | 'roulette' | 'crash' | 'clusters';
export const GAME_IDS: readonly GameId[] = ['blackjack', 'slots', 'roulette', 'crash', 'clusters'];

export type RoundParams = BlackjackParams | SlotsParams | RouletteParams | CrashParams | ClustersParams;

export interface RoundRecord {
  id: number;
  game: GameId;
  nonce: number;
  clientSeed: string;
  params: RoundParams;
  /** The result that was shown to the player. */
  result: unknown;
  at: number;
}

/** Recompute the full result of a round from seeds + the player's inputs. */
export function replayRound(game: GameId, seeds: Seeds, params: RoundParams): unknown {
  switch (game) {
    case 'blackjack': return replayBlackjack(seeds, params as BlackjackParams);
    case 'slots': return playSlots(seeds, params as SlotsParams);
    case 'roulette': return playRoulette(seeds, params as RouletteParams);
    case 'crash': return playCrash(seeds, params as CrashParams);
    case 'clusters': return summarizeClusters(playClusters(seeds, params as ClustersParams));
    default: throw new Error(`unknown game ${String(game)}`);
  }
}

/** JSON with sorted keys so equality does not depend on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

export interface RecordVerification {
  id: number;
  game: GameId;
  nonce: number;
  ok: boolean;
  expected: unknown;
  error?: string;
}

export function verifyRecord(serverSeed: string, record: RoundRecord): RecordVerification {
  try {
    const expected = replayRound(
      record.game,
      { serverSeed, clientSeed: record.clientSeed, nonce: record.nonce },
      record.params,
    );
    return {
      id: record.id,
      game: record.game,
      nonce: record.nonce,
      ok: canonicalJson(expected) === canonicalJson(record.result),
      expected,
    };
  } catch (e) {
    return { id: record.id, game: record.game, nonce: record.nonce, ok: false, expected: null, error: String(e) };
  }
}

export interface SeedSetVerification {
  commitmentOk: boolean;
  records: RecordVerification[];
  allOk: boolean;
}

/** Verify a revealed server seed against its commitment and every round played under it. */
export function verifySeedSet(
  serverSeed: string,
  commitment: string,
  records: readonly RoundRecord[],
): SeedSetVerification {
  const commitmentOk = verifyCommitment(serverSeed, commitment);
  const results = records.map((r) => verifyRecord(serverSeed, r));
  return { commitmentOk, records: results, allOk: commitmentOk && results.every((r) => r.ok) };
}

/** Seed-only outcome, for manual verification without knowing the player's actions. */
export function seedOnlyOutcome(game: GameId, seeds: Seeds): Record<string, unknown> {
  switch (game) {
    case 'roulette': return { pocket: spinPocket(seeds) };
    case 'crash': return { crashPoint: crashPoint(seeds) };
    case 'slots': {
      const r = playSlots(seeds, { bet: 1 });
      return { stops: r.stops, line: r.line };
    }
    case 'clusters': {
      const r = playClusters(seeds, { bet: 1 });
      const code = gridCode(r.initialGrid);
      const rows = Array.from({ length: ROWS }, (_, i) => code.slice(i * COLS, (i + 1) * COLS).split('').join(' '));
      return {
        openingBoard: rows,
        godCandles: r.scatters,
        freeSpins: r.freeSpinsAwarded,
        baseSteps: r.steps.length,
        freeSpinWins: r.bonus?.spins.map((s) => s.winHundredths) ?? [],
        multiplier: r.multiplier,
      };
    }
    case 'blackjack': return { firstCards: shuffledShoe(seeds).slice(0, 12).map(cardToString) };
    default: throw new Error(`unknown game ${String(game)}`);
  }
}

/** First `n` raw floats of the stream, handy for showing the derivation. */
export function rawFloats(seeds: Seeds, n = 4): number[] {
  const s = createStream(seeds);
  return Array.from({ length: n }, () => s.nextFloat());
}
