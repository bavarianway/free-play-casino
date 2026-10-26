import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('architecture & compliance guardrails', () => {
  const engineFiles = walk('src/engine').filter((f) => f.endsWith('.ts'));
  const allSrc = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));

  it('engine has no React / DOM dependencies', () => {
    expect(engineFiles.length).toBeGreaterThan(10);
    for (const f of engineFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"]react/);
      expect(src, f).not.toMatch(/\b(window|document|navigator)\./);
      expect(src, f).not.toMatch(/\.\.\/ui|\/ui\//);
    }
  });

  it('no real-money / payment features exist in the source', () => {
    const banned = /\b(deposit|withdraw|stripe|paypal|checkout|payment|purchase|cashout-to|bitcoin|ethereum|wallet\.connect)\b/i;
    for (const f of allSrc) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return; // comments
        // allow the disclaimers that say these things do NOT exist
        if (/cannot|can't|no deposits|not |never|without/i.test(line)) return;
        expect(line, `${f}:${i + 1}`).not.toMatch(banned);
      });
    }
  });

  it('wallet module exposes no deposit/withdraw API', async () => {
    const w = await import('../src/engine/wallet');
    const names = Object.keys(w).join(' ').toLowerCase();
    expect(names).not.toMatch(/deposit|withdraw|purchase|redeem|cashout/);
  });
});
