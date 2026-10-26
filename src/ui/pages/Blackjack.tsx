import { useEffect, useRef, useState } from 'react';
import { games } from '../../engine';
import type { Seeds } from '../../engine/rng';
import { store, useCasino } from '../store';
import { BetInput, FairStrip, Notice, PageTitle } from '../components/common';
import { formatChips } from '../format';

const { blackjack: bj } = games;

function CardView({ c, hidden }: { c?: games.blackjack.Card; hidden?: boolean }) {
  if (hidden || !c) return <div className="pcard back" aria-label="Hidden card" />;
  const red = c.suit === 'H' || c.suit === 'D';
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit];
  return (
    <div className={`pcard ${red ? 'red' : ''}`} aria-label={`${c.rank === 'T' ? '10' : c.rank} of ${suit}`}>
      <span>{c.rank === 'T' ? '10' : c.rank}</span><span className="suit">{suit}</span>
    </div>
  );
}

const total = (cards: games.blackjack.Card[]) => {
  const v = bj.handValue(cards);
  return v.soft && v.total <= 21 ? `${v.total} (soft)` : String(v.total);
};

const LABEL: Record<games.blackjack.BlackjackOutcome, [string, 'win' | 'lose' | 'push']> = {
  blackjack: ['Blackjack! Pays 3:2', 'win'], win: ['You win', 'win'], push: ['Push — stake returned', 'push'],
  lose: ['Dealer wins', 'lose'], bust: ['Bust', 'lose'],
};

export function BlackjackPage() {
  useCasino();
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState<{ state: games.blackjack.BlackjackState; seeds: Seeds; initialBet: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = round && !round.state.finished;

  // Leaving the page mid-hand stands on the current hand and settles it, so staked chips are never
  // silently lost and the round still lands in the verifiable history.
  const latest = useRef(round);
  latest.current = round;
  useEffect(() => () => {
    const r = latest.current;
    if (!r || r.state.finished) return;
    const state = bj.applyAction(r.state, 'stand');
    store.settle(state.payout);
    store.record('blackjack', r.seeds, { bet: r.initialBet, actions: state.actions }, bj.summarize(state));
  }, []);

  const finish = (r: NonNullable<typeof round>, state: games.blackjack.BlackjackState) => {
    store.settle(state.payout);
    store.record('blackjack', r.seeds, { bet: r.initialBet, actions: state.actions }, bj.summarize(state));
  };

  const dealHand = () => {
    setError(null);
    const check = store.placeBet(bet);
    if (!check.ok) return setError(check.reason);
    const seeds = store.nextSeeds();
    const state = bj.deal(bj.shuffledShoe(seeds), bet);
    const r = { state, seeds, initialBet: bet };
    setRound(r);
    if (state.finished) finish(r, state);
  };

  const act = (a: games.blackjack.BlackjackAction) => {
    if (!round || round.state.finished) return;
    setError(null);
    if (a === 'double') {
      if (!bj.canDouble(round.state)) return;
      const check = store.placeBet(round.state.bet);
      if (!check.ok) return setError(check.reason);
    }
    const state = bj.applyAction(round.state, a);
    const r = { ...round, state };
    setRound(r);
    if (state.finished) finish(r, state);
  };

  const s = round?.state;
  const canDbl = s ? bj.canDouble(s) : false;
  return (
    <>
      <PageTitle title="Blackjack" sub="6 decks · blackjack pays 3:2 · dealer stands on all 17s · double on any first two cards · no split / insurance" />
      <FairStrip />
      <div className="table felt">
        <div className="hand">
          <h3>Dealer {s && <small>{s.finished ? total(s.dealer) : `showing ${bj.cardValue(s.dealer[0]!)}`}</small>}</h3>
          <div className="cards">
            {s ? s.dealer.map((c, i) => <CardView key={i} c={c} hidden={!s.finished && i === 1} />) : <span className="muted">Place a bet and deal</span>}
          </div>
        </div>
        <div className="hand">
          <h3>You {s && <small>{total(s.player)}</small>}</h3>
          <div className="cards">{s?.player.map((c, i) => <CardView key={i} c={c} />)}</div>
        </div>
      </div>
      {s?.finished && s.outcome && (
        <Notice kind={LABEL[s.outcome][1]}>
          {LABEL[s.outcome][0]} — {s.payout > 0 ? `returned ${formatChips(s.payout)} chips` : `lost ${formatChips(s.bet)} chips`}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="controls">
        {live ? (
          <div className="row">
            <button className="btn" onClick={() => act('hit')}>Hit</button>
            <button className="btn" onClick={() => act('stand')}>Stand</button>
            <button className="btn ghost" disabled={!canDbl} onClick={() => act('double')}>Double</button>
          </div>
        ) : (
          <>
            <BetInput value={bet} onChange={setBet} />
            <button className="btn" onClick={dealHand}>Deal</button>
          </>
        )}
      </div>
    </>
  );
}
