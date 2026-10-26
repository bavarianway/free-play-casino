import { useState } from 'react';
import { games } from '../../engine';
import { MAX_BET } from '../../engine/wallet';
import { store, useCasino } from '../store';
import { BetInput, FairStrip, Notice, PageTitle } from '../components/common';
import { formatChips } from '../format';

const { roulette: rl } = games;
type Bet = games.roulette.RouletteBet;
type OutsideType = games.roulette.OutsideBetType;

const OUTSIDE: [OutsideType, string][] = [
  ['red', 'Red'], ['black', 'Black'], ['odd', 'Odd'], ['even', 'Even'], ['low', '1–18'], ['high', '19–36'],
  ['dozen1', '1st 12'], ['dozen2', '2nd 12'], ['dozen3', '3rd 12'], ['column1', 'Col 1'], ['column2', 'Col 2'], ['column3', 'Col 3'],
];

const label = (b: Bet) => (b.numbers ? `${b.type} ${b.numbers.join('-')}` : OUTSIDE.find(([t]) => t === b.type)?.[1] ?? b.type);

export function RoulettePage() {
  useCasino();
  const [chip, setChip] = useState(50);
  const [bets, setBets] = useState<Bet[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<games.roulette.RouletteResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const total = bets.reduce((s, b) => s + b.amount, 0);
  const insideType = selected.length ? rl.identifyInsideBet(selected) : null;

  const toggle = (n: number) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const addInside = () => {
    if (!insideType) return;
    setBets((b) => [...b, { type: insideType, numbers: [...selected].sort((a, c) => a - c), amount: chip }]);
    setSelected([]);
    setResult(null);
  };
  const addOutside = (type: OutsideType) => { setBets((b) => [...b, { type, amount: chip }]); setResult(null); };

  const spin = () => {
    setError(null);
    if (bets.length === 0) return setError('Place at least one bet.');
    const check = store.placeBet(total, { maxBet: MAX_BET });
    if (!check.ok) return setError(check.reason);
    const seeds = store.nextSeeds();
    const res = rl.playRoulette(seeds, { bets });
    store.settle(res.payout);
    store.record('roulette', seeds, { bets }, res);
    setResult(res);
    setHistory((h) => [res.pocket, ...h].slice(0, 12));
    setBets([]);
    setSelected([]);
  };

  return (
    <>
      <PageTitle title="European Roulette" sub="Single zero · 37 pockets · every bet has the same 2.70% house edge (RTP 97.30%)" />
      <FairStrip />
      {result && (
        <div className="spin-result">
          <span className={`pocket big ${result.color}`}>{result.pocket}</span>
          <Notice kind={result.payout > result.totalBet ? 'win' : result.payout === result.totalBet ? 'push' : 'lose'}>
            {result.payout > 0 ? `Returned ${formatChips(result.payout)} on ${formatChips(result.totalBet)} staked` : `Lost ${formatChips(result.totalBet)} chips`}
          </Notice>
        </div>
      )}
      {history.length > 0 && (
        <div className="history" aria-label="Recent numbers">
          {history.map((n, i) => <span key={i} className={`pocket ${rl.colorOf(n)}`}>{n}</span>)}
        </div>
      )}
      <div className="roulette-board">
        <button className={`pocket zero green ${selected.includes(0) ? 'sel' : ''}`} onClick={() => toggle(0)}>0</button>
        <div className="numbers">
          {Array.from({ length: 36 }, (_, i) => {
            // standard layout: 3 rows (top = 3,6,9...), 12 columns
            const row = Math.floor(i / 12);
            const col = i % 12;
            const n = col * 3 + (3 - row);
            return (
              <button key={n} className={`pocket ${rl.colorOf(n)} ${selected.includes(n) ? 'sel' : ''}`} onClick={() => toggle(n)}
                aria-pressed={selected.includes(n)}>{n}</button>
            );
          })}
        </div>
      </div>
      <div className="inside-actions">
        <span className="muted">
          {selected.length === 0 ? 'Tap numbers for an inside bet (straight, split, street, corner, six line).'
            : insideType ? `Selected ${selected.join(', ')} → ${insideType} (pays ${rl.ODDS[insideType]}:1)` : `Selected ${selected.join(', ')} — not a valid inside bet shape`}
        </span>
        <button className="btn small" disabled={!insideType} onClick={addInside}>Place chip on selection</button>
        <button className="btn small ghost" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
      </div>
      <div className="outside">
        {OUTSIDE.map(([t, l]) => (
          <button key={t} className="btn ghost small" onClick={() => addOutside(t)}>{l} <small>{rl.ODDS[t]}:1</small></button>
        ))}
      </div>
      <div className="controls roulette-controls">
        <BetInput label="Chip size" value={chip} onChange={setChip} />
        <div className="betlist">
          <strong>Bets: {formatChips(total)} chips</strong>
          <ul className="tight">
            {bets.map((b, i) => (
              <li key={i}>{label(b)} — {formatChips(b.amount)} <button className="link" onClick={() => setBets((x) => x.filter((_, j) => j !== i))}>remove</button></li>
            ))}
          </ul>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="row">
          <button className="btn" onClick={spin}>Spin</button>
          <button className="btn ghost" onClick={() => setBets([])} disabled={!bets.length}>Clear bets</button>
        </div>
      </div>
    </>
  );
}
