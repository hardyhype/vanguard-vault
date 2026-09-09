// Onboarding.tsx — the four value screens, then two setup steps.
//
// The four screens are the capstone's, one per validated insight, and the
// copy is carried over unchanged: no benefit appears here that the interview
// did not produce. They are also where the scope limit and the approval
// boundary are stated, before any data is collected.
//
// Setup asks two things and gates on neither. There is no budget question
// and no "where should I look" question — the buyer names brands they love,
// and the concierge does the searching. A skipped step is a real choice;
// the concierge can ask again in conversation.

import { useEffect, useRef, useState } from 'react';
import { saveOnboarding, ensureProfile } from './lib/api';
import type { Sizes } from './lib/api';

const SLIDES = 4;

// Marks are the capstone's own, one line, bronze, no fills.
const MarkShield = () => (
  <svg width="82" height="94" viewBox="0 0 54 62" fill="none" aria-hidden="true">
    <path d="M27 3 L49 9.5 V28 C49 43 40 53.5 27 59 C14 53.5 5 43 5 28 V9.5 Z"
          stroke="#B87C4A" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M16.4 36.4 L17.6 20.6 L22 27.9 L27 18.6 L32 27.9 L36.4 20.6 L37.6 36.4 Z"
          stroke="#B87C4A" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M17.3 31.9 H36.7" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const MarkEarly = () => (
  <svg width="66" height="66" viewBox="0 0 66 62" fill="none" aria-hidden="true">
    <path d="M20 46 A13 13 0 0 1 46 46" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M11 46 H55" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M33 12 V19.5" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M16.5 19.5 L21.8 24.8" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M49.5 19.5 L44.2 24.8" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M22 53 H44" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" strokeOpacity=".38" />
  </svg>
);

const MarkSources = () => (
  <svg width="64" height="66" viewBox="0 0 64 66" fill="none" aria-hidden="true">
    <rect x="11.5" y="9.5" width="41" height="13" rx="4" stroke="#B87C4A" strokeWidth="1.7" />
    <rect x="11.5" y="26.5" width="41" height="13" rx="4" stroke="#B87C4A" strokeWidth="1.7" />
    <rect x="11.5" y="43.5" width="41" height="13" rx="4" stroke="#B87C4A" strokeWidth="1.7" />
    <path d="M19 16 L22 19 L27 13.4" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 33 L22 36 L27 30.4" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 50 L22 53 L27 47.4" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MarkApproval = () => (
  <svg width="56" height="66" viewBox="0 0 56 62" fill="none" aria-hidden="true">
    <path d="M9 58 V28 A19 21 0 0 1 47 28 V50" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" strokeOpacity=".45" />
    <path d="M15 52 V28 A13 15 0 0 1 41 28 V56" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M21 58 V28.5 A7 8 0 0 1 35 28.5 V49" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M28 54 V27" stroke="#B87C4A" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const LABELS = [
  '1 of 4: Vanguard Vault',
  '2 of 4: Early access',
  '3 of 4: Your brands',
  '4 of 4: Your approval',
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);          // 0-3 slides, 4 brands, 5 size
  const [brands, setBrands] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sizes, setSizes] = useState<Sizes>({ shoe: '', top: '', bottom: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const liveRef = useRef<HTMLParagraphElement>(null);

  // Screen changes are announced, not just animated.
  useEffect(() => {
    if (!liveRef.current) return;
    liveRef.current.textContent =
      step < SLIDES ? LABELS[step]
      : step === 4 ? 'Setup, step 1 of 2: the brands you love'
      : 'Setup, step 2 of 2: your sizes';
  }, [step]);

  useEffect(() => { ensureProfile().catch((e) => setErr((e as Error).message)); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (step >= SLIDES) return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(SLIDES - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  function addBrand(name: string) {
    const v = name.trim();
    if (!v) return;
    // Anything at all is a valid answer. No list to choose from.
    if (!brands.some((b) => b.toLowerCase() === v.toLowerCase())) {
      setBrands((b) => [...b, v]);
    }
    setDraft('');
  }

  async function finish() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await saveOnboarding(brands, {
        shoe: sizes.shoe.trim(), top: sizes.top.trim(), bottom: sizes.bottom.trim(),
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------- setup steps */
  if (step >= SLIDES) {
    const onBrands = step === 4;
    return (
      <div className="setup">
        <p ref={liveRef} className="sr" role="status" aria-live="polite" />
        <div className="setup-head">
          <button className="back" onClick={() => setStep(step - 1)} aria-label="Back">
            <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
          <span className="t-meta">Step {onBrands ? 1 : 2} of 2</span>
        </div>

        {onBrands ? (
          <>
            <h1 className="t-display">Which brands do you <em>love?</em></h1>
            <p className="t-meta">
              Name anything — a house, a boutique, a maker, a shop down the street.
              Your concierge searches these and nothing else, and no one can pay to be
              added to your list. You can change them any time.
            </p>
            {brands.length > 0 && (
              <div className="brandlist">
                {brands.map((b) => (
                  <span key={b} className="brandchip">
                    {b}
                    <button onClick={() => setBrands(brands.filter((x) => x !== b))}
                            aria-label={`Remove ${b}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="composer">
              <input placeholder="Add a brand" value={draft}
                     onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(draft); } }} />
              <button className="send" onClick={() => addBrand(draft)}
                      disabled={!draft.trim()} aria-label="Add brand">
                <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="t-display">And your <em>sizes?</em></h1>
            <p className="t-meta">
              However you say them — 10.5, M, W32 L34. They go into your brief in your
              own words, so the concierge asks the store for the right thing. Fill in
              only the ones you want watched.
            </p>
            <div className="sizefields">
              {([
                ['shoe', 'Shoe', 'e.g. 10.5'],
                ['top', 'Tops', 'e.g. M, or 42'],
                ['bottom', 'Bottoms', 'e.g. 32, or W32 L34'],
              ] as [keyof Sizes, string, string][]).map(([key, label, hint], i) => (
                <label key={key} className="sizefield">
                  <span>{label}</span>
                  <input placeholder={hint} value={sizes[key]} autoFocus={i === 0}
                         onChange={(e) => setSizes({ ...sizes, [key]: e.target.value })}
                         onKeyDown={(e) => e.key === 'Enter' && finish()} />
                </label>
              ))}
            </div>
          </>
        )}

        {err && <p className="t-meta" style={{ color: '#8E5A31' }}>{err}</p>}

        <div className="setup-foot">
          {onBrands ? (
            <button className="btn block" onClick={() => setStep(5)} disabled={busy}>
              Continue
            </button>
          ) : (
            <button className="btn block" onClick={finish} disabled={busy}>
              {busy ? 'Saving…' : 'Enter the vault'}
            </button>
          )}
          <button className="linkish" onClick={onBrands ? () => setStep(5) : finish} disabled={busy}>
            <u>Skip for now</u>
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- value slides */
  return (
    <div className="onboard">
      <p ref={liveRef} className="sr" role="status" aria-live="polite" />
      <div className="track" role="group" aria-roledescription="carousel"
           aria-label="Four things to know"
           style={{ transform: `translateX(-${step * 25}%)` }}>

        <div className="slide" role="group" aria-roledescription="slide"
             aria-label={LABELS[0]} aria-hidden={step !== 0}>
          <div className="lockup" style={{ marginTop: '30%' }}>
            <span className="glow"><MarkShield /></span>
            <div className="wordmark">Vanguard Vault</div>
            <div className="tagline">AI Luxury Shopping Assistant</div>
          </div>
          <div className="lede">
            <h1>Your next rare piece is already being <span className="hl">searched</span> for.</h1>
          </div>
        </div>

        <div className="slide" role="group" aria-roledescription="slide"
             aria-label={LABELS[1]} aria-hidden={step !== 1}>
          <div className="mark"><span className="glow"><MarkEarly /></span></div>
          <div className="lede">
            <h1>Be first, before it’s <span className="hl">public</span>.</h1>
            <p>Your concierge watches every drop, resale listing and private sale — and
               reaches you while the piece is still available.</p>
          </div>
        </div>

        <div className="slide" role="group" aria-roledescription="slide"
             aria-label={LABELS[2]} aria-hidden={step !== 2}>
          <div className="mark"><span className="glow"><MarkSources /></span></div>
          <div className="lede">
            <h1>Only the brands <span className="hl">you</span> name.</h1>
            <p>You give Vanguard Vault the brands, stores and makers you already trust.
               It searches those and nothing else — and no one can pay to be added to
               your list.</p>
          </div>
        </div>

        <div className="slide" role="group" aria-roledescription="slide"
             aria-label={LABELS[3]} aria-hidden={step !== 3}>
          <div className="mark"><span className="glow"><MarkApproval /></span></div>
          <div className="lede">
            <h1>It secures. <span className="hl">You</span> decide.</h1>
            <p>Vanguard Vault can hold a piece, watch its price and prepare a purchase.
               Nothing is ever bought without your explicit approval.</p>
          </div>
        </div>
      </div>

      <button className="skip" onClick={() => setStep(SLIDES)}>Skip</button>

      <div className="dots" role="tablist" aria-label="Onboarding screens">
        {Array.from({ length: SLIDES }, (_, i) => (
          <button key={i} className={i === step ? 'on' : ''} role="tab"
                  aria-selected={i === step} aria-label={LABELS[i]}
                  onClick={() => setStep(i)}>
            <span className="hit" />
          </button>
        ))}
      </div>

      <button className="cta" onClick={() => setStep(step + 1)}>
        {step === SLIDES - 1 ? 'Begin' : 'Next'}
      </button>
    </div>
  );
}
