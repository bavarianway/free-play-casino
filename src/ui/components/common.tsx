import { useState, type ReactNode } from 'react';
import { MAX_BET, MIN_BET } from '../../engine/wallet';
import { useCasino } from '../store';
import { formatChips } from '../format';

export function BetInput({
  value, onChange, disabled, label = 'Bet', max = MAX_BET,
}: { value: number; onChange: (n: number) => void; disabled?: boolean; label?: string; max?: number }) {
  const { wallet } = useCasino();
  const clamp = (n: number) => Math.max(MIN_BET, Math.min(max, wallet.balance, Math.floor(n)));
  return (
    <div className="bet-input">
      <label>
        <span>{label} (chips)</span>
        <input
          type="number" inputMode="numeric" min={MIN_BET} max={max} step={10} value={value || ''}
          disabled={disabled}
          onChange={(e) => onChange(Math.floor(Number(e.target.value)) || 0)}
        />
      </label>
      <div className="quick">
        <button type="button" disabled={disabled} onClick={() => onChange(Math.max(MIN_BET, Math.floor(value / 2)))}>½</button>
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(value * 2))}>2×</button>
        <button type="button" disabled={disabled} onClick={() => onChange(MIN_BET)}>Min</button>
        <button type="button" disabled={disabled} onClick={() => onChange(clamp(max))}>Max</button>
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'win' | 'lose' | 'push' | 'info' | 'error'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role="status">{children}</div>;
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}

/** Compact "provably fair" strip shown on every game page. */
export function FairStrip() {
  const { fair } = useCasino();
  const c = fair.current;
  return (
    <div className="fair-strip">
      <span>🔒 Provably fair</span>
      <span title={c.commitment}>Commitment <code>{c.commitment.slice(0, 12)}…</code></span>
      <span>Client seed <code>{c.clientSeed.length > 14 ? `${c.clientSeed.slice(0, 14)}…` : c.clientSeed}</code></span>
      <span>Nonce <code>{c.nonce}</code></span>
      <a href="#/fair">Verify</a>
    </div>
  );
}

export function useBetState(initial = 100) {
  const [bet, setBet] = useState(initial);
  return { bet, setBet };
}

export function Chips({ n }: { n: number }) {
  return <strong className="chips">{formatChips(n)}</strong>;
}
