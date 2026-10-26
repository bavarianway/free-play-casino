import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { games } from '../../engine';
import { store, useCasino } from '../store';
import { BetInput, FairStrip, Notice, PageTitle } from '../components/common';
import { CandleArt, CANDLE_LABEL } from '../components/CandleArt';
import { formatChips } from '../format';

const { clusters: cl } = games;
type Sym = games.clusters.CandleSymbol;
const STEP_MS = 800;

interface Frame {
  grid: games.clusters.Grid;
  hit: Set<number>;
  /** Position multipliers shown (free spins only). */
  mults: number[] | null;
  /** Cumulative win in hundredths of the bet. */
  running: number;
  label: string;
  freeSpin: number; // 0 in the base game
  flash?: 'bonus';
}

export function buildFrames(res: games.clusters.ClustersResult): Frame[] {
  const frames: Frame[] = [];
  let running = 0;
  const base = (grid: games.clusters.Grid, hit: Set<number>, label: string): Frame => ({ grid, hit, mults: null, running, label, freeSpin: 0 });
  res.steps.forEach((s, i) => {
    frames.push(base(s.grid, new Set(s.clusters.flatMap((c) => c.cells)), `Base spin · tumble ${i + 1}`));
    running += s.win;
  });
  frames.push(base(res.finalGrid, new Set(), res.steps.length ? 'Base spin · settled' : 'Base spin'));
  if (res.bonus) {
    const trigger = frames[frames.length - 1]!;
    trigger.flash = 'bonus';
    trigger.hit = new Set(res.finalGrid.flatMap((s, i) => (s === 'GOD' ? [i] : [])));
    trigger.label = `${res.scatters} God Candles! ${res.bonus.freeSpinsAwarded} free spins`;
    let mults = res.bonus.startMultipliers;
    res.bonus.spins.forEach((spin, n) => {
      const tag = `Free spin ${n + 1}/${res.bonus!.freeSpinsAwarded}`;
      spin.steps.forEach((s, i) => {
        frames.push({ grid: s.grid, hit: new Set(s.clusters.flatMap((c) => c.cells)), mults, running, label: `${tag} · tumble ${i + 1}`, freeSpin: n + 1 });
        running += s.win;
        mults = s.multipliers!;
      });
      frames.push({ grid: spin.finalGrid, hit: new Set(), mults, running, label: `${tag}${spin.steps.length ? ' · settled' : ''}`, freeSpin: n + 1 });
    });
  }
  frames[frames.length - 1]!.running = res.totalHundredths;
  return frames;
}

const IDLE_GRID: games.clusters.Grid = Array.from({ length: cl.CELLS }, (_, i) => cl.CANDLE_TYPES[(i * 5 + Math.floor(i / cl.COLS) * 2) % cl.CANDLE_TYPES.length]!);

function Ticker({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${values.length === 1 ? 0 : (i / (values.length - 1)) * 100},${36 - (v / max) * 32}`).join(' ');
  return (
    <svg className="ticker" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden focusable="false">
      <line x1="0" x2="100" y1="36" y2="36" stroke="#2c355a" strokeWidth="0.6" />
      {values.length > 1 && <polyline points={pts} fill="none" stroke="#22c58b" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function ClustersPage() {
  useCasino();
  const [bet, setBet] = useState(100);
  const [result, setResult] = useState<games.clusters.ClustersResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** The round is paid (and recorded) when the animation ends, is skipped, or the page is left. */
  const pending = useRef<{ seeds: ReturnType<typeof store.nextSeeds>; res: games.clusters.ClustersResult } | null>(null);
  const frames = useMemo(() => (result ? buildFrames(result) : []), [result]);

  const finish = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    store.settle(p.res.payout);
    store.record('clusters', p.seeds, { bet: p.res.bet }, cl.summarizeClusters(p.res));
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', finish); // closing the tab mid-animation still pays the round
    return () => { window.removeEventListener('pagehide', finish); window.clearTimeout(timer.current); finish(); };
  }, [finish]);
  useEffect(() => {
    if (!playing) return;
    if (frame >= frames.length - 1) { setPlaying(false); finish(); return; }
    const delay = frames[frame + 1]?.freeSpin ? STEP_MS * 0.7 : STEP_MS;
    timer.current = window.setTimeout(() => setFrame((f) => f + 1), delay);
    return () => window.clearTimeout(timer.current);
  }, [playing, frame, frames, finish]);

  const spin = () => {
    if (playing) return;
    setError(null);
    const check = store.placeBet(bet);
    if (!check.ok) return setError(check.reason);
    const seeds = store.nextSeeds();
    const res = cl.playClusters(seeds, { bet });
    pending.current = { seeds, res };
    setResult(res);
    setFrame(0);
    setPlaying(true);
  };
  const skip = () => { window.clearTimeout(timer.current); setFrame(frames.length - 1); setPlaying(false); finish(); };

  const f = frames[frame];
  const grid = f?.grid ?? IDLE_GRID;
  const done = result && !playing;
  const history = useMemo(() => frames.slice(0, frame + 1).map((x) => x.running / 100), [frames, frame]);
  const inBonus = !!f && f.freeSpin > 0;
  const shown = f ? f.running : 0;

  return (
    <>
      <PageTitle
        title="Candle Clusters"
        sub={`${cl.COLS}×${cl.ROWS} board of candlesticks · ${cl.MIN_CLUSTER}+ connected match pay · winners get rugged and new candles tumble in · God Candle free spins · simulated RTP ${(cl.DOCUMENTED_RTP * 100).toFixed(2)}%`}
      />
      <FairStrip />
      <div className={`cluster-wrap ${inBonus ? 'bonus' : ''}`}>
        <div className="cluster-grid" role="grid" aria-label="Candle board" data-testid="cluster-grid">
          {grid.map((sym: Sym, i) => {
            const m = f?.mults?.[i] ?? 1;
            return (
              <div key={i} role="gridcell" aria-label={CANDLE_LABEL[sym] + (m > 1 ? `, multiplier ${m}` : '')} data-sym={sym}
                className={`csym tier-${sym === 'GOD' ? 'god' : cl.CANDLES.find((c) => c.type === sym)!.tier} ${f?.hit.has(i) ? (sym === 'GOD' ? 'hit god-hit' : 'hit') : ''}`}>
                <CandleArt sym={sym} />
                {m > 1 && <span className={`mult m${Math.min(m, 16)}`}>×{m}</span>}
              </div>
            );
          })}
        </div>
        <div className="cluster-side">
          <div className="cluster-meter" aria-live="polite">
            <div data-testid="cluster-label">{f ? f.label : 'Ready'}</div>
            <div>Win so far <strong data-testid="cluster-running">{(shown / 100).toFixed(2)}× bet</strong></div>
            <Ticker values={history.length ? history : [0]} />
            {inBonus && result?.bonus && <div className="bonus-banner" data-testid="bonus-banner">God Candle bonus · spin {f!.freeSpin}/{result.bonus.freeSpinsAwarded}</div>}
          </div>
          {playing && <button className="btn ghost small" onClick={skip}>Skip animation</button>}
        </div>
      </div>
      {done && (
        <Notice kind={result.payout > result.bet ? 'win' : result.payout > 0 ? 'push' : 'lose'}>
          {result.payout > 0
            ? `${result.multiplier.toFixed(2)}× — returned ${formatChips(result.payout)} chips${result.bonus ? ` (${result.scatters} God Candles: ${result.freeSpinsAwarded} free spins paid ${(result.bonus.totalHundredths / 100).toFixed(2)}×)` : ''}${result.capped || result.bonus?.capped ? ' (max win reached)' : ''}`
            : `No cluster — lost ${formatChips(result.bet)} chips`}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="controls">
        <BetInput value={bet} onChange={setBet} disabled={playing} />
        <button className="btn" onClick={spin} disabled={playing}>{playing ? 'Tumbling…' : 'Spin'}</button>
      </div>
      <details className="card paytable" open>
        <summary>Paytable (value per candle × cluster size, as a multiple of your bet)</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Candle</th><th>Value each</th><th>5 pays</th><th>10 pays</th><th>20 pays</th></tr>
            </thead>
            <tbody>
              {[...cl.CANDLES].reverse().map((c) => (
                <tr key={c.type}>
                  <td><span className="legend-art"><CandleArt sym={c.type} size={26} /></span> {CANDLE_LABEL[c.type]}</td>
                  <td>{(c.value / 100).toFixed(2)}×</td>
                  {[5, 10, 20].map((n) => <td key={n}>{((c.value * n) / 100).toFixed(2)}×</td>)}
                </tr>
              ))}
              <tr>
                <td><span className="legend-art"><CandleArt sym="GOD" size={26} /></span> God Candle (scatter)</td>
                <td colSpan={4}>Not part of clusters. 3+ anywhere: {Object.entries(cl.FREE_SPINS_BY_SCATTER).map(([n, s]) => `${n}→${s}`).join(', ')} free spins</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          Rules: {cl.MIN_CLUSTER}+ identical candles connected up/down/left/right form a cluster; every cluster on the board pays, then those
          candles vanish, the rest fall and new ones drop in until nothing pays. God Candles never cluster and never vanish (at most one per column).
          Free spins cost nothing and share one multiplier grid (starting ×1/2/4/8): cleared cells double (max ×{cl.MAX_POSITION_MULTIPLIER}) and a
          cluster is multiplied by the sum of the multipliers under it. There is no retrigger. Base spin win is capped at {cl.BASE_WIN_CAP}× and a whole round
          at {formatChips(cl.BONUS_WIN_CAP)}× the bet. Simulated RTP {(cl.DOCUMENTED_RTP * 100).toFixed(2)}% including the bonus, hit rate
          {' '}{(cl.DOCUMENTED_HIT_RATE * 100).toFixed(1)}%, bonus about 1 in {Math.round(1 / cl.DOCUMENTED_BONUS_RATE)} spins. Play chips only — no cash value.
        </p>
      </details>
    </>
  );
}
