/**
 * Monte Carlo RTP simulation for Candle Clusters (base game + free-spin bonus).
 *   npm run sim:clusters                      # 2,000,000 spins, fixed seed
 *   SPINS=5000000 SEED=7 npm run sim:clusters
 *   JSON=1 ...                                # one-line JSON sums, to merge several parallel runs
 * Uses a fast seeded PRNG (mulberry32) as the integer source. The game logic is the very same
 * `spinWith` the app uses; only the randomness source differs, which is irrelevant to the maths.
 */
import { spinWith, BASE_WIN_CAP, BONUS_WIN_CAP, type IntSource } from '../src/engine/games/clusters';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimSums {
  spins: number; sum: number; sumSq: number; baseSum: number; bonusSum: number;
  hits: number; bonuses: number; big: number; max: number; capped: number; steps: number;
}
export interface SimStats {
  spins: number; rtp: number; stderr: number; baseRtp: number; bonusRtp: number; hitRate: number;
  bonusRate: number; bigWinRate: number; maxMultiplier: number; cappedCount: number; avgSteps: number;
}

export function simulateSums(spins: number, seed: number): SimSums {
  const rnd = mulberry32(seed);
  const rng: IntSource = { nextInt: (n) => Math.floor(rnd() * n) };
  const s: SimSums = { spins, sum: 0, sumSq: 0, baseSum: 0, bonusSum: 0, hits: 0, bonuses: 0, big: 0, max: 0, capped: 0, steps: 0 };
  for (let i = 0; i < spins; i++) {
    const r = spinWith(rng, 1);
    const m = r.totalHundredths / 100;
    s.sum += m; s.sumSq += m * m; s.baseSum += r.baseHundredths / 100; s.bonusSum += (r.totalHundredths - r.baseHundredths) / 100;
    s.steps += r.steps.length;
    if (m > 0) s.hits++;
    if (r.bonus) s.bonuses++;
    if (m >= 10) s.big++;
    if (m > s.max) s.max = m;
    if (r.capped || r.bonus?.capped) s.capped++;
  }
  return s;
}

export function toStats(s: SimSums): SimStats {
  const mean = s.sum / s.spins;
  const variance = s.sumSq / s.spins - mean * mean;
  return {
    spins: s.spins, rtp: mean, stderr: Math.sqrt(variance / s.spins), baseRtp: s.baseSum / s.spins, bonusRtp: s.bonusSum / s.spins,
    hitRate: s.hits / s.spins, bonusRate: s.bonuses / s.spins, bigWinRate: s.big / s.spins,
    maxMultiplier: s.max, cappedCount: s.capped, avgSteps: s.steps / s.spins,
  };
}

export function simulate(spins: number, seed: number): SimStats {
  return toStats(simulateSums(spins, seed));
}

export function mergeSums(parts: SimSums[]): SimSums {
  return parts.reduce((a, b) => ({
    spins: a.spins + b.spins, sum: a.sum + b.sum, sumSq: a.sumSq + b.sumSq, baseSum: a.baseSum + b.baseSum,
    bonusSum: a.bonusSum + b.bonusSum, hits: a.hits + b.hits, bonuses: a.bonuses + b.bonuses, big: a.big + b.big,
    max: Math.max(a.max, b.max), capped: a.capped + b.capped, steps: a.steps + b.steps,
  }));
}

export function printStats(s: SimStats): void {
  console.log(`spins            ${s.spins.toLocaleString()}`);
  console.log(`RTP total        ${(s.rtp * 100).toFixed(3)}%  (± ${(1.96 * s.stderr * 100).toFixed(3)}% at 95% confidence)`);
  console.log(`  base game      ${(s.baseRtp * 100).toFixed(3)}%`);
  console.log(`  free spins     ${(s.bonusRtp * 100).toFixed(3)}%`);
  console.log(`hit rate         ${(s.hitRate * 100).toFixed(2)}%`);
  console.log(`bonus rate       ${(s.bonusRate * 100).toFixed(3)}%  (1 in ${(1 / s.bonusRate).toFixed(0)})`);
  console.log(`>=10x rate       ${(s.bigWinRate * 100).toFixed(3)}%`);
  console.log(`max multiplier   ${s.maxMultiplier}x (caps: base ${BASE_WIN_CAP}x, bonus ${BONUS_WIN_CAP}x; capped rounds: ${s.cappedCount})`);
  console.log(`avg base steps   ${s.avgSteps.toFixed(3)}`);
}

if (process.argv[1]?.endsWith('clusters-rtp.ts')) {
  const spins = Number(process.env.SPINS ?? 2_000_000);
  const seed = Number(process.env.SEED ?? 12345);
  const sums = simulateSums(spins, seed);
  if (process.env.JSON) console.log(JSON.stringify(sums));
  else printStats(toStats(sums));
}
