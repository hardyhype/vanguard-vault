// ui.tsx — the pieces every screen shares. Icons, money, the chip vocabulary
// and the hold clock. Kept here so App and Piece can both use them without
// one importing the other.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FindStatus } from './lib/api';

/* ---------------------------------------------------------------- icons
   The family rule, carried from the capstone: one line, bronze, 1.7px
   stroke, round caps and joins, no fills. Paths lifted from the prototype. */
export const P: Record<string, string> = {
  discover: '<circle cx="11" cy="11" r="6.6"/><path d="M15.9 15.9 20.5 20.5"/>',
  vault: '<rect x="4" y="4.5" width="16" height="15" rx="2.4"/><circle cx="12" cy="12" r="3.6"/><path d="M12 8.4V6.2M12 17.8v-2.2M8.4 12H6.2M17.8 12h-2.2"/>',
  chat: '<path d="M20 12.4c0 3.8-3.6 6.9-8 6.9a9.5 9.5 0 0 1-2.5-.33L5 20.5l1.1-3.4A6.6 6.6 0 0 1 4 12.4c0-3.8 3.6-6.9 8-6.9s8 3.1 8 6.9z"/>',
  bag: '<path d="M6.5 9h11l-1 10.5h-9z"/><path d="M9.2 9V7.2a2.8 2.8 0 0 1 5.6 0V9"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  tick: '<circle cx="9.5" cy="9.5" r="8"/><path d="M6 9.8 8.6 12.4 13.4 6.8"/>',
  dash: '<circle cx="9.5" cy="9.5" r="8"/><path d="M6 9.5h7"/>',
  caret: '<path d="M4 6.5 8.5 11 13 6.5"/>',
  chevron: '<path d="M14 6l-6 6 6 6"/>',
  arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  arrowRight: '<path d="M5 12h13m-5-6 6 6-6 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>',
  person: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.8 19.6a7.2 7.2 0 0 1 14.4 0"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  link: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 13.5V19H5V6h5.5"/>',
};

export function Icon({ d, size = 22, vb = 24, tone = '' }:
                     { d: string; size?: number; vb?: number; tone?: string }) {
  return (
    <svg className={`ico ${tone}`.trim()} width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}
         aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
  );
}

// The brand mark is the deliberate exception to the line family: a crown
// inside a shield, kept solid so it survives at favicon size.
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size * (62 / 54)} viewBox="0 0 54 62" fill="none" aria-hidden="true">
      <path d="M27 3 L49 9.5 V28 C49 43 40 53.5 27 59 C14 53.5 5 43 5 28 V9.5 Z"
            stroke="#B87C4A" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M16.4 36.4 L17.6 20.6 L22 27.9 L27 18.6 L32 27.9 L36.4 20.6 L37.6 36.4 Z"
            stroke="#B87C4A" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------- helpers */
export function money(cents: number | null | undefined) {
  if (cents == null) return '';
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function when(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// No urgency without a counterparty. This renders only beside a named holder,
// and the database refuses a hold without one, so the clock is never decorative.
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(to).getTime() - now);
  if (left === 0) return <span className="countdown">expired</span>;
  const t = Math.floor(left / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="countdown">{h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>;
}

// Status is never encoded in colour alone — every chip carries a word.
// Violet is reserved for the buyer's own hand, so it does not appear here.
const CHIP: Record<FindStatus, [string, string]> = {
  found: ['quiet', 'Watching'],
  confirming: ['quiet', 'Confirming'],
  holding: ['bronze', 'On hold'],
  awaiting_approval: ['bronze', 'Needs you'],
  approved: ['green', 'Approved'],
  expired: ['quiet', 'Expired'],
  released: ['quiet', 'Released'],
};

export function Chip({ status }: { status: FindStatus }) {
  const [tone, word] = CHIP[status];
  return <span className={`chip ${tone}`}>{word}</span>;
}

// A find carries a listing image when the search gave us one. When it does
// not, the beige tile and a line icon stand in rather than a broken frame.
export function Thumb({ src, size = 42 }: { src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {show
        ? <img src={src!} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <Icon d={P.bag} size={Math.round(size * 0.5)} />}
    </span>
  );
}


// Every screen's header, so they cannot drift apart. It sits over the
// content rather than above it: the conversation scrolls behind glass and
// fades out under the brand row instead of stopping short of it.
//
// The header reports its own height into --headh, the same way the composer
// dock does, so the scrolling content reserves exactly the room it needs.
export function Header({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.parentElement?.style.setProperty('--headh', `${el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div className="headerdock" ref={ref}>{children}</div>;
}

/* The concierge is working.
   The shield is the brand mark, so it is what does the waiting: a bronze
   arc travels its outline the way a light passes over something being
   examined, and the crown inside holds steady underneath. pathLength="1"
   normalises the path so the dash values are fractions of the perimeter
   rather than numbers tied to this particular geometry — change the shield
   and the animation still runs correctly.
   The word beside it carries a slow shimmer rather than a spinner. Both
   stop dead under prefers-reduced-motion, handled in the stylesheet. */
export function Thinking() {
  return (
    <div className="thinking" role="status" aria-label="The concierge is working">
      <svg width="26" height="30" viewBox="0 0 54 62" fill="none" aria-hidden="true">
        <path d="M27 3 L49 9.5 V28 C49 43 40 53.5 27 59 C14 53.5 5 43 5 28 V9.5 Z"
              stroke="#E3D6C3" strokeWidth="2.4" strokeLinejoin="round" />
        <path className="trace"
              d="M27 3 L49 9.5 V28 C49 43 40 53.5 27 59 C14 53.5 5 43 5 28 V9.5 Z"
              pathLength={1} stroke="#B87C4A" strokeWidth="2.4"
              strokeLinejoin="round" strokeLinecap="round" />
        <path className="crown"
              d="M16.4 36.4 L17.6 20.6 L22 27.9 L27 18.6 L32 27.9 L36.4 20.6 L37.6 36.4 Z"
              stroke="#B87C4A" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <span className="shimmer">Working</span>
    </div>
  );
}
