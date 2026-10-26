import { useCallback, useEffect, useRef, useState } from 'react';
import { games } from '../../engine';
import type { Seeds } from '../../engine/rng';
import { store, useCasino } from '../store';
import { BetInput, FairStrip, Notice, PageTitle } from '../components/common';
import { formatChips } from '../format';

const { crash } = games;

type Phase = 'idle' | 'running' | 'crashed' | 'cashed';

export function CrashPage() {
  useCasino();
  const [bet, setBet] = useState(100);
  const [auto, setAuto] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [mult, setMult] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<games.crash.CrashResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const round = useRef<{ seeds: Seeds; point: number; start: number; bet: number; target: number | null } | null>(null);
  const raf = useRef(0);

  const end = useCallback((cashOutAt: number | null) => {
    const r = round.current;
    if (!r) return;
    round.current = null;
    cancelAnimationFrame(raf.current);
    const res = crash.settleCrash(r.bet, cashOutAt, r.point);
    store.settle(res.payout);
    store.record('crash', r.seeds, { bet: r.bet, cashOutAt }, res);
    setLast(res);
    setHistory((h) => [r.point, ...h].slice(0, 12));
    setMult(res.cashedOut ? cashOutAt! : r.point);
    setPhase(res.cashedOut ? 'cashed' : 'crashed');
  }, []);

  const loop = useCallback(() => {
    const r = round.current;
    if (!r) return;
    const m = crash.multiplierAtTime(performance.now() - r.start);
    if (r.target !== null && r.target <= r.point && m >= r.target) return end(r.target);
    if (m > r.point) return end(null);
    setMult(m);
    raf.current = requestAnimationFrame(loop);
  }, [end]);

  // Never leave a round hanging if the page is closed/navigated: settle as a bust (stake already deducted).
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    if (round.current) end(null);
  }, [end]);

  const start = () => {
    setError(null);
    let target: number | null = null;
    if (auto.trim() !== '') {
      target = Math.round(Number(auto) * 100) / 100;
      if (!Number.isFinite(target) || !crash.isValidCashOut(target)) return setError(`Auto cash-out must be ${crash.CRASH_MIN_CASHOUT} or higher.`);
    }
    const check = store.placeBet(bet);
    if (!check.ok) return setError(check.reason);
    const seeds = store.nextSeeds();
    round.current = { seeds, point: crash.crashPoint(seeds), start: performance.now(), bet, target };
    setLast(null);
    setMult(1);
    setPhase('running');
    raf.current = requestAnimationFrame(loop);
  };

  const cashOut = () => {
    const r = round.current;
    if (!r) return;
    const m = crash.multiplierAtTime(performance.now() - r.start);
    if (m > r.point || !crash.isValidCashOut(m)) return m > r.point ? end(null) : undefined;
    end(m);
  };

  const running = phase === 'running';
  return (
    <>
      <PageTitle title="Crash" sub="A multiplier climbs until it crashes. Cash out before it does — you receive play chips only. House edge 1% (RTP 99%)." />
      <FairStrip />
      <div className={`crash-screen ${phase}`}>
        <div className="mult" aria-live="off">{mult.toFixed(2)}×</div>
        <div className="crash-sub">
          {phase === 'idle' && 'Ready'}
          {running && 'Climbing…'}
          {phase === 'crashed' && `💥 Crashed at ${last?.crashPoint.toFixed(2)}×`}
          {phase === 'cashed' && `✅ Cashed out at ${mult.toFixed(2)}×`}
        </div>
      </div>
      {last && (
        <Notice kind={last.cashedOut ? 'win' : 'lose'}>
          {last.cashedOut ? `Returned ${formatChips(last.payout)} chips (crash point was ${last.crashPoint.toFixed(2)}×)` : `Lost ${formatChips(last.bet)} chips`}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="controls crash-controls">
        <BetInput value={bet} onChange={setBet} disabled={running} />
        <label className="auto">
          <span>Auto cash-out at (optional)</span>
          <input type="number" min={1.01} step={0.1} placeholder="e.g. 2.00" value={auto} disabled={running} onChange={(e) => setAuto(e.target.value)} />
        </label>
        {running ? (
          <button className="btn cash" onClick={cashOut} disabled={mult < crash.CRASH_MIN_CASHOUT}>Cash out ({formatChips(Math.floor((round.current?.bet ?? bet) * mult))})</button>
        ) : (
          <button className="btn" onClick={start}>Start round</button>
        )}
      </div>
      {history.length > 0 && (
        <div className="history" aria-label="Recent crash points">
          {history.map((p, i) => <span key={i} className={`pill ${p >= 2 ? 'hi' : 'lo'}`}>{p.toFixed(2)}×</span>)}
        </div>
      )}
      <p className="muted small-print">Leaving the page during a round counts as a bust. The multiplier grows exponentially (doubling about every 7 seconds). Hidden-tab browsers may pause animation; elapsed time still counts.</p>
    </>
  );
}
