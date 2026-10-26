import { describe, expect, it } from 'vitest';
import { playClusters } from '../src/engine/games/clusters';
import { buildFrames } from '../src/ui/pages/Clusters';

const seeds = (nonce: number) => ({ serverSeed: '3'.repeat(64), clientSeed: 'frames', nonce });

describe('Candle Clusters animation frames', () => {
  it('end on the true total, never decrease, and cover every free spin', () => {
    let bonuses = 0;
    for (let n = 0; n < 1500; n++) {
      const r = playClusters(seeds(n), { bet: 100 });
      const frames = buildFrames(r);
      expect(frames[frames.length - 1]!.running).toBe(r.totalHundredths);
      for (let i = 1; i < frames.length; i++) expect(frames[i]!.running).toBeGreaterThanOrEqual(frames[i - 1]!.running);
      if (r.bonus) {
        bonuses++;
        const spinsSeen = new Set(frames.map((f) => f.freeSpin).filter((x) => x > 0));
        expect(spinsSeen.size).toBe(r.bonus.spins.length);
        expect(frames.some((f) => f.flash === 'bonus')).toBe(true);
      }
    }
    expect(bonuses).toBeGreaterThan(0);
  });
});
