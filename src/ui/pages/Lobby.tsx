import { games } from '../../engine';
import { STARTING_BALANCE, isBroke } from '../../engine/wallet';
import { useCasino } from '../store';
import { formatChips } from '../format';
import { store } from '../store';
import { useState } from 'react';

const CARDS = [
  { path: '/blackjack', icon: '🂡', name: 'Blackjack', blurb: 'Beat the dealer to 21. Blackjack pays 3:2, dealer stands on all 17s.', edge: 'Rules-based' },
  { path: '/slots', icon: '🎰', name: 'Slots', blurb: 'Three reels, one payline, a public paytable.', edge: `RTP ${(games.slots.DOCUMENTED_RTP * 100).toFixed(2)}%` },
  { path: '/clusters', icon: '🕯️', name: 'Candle Clusters', blurb: '7×7 candlestick cluster-pays slot: 5+ connected candles win and get rugged, new ones tumble in. 3+ God Candles trigger free spins.', edge: `RTP ${(games.clusters.DOCUMENTED_RTP * 100).toFixed(2)}% (simulated)` },
  { path: '/roulette', icon: '🎡', name: 'Roulette', blurb: 'European single-zero wheel. Inside and outside bets.', edge: 'RTP 97.30%' },
  { path: '/crash', icon: '🚀', name: 'Crash', blurb: 'Cash out before the rocket crashes. Cash-out = chips only.', edge: 'RTP 99.00%' },
];

export function Lobby() {
  const { wallet } = useCasino();
  const [msg, setMsg] = useState<string | null>(null);
  const topUp = store.canTopUp();
  return (
    <>
      <section className="hero">
        <h1>Play for fun. Play with fake chips.</h1>
        <p>
          Five games with <strong>provably fair</strong> results you can check yourself. Chips are free, never cost
          money and can't be cashed out — there is nothing to win except bragging rights.
        </p>
        <p className="hero-balance">Your balance: <strong>{formatChips(wallet.balance)}</strong> play chips
          {wallet.topUps > 0 && <small> · {wallet.topUps} top-up{wallet.topUps > 1 ? 's' : ''} so far</small>}</p>
        {topUp.ok ? (
          <button className="btn" onClick={() => setMsg(store.claimTopUp())}>Claim free top-up to {formatChips(STARTING_BALANCE)}</button>
        ) : isBroke(wallet) ? <p className="muted">{topUp.message}</p> : null}
        {msg && <p className="muted">{msg}</p>}
      </section>
      <section className="grid games" aria-label="Games">
        {CARDS.map((c) => (
          <a key={c.path} className="card game-card" href={`#${c.path}`}>
            <span className="game-icon" aria-hidden>{c.icon}</span>
            <h2>{c.name}</h2>
            <p>{c.blurb}</p>
            <span className="tag">{c.edge}</span>
          </a>
        ))}
      </section>
      <section className="card info">
        <h2>Fair play you can verify</h2>
        <p>Every round is generated from a server seed (shown as a hash before you play), your own client seed and a counter. When you
          rotate the seed we reveal the old one so you can recompute every result. <a href="#/fair">Open the verifier →</a></p>
        <p className="muted">Stats this browser: {wallet.rounds} rounds · {formatChips(wallet.totalWagered)} chips wagered · {formatChips(wallet.totalReturned)} returned.</p>
      </section>
    </>
  );
}
