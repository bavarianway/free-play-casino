import type { games } from '../../engine';

type Sym = games.clusters.CandleSymbol;

interface Bar { x: number; w: number; wt: number; bt: number; bb: number; wb: number; c: string }

const G = '#22c58b';
const R = '#ee4d63';
const GREY = '#d4daf0';
const AMBER = '#f0b44c';
const GOLD = '#ffd45a';

/** Original candle-pattern art: each symbol is 1-3 candles drawn in a 40x40 box. */
const BARS: Record<Sym, Bar[]> = {
  DOJI: [{ x: 20, w: 9, wt: 4, bt: 19, bb: 21, wb: 36, c: GREY }],
  SPINNING_TOP: [{ x: 20, w: 9, wt: 9, bt: 16, bb: 24, wb: 31, c: AMBER }],
  HAMMER: [{ x: 20, w: 11, wt: 5, bt: 6, bb: 15, wb: 35, c: G }],
  SHOOTING_STAR: [{ x: 20, w: 11, wt: 4, bt: 24, bb: 34, wb: 35, c: R }],
  ENGULFING: [
    { x: 11, w: 8, wt: 14, bt: 17, bb: 25, wb: 28, c: G },
    { x: 28, w: 14, wt: 5, bt: 8, bb: 32, wb: 35, c: R },
  ],
  HARAMI: [
    { x: 12, w: 13, wt: 4, bt: 7, bb: 33, wb: 36, c: R },
    { x: 30, w: 8, wt: 15, bt: 17, bb: 26, wb: 29, c: G },
  ],
  THREE_SOLDIERS: [
    { x: 8, w: 8, wt: 22, bt: 24, bb: 34, wb: 36, c: G },
    { x: 20, w: 8, wt: 14, bt: 16, bb: 28, wb: 30, c: G },
    { x: 32, w: 8, wt: 4, bt: 7, bb: 21, wb: 23, c: G },
  ],
  MORNING_STAR: [
    { x: 8, w: 9, wt: 4, bt: 6, bb: 27, wb: 29, c: R },
    { x: 20, w: 7, wt: 28, bt: 30, bb: 34, wb: 36, c: GREY },
    { x: 32, w: 9, wt: 8, bt: 10, bb: 31, wb: 33, c: G },
  ],
  MARUBOZU: [{ x: 20, w: 18, wt: 5, bt: 5, bb: 35, wb: 35, c: G }],
  GOD: [{ x: 20, w: 14, wt: 0, bt: 17, bb: 38, wb: 39, c: GOLD }],
};

export const CANDLE_LABEL: Record<Sym, string> = {
  DOJI: 'Doji',
  SPINNING_TOP: 'Spinning top',
  HAMMER: 'Hammer',
  SHOOTING_STAR: 'Shooting star',
  ENGULFING: 'Engulfing',
  HARAMI: 'Harami',
  THREE_SOLDIERS: 'Three soldiers',
  MORNING_STAR: 'Morning star',
  MARUBOZU: 'Marubozu',
  GOD: 'God Candle',
};

export function CandleArt({ sym, size }: { sym: Sym; size?: number }) {
  const bars = BARS[sym];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden focusable="false" className={`candle candle-${sym.toLowerCase()}`}>
      {sym === 'GOD' && (
        <>
          <defs>
            <linearGradient id="godgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff6c2" />
              <stop offset="0.5" stopColor={GOLD} />
              <stop offset="1" stopColor="#25c98a" />
            </linearGradient>
          </defs>
          <circle cx="20" cy="26" r="15" fill="#ffd45a" opacity="0.18" />
        </>
      )}
      {bars.map((b, i) => (
        <g key={i}>
          <line x1={b.x} x2={b.x} y1={b.wt} y2={b.wb} stroke={b.c} strokeWidth={sym === 'GOD' ? 2.4 : 2} strokeLinecap="round" />
          <rect
            x={b.x - b.w / 2} y={b.bt} width={b.w} height={Math.max(2, b.bb - b.bt)} rx="1.5"
            fill={sym === 'GOD' ? 'url(#godgrad)' : b.c}
            stroke={sym === 'MARUBOZU' || sym === 'GOD' ? '#fff3b0' : 'none'} strokeWidth="1.4"
          />
        </g>
      ))}
      {sym === 'GOD' && <path d="M20 0.5 l1.6 3.3 3.6.5-2.6 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.6-2.5 3.6-.5z" fill="#fff6c2" />}
    </svg>
  );
}
