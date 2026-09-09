// Piece.tsx — screens 06 and 08 of the capstone, on one page.
//
// The four source checks, each one something the buyer can go and falsify,
// and the approval that stays locked until they pass with the lock saying
// why. This is where the ethics argument is actually visible, so nothing
// here is decorative.

import { useEffect, useState } from 'react';
import type React from 'react';
import {
  listFinds, listChecks, approve, removeFromWatchlist, CHECK_LABELS,
} from './lib/api';
import type { Find, SourceCheck, CheckKind } from './lib/api';
import { Icon, P, Thumb, Chip, Countdown, Header, money, when, hostOf } from './ui';

const CHECK_ORDER: CheckKind[] = ['retailer', 'stock_in_size', 'posted_price', 'returns'];

export default function Piece({ id, goBack }: { id: string; goBack: () => void }) {
  const [find, setFind] = useState<Find | null>(null);
  const [checks, setChecks] = useState<SourceCheck[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [armed, setArmed] = useState(false);

  async function load() {
    try {
      const [finds, cs] = await Promise.all([listFinds(), listChecks()]);
      setFind(finds.find((f) => f.id === id) ?? null);
      setChecks(cs.filter((c) => c.find_id === id));
    } catch (e) { setNote((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function onApprove() {
    setNote('');
    try { await approve(id); await load(); }
    catch (e) { setNote((e as Error).message); } // the gate's own words surface here
  }

  async function onRemove() {
    if (!find) return;
    if (!armed) { setArmed(true); return; }
    try { await removeFromWatchlist(id, find.title); goBack(); }
    catch (e) { setNote((e as Error).message); setArmed(false); }
  }

  const passed = checks.filter((c) => c.result === 'passed').length;
  const ranAny = checks.some((c) => c.checked_at);
  const canApprove = find?.status === 'awaiting_approval' && passed === 4;

  return (
    <>
      <Header>
        <div className="top">
          <button className="back" onClick={goBack} aria-label="Back">
            <Icon d={P.chevron} size={18} />
          </button>
          <span className="brand" style={{ marginLeft: '10px' }}><b>The piece</b></span>
          <span className="t-meta" style={{ marginLeft: 'auto' }}>
            {ranAny ? `${passed} of 4 checks` : 'Not yet checked'}
          </span>
        </div>
      </Header>

      <div className="scroll docked">
        {loading && <p className="t-meta" style={{ marginTop: '20px' }}>Loading…</p>}
        {!loading && !find && (
          <p className="t-meta" style={{ marginTop: '20px' }}>
            That piece is no longer in your vault.
          </p>
        )}

        {find && (
          <>
            {/* The photograph's own edges become the ground behind it, so a
                cutout on white sits on white and never reads as a picture
                dropped into a beige box. */}
            <div className="gallery"
                 style={find.image_url
                   ? ({ '--shot': `url("${find.image_url}")` } as React.CSSProperties)
                   : undefined}>
              <Thumb src={find.image_url} size={220} />
              {find.image_url && <span className="gcap">The seller's own photograph.</span>}
            </div>

            <h1 className="piecetitle">{find.title}</h1>

            <div className="pprice">
              {find.price_cents != null
                ? <><b>{money(find.price_cents)}</b><span className="chip quiet">The store's posted price</span></>
                : <span className="chip quiet">No price recorded</span>}
              <Chip status={find.status} />
            </div>

            {find.reasoning && (
              <>
                <div className="sect"><h3>Why this piece?</h3></div>
                <p className="pdesc">{find.reasoning}</p>
              </>
            )}

            <div className="sect"><h3>Specification</h3></div>
            <div className="prow"><span>Size</span><b>{find.size_label || 'Not stated'}</b></div>
            <div className="prow"><span>Seller</span><b>{hostOf(find.url) || 'Not stated'}</b></div>
            {find.status === 'holding' && find.hold_counterparty && find.hold_expires_at && (
              <div className="prow">
                <span>Held by</span>
                <b>{find.hold_counterparty} · <Countdown to={find.hold_expires_at} /></b>
              </div>
            )}
            <a className="prow prowlink" href={find.url} target="_blank" rel="noreferrer noopener">
              <span>The listing</span>
              <b>Open it yourself <Icon d={P.link} size={14} /></b>
            </a>

            <div className="sect">
              <h3>What I confirmed against the source</h3>
              <span>{passed} of 4 passed</span>
            </div>
            {CHECK_ORDER.map((kind) => {
              const c = checks.find((x) => x.kind === kind);
              const ok = c?.result === 'passed';
              return (
                <details key={kind} className="ev">
                  <summary>
                    <span className="tick">
                      <Icon d={ok ? P.tick : P.dash} size={19} vb={19} tone={ok ? 'passed' : 'pending'} />
                    </span>
                    {CHECK_LABELS[kind]}
                    <span className="caret"><Icon d={P.caret} size={17} vb={17} /></span>
                  </summary>
                  <div className="body">
                    {c?.evidence || 'Not checked yet. Nothing has been read from the store.'}
                    <em>{c?.checked_at ? `Checked ${when(c.checked_at)}` : 'Pending'}</em>
                  </div>
                </details>
              );
            })}

            {ranAny ? (
              <div className="attest">
                <b>These checks are a stub.</b> In this POC <b>run_source_check</b> marks every
                check passed with placeholder evidence. Nothing above was read from the store's
                live page, and nothing above confirms the piece is actually in stock. The real
                read is the parked retail work — the contract does not change when it lands.
              </div>
            ) : (
              <div className="attest">
                <b>Nothing has been read from the store yet.</b> Until stock, size, price and
                terms all match, approval stays locked — including for me. Waiting will not
                unlock it; only the store matching will.
              </div>
            )}

            <div className="guard">
              <b>Approve is yours alone.</b> The concierge has no purchase tool and no path to
              this control. Doing nothing costs you the piece, never your money.
            </div>

            {find.status === 'awaiting_approval' && (
              <>
                <div className="acts">
                  <button className="btn block" onClick={onApprove} disabled={!canApprove}>
                    {find.price_cents != null ? `Approve ${money(find.price_cents)}` : 'Approve'}
                  </button>
                </div>
                <p className="locknote">
                  <Icon d={canApprove ? P.tick : P.lock} size={15} vb={canApprove ? 19 : 24} />
                  <span>
                    {canApprove
                      ? 'One purchase, this piece, this amount. No standing permission is created.'
                      : `${passed} of 4 source checks have passed. The concierge cannot unlock this, and neither can waiting.`}
                  </span>
                </p>
              </>
            )}

            {find.status === 'approved' && (
              <p className="locknote">
                <Icon d={P.tick} size={15} vb={19} />
                <span>Approved by you. Nothing else was authorised.</span>
              </p>
            )}

            {!['approved', 'released', 'expired'].includes(find.status) && (
              <div className="cardfoot" style={{ marginTop: '18px' }}>
                <button className={`remove ${armed ? 'armed' : ''}`} onClick={onRemove}>
                  {armed ? 'Remove?' : <Icon d={P.close} size={16} />}
                </button>
                <span className="t-meta">Remove from watchlist</span>
              </div>
            )}

            {note && <p className="t-meta" style={{ paddingTop: '12px' }}>{note}</p>}
            <div style={{ height: '18px' }} />
          </>
        )}
      </div>
    </>
  );
}
