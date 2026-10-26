import { useMemo, useState } from 'react';
import {
  GAME_IDS, rawFloats, seedOnlyOutcome, sha256Hex, verifySeedSet, type GameId, type RoundRecord,
} from '../../engine/rng';
import { store, useCasino } from '../store';
import { Notice, PageTitle } from '../components/common';

function RecordRow({ serverSeed, r }: { serverSeed: string; r: RoundRecord }) {
  const v = useMemo(() => verifySeedSet(serverSeed, '', [r]).records[0]!, [serverSeed, r]);
  return (
    <tr>
      <td>#{r.nonce}</td><td>{r.game}</td>
      <td><code>{JSON.stringify(r.params)}</code></td>
      <td className={v.ok ? 'ok' : 'bad'}>{v.ok ? '✓ matches' : '✗ mismatch'}</td>
    </tr>
  );
}

export function FairPage() {
  const { fair } = useCasino();
  const cur = fair.current;
  const [seedInput, setSeedInput] = useState(cur.clientSeed);
  const [seedErr, setSeedErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  // manual verifier
  const [vServer, setVServer] = useState('');
  const [vClient, setVClient] = useState('');
  const [vNonce, setVNonce] = useState('0');
  const [vGame, setVGame] = useState<GameId>('roulette');
  const [vCommit, setVCommit] = useState('');
  const nonceNum = Number(vNonce);
  const validManual = /^[0-9a-f]{64}$/i.test(vServer) && vClient.length > 0 && Number.isInteger(nonceNum) && nonceNum >= 0;
  const manual = useMemo(() => {
    if (!validManual) return null;
    const seeds = { serverSeed: vServer.toLowerCase(), clientSeed: vClient, nonce: nonceNum };
    return { outcome: seedOnlyOutcome(vGame, seeds), floats: rawFloats(seeds, 4), hash: sha256Hex(seeds.serverSeed) };
  }, [validManual, vServer, vClient, nonceNum, vGame]);

  return (
    <>
      <PageTitle title="Fair play & verification" sub="Every outcome is derived from seeds you can check. Nothing is decided after you bet." />

      <section className="card">
        <h2>How it works</h2>
        <ol>
          <li>Before you play, a random <strong>server seed</strong> is created. Only its SHA-256 hash (the <em>commitment</em>) is shown.</li>
          <li>Each round uses <code>HMAC_SHA256(serverSeed, clientSeed:nonce:blockIndex)</code> as its random stream. The nonce increases by one every round.</li>
          <li>You can change your <strong>client seed</strong> any time. The nonce keeps counting, so you can't be tied to a "bad" combination.</li>
          <li>When you rotate the server seed, the old one is <strong>revealed</strong>. Hash it yourself — it must equal the commitment you saw — then recompute every round below.</li>
        </ol>
        <Notice kind="info">
          Honest limitation: this app runs entirely in your browser, so the "server" is also your browser. The verifier proves results follow
          the published algorithm and weren't changed after commitment; it can't protect you from someone modifying the code. There is no real money, so nothing is at stake.
        </Notice>
      </section>

      <section className="card">
        <h2>Current seeds</h2>
        <dl className="kv">
          <dt>Server seed commitment (SHA-256)</dt><dd><code className="wrap">{cur.commitment}</code></dd>
          <dt>Nonce (rounds played with this seed)</dt><dd><code>{cur.nonce}</code></dd>
        </dl>
        <form className="row wrap" onSubmit={(e) => {
          e.preventDefault();
          setSeedErr(store.setClientSeed(seedInput) ? null : 'Client seed must be 1–64 characters.');
        }}>
          <label className="grow"><span>Client seed</span>
            <input value={seedInput} maxLength={64} onChange={(e) => setSeedInput(e.target.value)} /></label>
          <button className="btn small" type="submit">Save client seed</button>
        </form>
        {seedErr && <Notice kind="error">{seedErr}</Notice>}
        <div className="row wrap">
          {!confirm ? (
            <button className="btn ghost" onClick={() => setConfirm(true)}>Rotate server seed &amp; reveal the old one</button>
          ) : (
            <>
              <span>Reveal the current server seed and start a new one (nonce resets to 0)?</span>
              <button className="btn" onClick={() => { store.rotateSeed(); setConfirm(false); }}>Yes, rotate</button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Revealed seed sets</h2>
        {fair.revealed.length === 0 && <p className="muted">None yet. Play some rounds, then rotate the server seed to reveal it.</p>}
        {fair.revealed.map((set, i) => {
          const res = verifySeedSet(set.serverSeed, set.commitment, set.records);
          return (
            <details key={set.commitment + i} className="seedset" open={i === 0}>
              <summary>
                Revealed {new Date(set.revealedAt).toLocaleString('en-CA')} · {set.roundsPlayed} rounds ·{' '}
                <span className={res.allOk ? 'ok' : 'bad'}>{res.allOk ? '✓ all verified' : '✗ problem found'}</span>
              </summary>
              <dl className="kv">
                <dt>Server seed</dt><dd><code className="wrap">{set.serverSeed}</code></dd>
                <dt>Commitment</dt><dd><code className="wrap">{set.commitment}</code></dd>
                <dt>SHA-256(seed) = commitment?</dt><dd className={res.commitmentOk ? 'ok' : 'bad'}>{res.commitmentOk ? '✓ yes' : '✗ no'}</dd>
              </dl>
              {set.records.length > 0 && (
                <div className="scroll">
                  <table className="table">
                    <thead><tr><th>Nonce</th><th>Game</th><th>Your inputs</th><th>Recomputed</th></tr></thead>
                    <tbody>{set.records.map((r) => <RecordRow key={r.id} serverSeed={set.serverSeed} r={r} />)}</tbody>
                  </table>
                </div>
              )}
            </details>
          );
        })}
      </section>

      <section className="card">
        <h2>Manual verifier</h2>
        <p className="muted">Paste a revealed server seed, a client seed and a nonce to recompute the seed-only outcome of any game (no app state used).</p>
        <div className="form-grid">
          <label><span>Server seed (64 hex)</span><input value={vServer} onChange={(e) => setVServer(e.target.value.trim())} spellCheck={false} /></label>
          <label><span>Client seed</span><input value={vClient} onChange={(e) => setVClient(e.target.value)} /></label>
          <label><span>Nonce</span><input type="number" min={0} value={vNonce} onChange={(e) => setVNonce(e.target.value)} /></label>
          <label><span>Game</span>
            <select value={vGame} onChange={(e) => setVGame(e.target.value as GameId)}>{GAME_IDS.map((g) => <option key={g}>{g}</option>)}</select></label>
          <label><span>Commitment to check (optional)</span><input value={vCommit} onChange={(e) => setVCommit(e.target.value.trim())} spellCheck={false} /></label>
        </div>
        {manual ? (
          <div className="result-box">
            <p>SHA-256(server seed) = <code className="wrap">{manual.hash}</code>
              {vCommit && <> — <strong className={manual.hash === vCommit.toLowerCase() ? 'ok' : 'bad'}>{manual.hash === vCommit.toLowerCase() ? '✓ matches commitment' : '✗ does not match'}</strong></>}</p>
            <p>First raw numbers in [0,1): <code>{manual.floats.map((f) => f.toFixed(8)).join(', ')}</code></p>
            <p>Outcome: <code className="wrap">{JSON.stringify(manual.outcome)}</code></p>
          </div>
        ) : <p className="muted">Enter a valid 64-character hex server seed, a client seed and a nonce.</p>}
      </section>
    </>
  );
}
