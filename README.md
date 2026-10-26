# Free Play Casino (working title)

A **free-to-play, play-money** social casino: Blackjack, Slots, European Roulette, Crash and Candle Clusters, with
**provably fair** results you can verify in the browser.

> Free-to-play. Play chips have no cash value and cannot be purchased or redeemed. Simulated gambling does not guarantee real-money success.

There are **no deposits, withdrawals, payment processors, crypto, cash-outs or prizes** anywhere in this project, and none
should be added (see [`docs/LEGAL_NOTES.md`](docs/LEGAL_NOTES.md)). 18+ only.

## Run it

```bash
npm install
npm run dev        # local dev server (http://localhost:5173)
npm test           # Vitest suite (engine, fairness, wallet, UI store, guardrails)
npm run build      # type-check + production build into dist/
npm run sim:clusters   # Monte Carlo RTP simulation for Candle Clusters (SPINS=10000000 per process; see below for the documented 80M run)
npm run preview    # serve the built app locally
```

Nothing here deploys anything. `dist/` is a static bundle you could host later, if you decide to.

## Architecture

```
src/
  engine/            Pure TypeScript. No React, no DOM (enforced by tests/architecture.test.ts).
    rng/             HMAC-SHA256 stream, seeds, commitments, fair-state sessions, verifier, persistence
    games/           blackjack, slots, roulette, crash, clusters: pure functions of (serverSeed, clientSeed, nonce)
    wallet/          play-chip wallet: bet validation, settle, daily top-up when broke, localStorage persistence
    responsible/     session timer, reminders, optional self-imposed limit
    compliance/      exact footer text, 18+ notice, Alberta help resources
    storage.ts       StorageLike + MemoryStorage (tests) – the UI passes window.localStorage
  ui/                React. Store (useSyncExternalStore), hash router, pages, components, CSS
tests/               Vitest (node environment)
scripts/             clusters-rtp.ts (Monte Carlo RTP simulation)
docs/                BRANDING.md, LEGAL_NOTES.md
```

The UI never does game maths: it asks the engine for seeds, calls a pure game function and records the round.

## Fairness

For every round, a random byte stream is derived from three inputs:

```
block_r = HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${r}`)   // r = 0, 1, 2, ...
```

* The **server seed** is generated before play; only `SHA-256(serverSeed)` (the *commitment*) is shown.
* The **client seed** is yours and editable. The **nonce** increases by one each round (and is not reset when you change your client seed).
* **Rotating** the server seed reveals the old one (and starts a new one at nonce 0). Hash the revealed seed: it must equal the commitment you saw.
* Numbers: `nextUint32` = 4 big-endian bytes, `nextFloat` = u32 / 2^32, `nextInt(n)` uses rejection sampling (no modulo bias), and shuffles are Fisher–Yates.
* The **Verify** page recomputes every recorded round (using your inputs: blackjack actions, roulette bets, crash cash-out multiplier)
  and flags any mismatch, plus a manual verifier where you paste any seeds + nonce.

**Honest limitation:** the app is client-only, so the "server" is your own browser. The commitment scheme demonstrates and tests the
algorithm and proves results weren't altered after the fact within the app's own records; it cannot stop someone modifying the code.
A hosted version would need a real server holding the seed. Since no real value is at stake, this is acceptable for free play.

### Games, rules and odds

| Game | Rules summary | RTP / house edge |
|---|---|---|
| Blackjack | 6-deck shoe reshuffled every round; hit, stand, double (first two cards); blackjack pays **3:2** (profit rounded down); dealer peeks and **stands on all 17s**; no split / insurance / surrender | Depends on strategy; tests simulate a dealer-mimic player (RTP < 100%) |
| Slots | 3 reels × 20 stops, centre payline, public paytable | **94.35%** (exact, by enumerating all 8,000 combinations); hit rate 52.75% (includes stake-back cherry) |
| Roulette | European, single zero, straight/split/street/corner/six-line and red/black, odd/even, low/high, dozens, columns | **97.30%** on every bet (1/37 edge) |
| Crash | `crash = max(1, floor(99/(1−u)) / 100)`; cash-out multiplier ≥ 1.01 | **99.00%** (1% edge): P(crash ≥ m) = 0.99/m. About 2% of rounds end at 1.00× |
| Candle Clusters | 7×7 candlestick cluster-pays tumble slot with a God Candle free-spin bonus (see below) | **95.87%** simulated incl. bonus (80M spins, ±0.19%); hit rate 23.9% |

The crash multiplier grows as `e^(t·ln2/7000)` (doubling about every 7 s); cashing out pays `floor(bet × multiplier)` **play chips**.

### Candle Clusters (cluster-pays slot with a free-spin bonus)

Every cell of the board is a candlestick pattern (doji, hammer, shooting star, engulfing, harami, three soldiers, morning star, marubozu, spinning top),
drawn as original SVG art with an accessible label per cell. The special scatter is the **God Candle**, a huge golden candle with a very long upper wick.

**Where the rules come from (honest provenance).** Bavi asked for a slot like the *original* "Clusters" game on rugs.fun. I read rugs.fun's publicly served frontend
(its HTML, every JS chunk, its fairness page and changelog text) **only to understand the rules**. Findings:

* *Confirmed (readable in their public bundle):* the game logic runs **server-side**, not on-chain. The site publishes a client-side *verifier* that recomputes a
  round from a seed, and it contains **two rule versions**: the original ("v1") and a newer one ("v2"). v1 is a 7×7 board, 5+ orthogonally connected tiles, per-tile
  values times cluster size, tumbling, a persistent doubling position-multiplier grid in free spins, scatter-count-based free spins and win caps. v2 adds extra
  retrigger/"buy" style features and a higher RTP. They publish ~97.3% (v1) and ~97.5% (v2) for the real-money game.
* *Not on-chain:* the address `2Q6wJyzTV4sra3aKYKRqVJPmeFR6jibnPreVAJVXTYFz` that was supplied is an **empty Solana system account** (no program, no IDL, no data), and no program
  ID or IDL appears in their frontend. So nothing about rules could be read from a chain; the verifier source was the only rules source.
* *Not visible:* their server's actual seed/RNG code and any private tuning. Their numbers and RTP are theirs; nothing here claims to match them exactly.

I adopted the **original (v1) structure** and left out v2. Names, art, code, paytable numbers and the RNG plumbing are **original to this project**: no code or assets were
copied and rugs.fun branding is not used. Their real-money, crypto and wallet parts were ignored entirely; Candle Clusters is play chips only and nothing on-chain or crypto is in this app.

**Rules**

* 7 columns × 7 rows. Opening board: each cell is a weighted draw over 9 candles plus the God Candle (weight 10 of 931). **At most one God Candle per column** (a second
  one in a column is replaced by a paying candle).
* A **cluster** is 5+ identical candles connected up/down/left/right (no diagonals, no wrap-around). God Candles never cluster. A cluster pays
  `value per candle × cluster size × position multiplier` (position multiplier is 1 in the base game). All clusters on the board pay.
* Winning candles vanish ("rugged"), survivors fall straight down, new candles (never God Candles) drop in from the top: a **tumble**. Repeats until nothing pays (max 50 tumbles).
  There is no per-tumble cascade ladder in the original rules; the escalating multiplier lives in the free spins instead.
* **God Candle bonus:** 3+ God Candles anywhere on the opening board award free spins at no cost: **3 → 10, 4 → 15, 5 → 20, 6 → 25, 7 → 25**. There is **no retrigger**
  (the original has none; God Candles do not appear during free spins).
* **Free-spin multipliers:** one 7×7 position-multiplier grid is drawn at the start (×1 58%, ×2 25%, ×4 12%, ×8 5% per cell) and **persists through every tumble and every free spin**.
  Whenever candles in a cell are cleared, that cell's multiplier doubles (max ×256). A cluster is multiplied by the **sum** of the multipliers >1 under it (or 1 if none).
* **Caps:** a base spin pays at most 100× the bet; a whole round (base + bonus) at most 1,000×. Hitting the cap ends the spin / bonus there.
* Payout = `floor(bet × total)` chips, so rounding never favours the player.

**Paytable** (value per candle; × bet for a cluster = value × size, before multipliers)

| Candle | Value each | 5 | 10 | 20 |
|---|---|---|---|---|
| Marubozu (huge green body, no wicks) | 3.30× | 16.50× | 33.00× | 66.00× |
| Morning star | 1.70× | 8.50× | 17.00× | 34.00× |
| Three soldiers | 1.00× | 5.00× | 10.00× | 20.00× |
| Harami | 0.80× | 4.00× | 8.00× | 16.00× |
| Engulfing | 0.60× | 3.00× | 6.00× | 12.00× |
| Shooting star | 0.30× | 1.50× | 3.00× | 6.00× |
| Hammer | 0.24× | 1.20× | 2.40× | 4.80× |
| Spinning top | 0.18× | 0.90× | 1.80× | 3.60× |
| Doji | 0.15× | 0.75× | 1.50× | 3.00× |

Draw weights (out of 921 for paying candles; the opening board adds the God Candle at 10): Doji 150, Spinning top 148, Hammer 144, Shooting star 140, Engulfing 85, Harami 75,
Three soldiers 65, Morning star 52, Marubozu 62.

**RTP:** no closed form exists, so it is estimated by Monte Carlo (`npm run sim:clusters`, which runs the very same `spinWith` function as the app with a fast seeded PRNG).
Documented run, **80,000,000 spins** (8 processes × 10M, seeds 1001–1008): **RTP 95.87% ± 0.19%** (95% confidence), of which base game 40.31% and free spins 55.56%;
hit rate 23.93%; bonus triggers about 1 spin in 92 (1.083%); P(win ≥ 10× bet) 1.08%; 230 capped rounds in 80M. The tile values of the top two candles were scaled
down from the first draft until the simulated total sat in the 95–97% target band. Because the bonus makes variance high, the unit test only requires a 1,000,000-spin run to be within
±4 points of the documented RTP (and holds hit rate and bonus rate tight).

**Fairness / determinism:** one HMAC stream per round, never re-seeded. Draw order: opening board in row-major order (cells 0–48; one `nextInt(931)` per cell, plus one extra paying-pool draw
when a second God Candle would land in a column); each tumble: columns left to right, one paying-pool draw per emptied cell, top first; then, if bonus: 49 multiplier draws (`nextInt(100)`)
and each free spin in order (49 paying-pool draws row-major + its tumbles). Bonus spins use the same seed/nonce as the base spin. The Verify page recomputes every recorded round and compares a
compact summary (opening board, God Candle count, free-spin wins, multiplier grid, totals); the manual verifier's `clusters` game shows the opening board, God Candle count, free spins and
per-spin wins for any seeds. The UI pays and records the round when its animation finishes (or is skipped, or the page is left).

## Wallet & responsible play

* Start with 10,000 chips; bets 10–5,000. Persisted in `localStorage`; tampered data is discarded.
* Once per local day, when the balance is below the minimum bet, a **free top-up** restores 10,000 chips.
* 18+ gate on first load, persistent compliance footer, session timer, reminders (default 30 min) and an optional session limit.
* The Responsible Play page lists Alberta supports: Alberta Health Services Addiction Helpline 1-866-332-2322 (24/7), Health Link 811, 211 Alberta,
  GameSense info line and AGLC self-exclusion. **`gamblingsupport.ca` could not be verified** from the build environment, and `playsmart.ca` is Ontario's (OLG), so
  neither is included. Re-verify every number and link before release.

## Known limitations

* Closing the tab mid-round forfeits that round's stake (crash). Leaving the Blackjack page mid-hand stands on the current hand and settles it; leaving Candle Clusters (or closing its tab) mid-animation settles the round immediately.
* Rounds recorded by the retired Fruit & Gem Clusters ruleset cannot be replayed and are dropped from the history on load.
* No split or insurance in blackjack.
* Fairness is client-side only (see above).
* Branding is a placeholder – see `docs/BRANDING.md`.

## Standalone / mobile builds

- `npm run build:single` → `dist-single/free-casino.html`: one self-contained file (JS/CSS/manifest/icon inlined, no network requests, hash routing), opens from `file://`.
- `npm run build` → `dist/`: relative-path static site (`base: './'`); host it on any static HTTPS host (needed for wallet in-app browsers such as Phantom, which can't open `file://`).
- Build target is es2019/safari13 for older WebViews. SHA-256/HMAC is pure JS (`@noble/hashes`), seed entropy falls back if `crypto.getRandomValues` is missing, and storage falls back to memory if `localStorage` throws. The app never touches `window.solana`/`ethereum`.
- Temporary public URL from your own machine: `npx cloudflared tunnel --url http://localhost:8787` after `cd dist && python3 -m http.server 8787`.
