import { useEffect, useRef, useState } from 'react';
import { games } from '../../engine';
import { store, useCasino } from '../store';
import { BetInput, FairStrip, Notice, PageTitle } from '../components/common';
import { formatChips } from '../format';

const { slots } = games;
const GLYPH: Record<games.slots.SlotSymbol, string> = { SEVEN: '7️⃣', BAR: '🟫', BELL: '🔔', STAR: '⭐', CHERRY: '🍒', LEMON: '🍋' };
const ALL = Object.keys(GLYPH) as games.slots.SlotSymbol[];

export function SlotsPage() {
  useCasino();
  const [bet, setBet] = useState(100);
  const [result, setResult] = useState<games.slots.SlotsResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!spinning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 70);
    return () => window.clearInterval(id);
  }, [spinning]);

  const spin = () => {
    if (spinning) return;
    setError(null);
    const check = store.placeBet(bet);
    if (!check.ok) return setError(check.reason);
    const seeds = store.nextSeeds();
    const res = slots.playSlots(seeds, { bet });
    store.settle(res.payout);
    store.record('slots', seeds, { bet }, res);
    setSpinning(true);
    timer.current = window.setTimeout(() => { setResult(res); setSpinning(false); }, 800);
  };

  const shown = (reel: number, row: number) =>
    spinning ? ALL[(tick + reel * 2 + row * 3) % ALL.length]! : result ? result.window[reel]![row]! : ALL[(reel * 3 + row) % ALL.length]!;

  return (
    <>
      <PageTitle title="Slots" sub={`3 reels · centre line pays · documented RTP ${(slots.DOCUMENTED_RTP * 100).toFixed(2)}%`} />
      <FairStrip />
      <div className="slot-machine">
        {[0, 1, 2].map((reel) => (
          <div key={reel} className={`reel ${spinning ? 'spinning' : ''}`}>
            {[0, 1, 2].map((row) => (
              <div key={row} className={`sym ${row === 1 ? 'mid' : ''}`}>{GLYPH[shown(reel, row)]}</div>
            ))}
          </div>
        ))}
      </div>
      {result && !spinning && (
        <Notice kind={result.payout > result.bet ? 'win' : result.payout === result.bet ? 'push' : 'lose'}>
          {result.multiplier > 0
            ? `${result.multiplier}× — returned ${formatChips(result.payout)} chips`
            : `No win — lost ${formatChips(result.bet)} chips`}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="controls">
        <BetInput value={bet} onChange={setBet} disabled={spinning} />
        <button className="btn" onClick={spin} disabled={spinning}>{spinning ? 'Spinning…' : 'Spin'}</button>
      </div>
      <details className="card paytable" open>
        <summary>Paytable (multiplier of bet, stake included)</summary>
        <table>
          <tbody>
            {(Object.entries(slots.PAYTABLE_THREE) as [games.slots.SlotSymbol, number][]).map(([sym, m]) => (
              <tr key={sym}><td>{GLYPH[sym]} {GLYPH[sym]} {GLYPH[sym]}</td><td>{m}×</td></tr>
            ))}
            <tr><td>Exactly two 🍒 (any position)</td><td>{slots.CHERRY_PAIR_PAYS}×</td></tr>
            <tr><td>Exactly one 🍒</td><td>{slots.CHERRY_SINGLE_PAYS}× (stake back)</td></tr>
          </tbody>
        </table>
        <p className="muted">Each reel has {slots.REEL_STRIP.length} equally likely stops. RTP {(slots.DOCUMENTED_RTP * 100).toFixed(2)}% (computed exactly over all {slots.REEL_STRIP.length ** 3} combinations), hit rate {(slots.DOCUMENTED_HIT_RATE * 100).toFixed(2)}%.</p>
      </details>
    </>
  );
}
