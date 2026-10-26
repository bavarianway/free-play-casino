import { useEffect, useState } from 'react';
import { compliance } from '../../engine';
import { evaluateSession, formatDuration, MAX_LIMIT_MINUTES, MIN_LIMIT_MINUTES } from '../../engine/responsible/session';
import { store, useCasino } from '../store';
import { useNow } from '../hooks';
import { formatChips } from '../format';

const NAV: [string, string][] = [
  ['/', 'Lobby'], ['/blackjack', 'Blackjack'], ['/slots', 'Slots'], ['/roulette', 'Roulette'], ['/crash', 'Crash'], ['/clusters', 'Candle Clusters'],
  ['/fair', 'Fair play'], ['/responsible', 'Responsible play'],
];

export function Header({ route }: { route: string }) {
  const { wallet, settings, clock } = useCasino();
  const now = useNow();
  const [msg, setMsg] = useState<string | null>(null);
  const status = evaluateSession(clock, settings, now);
  const topUp = store.canTopUp();
  return (
    <header className="header">
      <a className="brand" href="#/"><span className="logo" aria-hidden>♠</span> Free Play Casino</a>
      <nav aria-label="Main">
        {NAV.map(([path, label]) => (
          <a key={path} href={`#${path}`} aria-current={route === path ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      <div className="wallet">
        <span className="timer" title="Time in this session">⏱ {formatDuration(status.elapsedMs)}</span>
        <span className="balance" aria-label="Play chip balance">🪙 {formatChips(wallet.balance)} <small>play chips</small></span>
        {topUp.ok && (
          <button className="btn small" onClick={() => setMsg(store.claimTopUp())}>Free top-up</button>
        )}
      </div>
      {msg && <div className="toast" role="alert" onClick={() => setMsg(null)}>{msg}</div>}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <p className="footer-text">{compliance.FOOTER_TEXT}</p>
      <p>
        18+ only · <a href="#/responsible">Responsible play &amp; help</a> · <a href="#/fair">Fair play &amp; verify</a> ·{' '}
        Alberta Addiction Helpline <a href="tel:+18663322322">1-866-332-2322</a>
      </p>
    </footer>
  );
}

export function AgeGate() {
  const { age } = useCasino();
  if (age === 'ok') return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="modal">
        {age === 'underage' ? (
          <>
            <h2 id="age-title">Sorry — this site is for adults</h2>
            <p>You must be {compliance.MIN_AGE} or older to use Free Play Casino.</p>
            <p>If gambling or gaming is causing you or someone you know stress, free support is available:
              Alberta Health Services Addiction Helpline <a href="tel:+18663322322">1-866-332-2322</a>.</p>
            <button className="btn ghost" onClick={() => store.confirmAdult()}>I selected that by mistake — I am {compliance.MIN_AGE}+</button>
          </>
        ) : (
          <>
            <h2 id="age-title">Are you {compliance.MIN_AGE} or older?</h2>
            <p>{compliance.AGE_NOTICE}</p>
            <ul className="tight">
              {compliance.PLAY_CHIP_DISCLAIMERS.map((d) => <li key={d}>{d}</li>)}
            </ul>
            <div className="row">
              <button className="btn" onClick={() => store.confirmAdult()}>Yes, I am {compliance.MIN_AGE}+</button>
              <button className="btn ghost" onClick={() => store.declineAdult()}>No</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Reminder + session-limit modals. */
export function SessionMonitor() {
  const { clock, settings, age } = useCasino();
  const now = useNow();
  const status = evaluateSession(clock, settings, now);
  const [, force] = useState(0);
  useEffect(() => { force((n) => n + 1); }, [settings.limitMinutes]);
  if (age !== 'ok') return null;
  if (status.limitReached) {
    return (
      <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="limit-title">
        <div className="modal">
          <h2 id="limit-title">Session limit reached</h2>
          <p>You set a limit of {settings.limitMinutes} minutes and you've reached it. Time for a break — stretch, drink some water, step outside.</p>
          <p className="muted">Play is paused. You can start a new session whenever you choose, or change your limit on the <a href="#/responsible">Responsible play</a> page.</p>
          <button className="btn" onClick={() => store.restartSession()}>I've taken a break — start a new session</button>
        </div>
      </div>
    );
  }
  if (status.reminderDue) {
    return (
      <div className="overlay" role="alertdialog" aria-modal="true" aria-labelledby="rem-title">
        <div className="modal">
          <h2 id="rem-title">Time check ⏱</h2>
          <p>You've been playing for <strong>{formatDuration(status.elapsedMs)}</strong>. Remember: play chips are only for fun, and it's fine to stop at any time.</p>
          <div className="row">
            <button className="btn" onClick={() => store.acknowledgeReminder()}>Keep playing</button>
            <a className="btn ghost" href="#/responsible" onClick={() => store.acknowledgeReminder()}>Set a limit</a>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export const LIMIT_BOUNDS = { min: MIN_LIMIT_MINUTES, max: MAX_LIMIT_MINUTES };
