import { useState } from 'react';
import { compliance } from '../../engine';
import { evaluateSession, formatDuration, MAX_LIMIT_MINUTES, MIN_LIMIT_MINUTES } from '../../engine/responsible/session';
import { store, useCasino } from '../store';
import { useNow } from '../hooks';
import { Notice, PageTitle } from '../components/common';

export function ResponsiblePage() {
  const { settings, clock, wallet } = useCasino();
  const now = useNow();
  const status = evaluateSession(clock, settings, now);
  const [limit, setLimit] = useState(settings.limitMinutes === null ? '' : String(settings.limitMinutes));
  const [reminder, setReminder] = useState(String(settings.reminderMinutes));
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const save = () => {
    const l = limit.trim() === '' ? null : Number(limit);
    const r = Number(reminder);
    if (!(l === null || (Number.isInteger(l) && l >= MIN_LIMIT_MINUTES && l <= MAX_LIMIT_MINUTES)))
      return setMsg({ kind: 'error', text: `Limit must be a whole number from ${MIN_LIMIT_MINUTES} to ${MAX_LIMIT_MINUTES} minutes, or blank for none.` });
    if (!Number.isInteger(r) || r < 5 || r > 240) return setMsg({ kind: 'error', text: 'Reminder must be 5–240 minutes.' });
    store.setSettings({ limitMinutes: l, reminderMinutes: r });
    setMsg({ kind: 'info', text: 'Saved. Your settings are stored in this browser.' });
  };

  return (
    <>
      <PageTitle title="Responsible play" sub="Free-to-play games are entertainment. Keep it that way." />

      <section className="card">
        <h2>Your session</h2>
        <p>You've been playing for <strong>{formatDuration(status.elapsedMs)}</strong>
          {status.remainingMs !== null && <> · {formatDuration(status.remainingMs)} left of your limit</>}.
          {' '}This browser: {wallet.rounds} rounds played.</p>
        <div className="form-grid">
          <label><span>Session limit (minutes, blank = none)</span>
            <input type="number" min={MIN_LIMIT_MINUTES} max={MAX_LIMIT_MINUTES} value={limit} placeholder="No limit" onChange={(e) => setLimit(e.target.value)} /></label>
          <label><span>Time reminder every (minutes)</span>
            <input type="number" min={5} max={240} value={reminder} onChange={(e) => setReminder(e.target.value)} /></label>
        </div>
        <div className="row"><button className="btn" onClick={save}>Save settings</button>
          <button className="btn ghost" onClick={() => store.restartSession()}>Restart session timer</button></div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <p className="muted">When your limit is reached, play pauses until you choose to start a new session. This is a self-imposed tool, not a lock — it only works if you use it honestly.</p>
      </section>

      <section className="card">
        <h2>This is not real gambling</h2>
        <ul>{compliance.PLAY_CHIP_DISCLAIMERS.map((d) => <li key={d}>{d}</li>)}</ul>
        <p>Success with play chips says nothing about real-money results. Real-money gambling carries a real risk of loss; the odds in every
          licensed game favour the house.</p>
      </section>

      <section className="card">
        <h2>Warning signs worth taking seriously</h2>
        <ul>
          <li>Playing longer than you planned, or losing track of time.</li>
          <li>Feeling restless or irritable when you stop, or chasing a "streak".</li>
          <li>Thinking about gambling constantly, or hiding how much you play.</li>
          <li>Moving from play chips to real-money gambling because it "feels the same".</li>
        </ul>
      </section>

      <section className="card">
        <h2>Get help in Alberta — free &amp; confidential</h2>
        <ul className="resources">
          {compliance.HELP_RESOURCES.map((r) => (
            <li key={r.name}>
              <strong>{r.name}</strong>
              {r.phone && <> — {r.tel ? <a href={`tel:${r.tel}`}>{r.phone}</a> : r.phone}</>}
              <br /><span className="muted">{r.description}</span>{' '}
              <a href={r.url} target="_blank" rel="noopener noreferrer">Website ↗</a>
            </li>
          ))}
        </ul>
        <p className="muted">If you are in immediate danger or in crisis, call 911. Outside Alberta, look for your own province's or state's problem-gambling line.</p>
      </section>
    </>
  );
}
