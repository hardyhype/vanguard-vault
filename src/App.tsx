// App.tsx — route union in state, no router. HMN pattern.
// SignIn, Onboarding, Home (overview + conversation), Piece (the four source
// checks and the locked approval), Vault (the list and the decision record),
// Profile.

import { useEffect, useRef, useState } from 'react';
import {
  getSession, signIn, chat, listFinds, decisionLog, getProfile,
  addFind, removeFromWatchlist,
  listConversations, loadConversation, startConversation, appendMessage, deleteConversation,
} from './lib/api';
import Piece from './Piece';
import type { Find, LogEntry, Profile, SearchResult, Conversation } from './lib/api';
import { Icon, P, Mark, Thumb, Chip, Countdown, Header, Thinking, money, when } from './ui';
import Onboarding from './Onboarding';
import ProfileScreen from './Profile';

type Route =
  | { name: 'signin' } | { name: 'onboard' } | { name: 'home' }
  | { name: 'vault' } | { name: 'profile' } | { name: 'piece'; id: string; from: 'home' | 'vault' };
type Msg = { role: string; content: string };

function ThreadRow({ c, onOpen, onDeleted }:
                   { c: Conversation; onOpen: () => void; onDeleted: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function drop() {
    if (!armed) { setArmed(true); return; }
    await deleteConversation(c.id);
    onDeleted();
  }

  return (
    <div className="row">
      <button className="rowmain" onClick={onOpen}>
        <span className="thumb"><Icon d={P.chat} size={21} /></span>
        <span className="txt">
          <b>{c.title || 'Untitled thread'}</b>
          <span className="sub"><small>{when(c.updated_at)}</small></span>
        </span>
      </button>
      <button className={`remove ${armed ? 'armed' : ''}`} onClick={drop}
              aria-label={armed ? 'Confirm deleting this conversation' : 'Delete this conversation'}>
        {armed ? 'Delete?' : <Icon d={P.close} size={16} />}
      </button>
    </div>
  );
}

function RemoveButton({ find, onDone }: { find: Find; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function go() {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    try { await removeFromWatchlist(find.id, find.title); onDone(); }
    finally { setBusy(false); setArmed(false); }
  }

  return (
    <button className={`remove ${armed ? 'armed' : ''}`} onClick={go} disabled={busy}
            aria-label={armed ? `Confirm removing ${find.title}` : `Remove ${find.title} from your watchlist`}>
      {armed ? 'Remove?' : <Icon d={P.close} size={16} />}
    </button>
  );
}

// A search result is not a find. It becomes one only when the buyer taps
// Watch, which is why this button is the only thing that writes it down.
function ResultCard({ r, onAdded, goPiece }:
                   { r: SearchResult; onAdded: () => void; goPiece: (id: string) => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle');
  const [err, setErr] = useState('');
  // The piece page is built from the saved record and its four checks, so it
  // only exists once the piece is watched. Holding the new id here is what
  // lets the same control become the way in to it.
  const [findId, setFindId] = useState<string | null>(null);

  async function add() {
    if (state === 'added' && findId) { goPiece(findId); return; }
    setState('busy'); setErr('');
    try {
      const id = await addFind(r, r.detail ?? (r.available === false
        ? 'Out of stock when you added it. Watching for a restock.'
        : 'Added from a search you ran.'));
      setFindId(id);
      setState('added');
      onAdded();
    } catch (e) { setErr((e as Error).message); setState('idle'); }
  }

  // Out of stock is a legitimate result — it is how you confirm a piece is
  // the right one, and how a restock watch starts. It just has to say so.
  const stock = r.available === true ? ['green', 'In stock']
    : r.available === false ? ['quiet', 'Out of stock']
    : ['quiet', 'Stock not confirmed'];
  // Short, because the control is a chip beside the piece, not a panel. The
  // restock nuance lives in the aria-label and in the stock chip already.
  const label = state === 'added' ? 'Open'
    : state === 'busy' ? '…'
    : 'Watch';

  return (
    <div className="result">
      <Thumb src={r.image_url} size={68} />
      <div className="rtxt">
        <a href={r.url} target="_blank" rel="noreferrer noopener">{r.title}</a>
        <span className="rmeta">
          {r.price_cents != null && <b>{money(r.price_cents)}</b>}
          {r.seller && <span>{r.seller}</span>}
        </span>
        <span className="rstock">
          <span className={`chip ${stock[0]}`}>{stock[1]}</span>
        </span>
        {r.detail && <span className="rdetail">{r.detail}</span>}
        {err && <span className="rdetail">{err}</span>}
      </div>
      <button className={`watch ${state === 'added' ? 'on' : ''}`} onClick={add}
              disabled={state === 'busy'}
              aria-label={state === 'added' ? `Open ${r.title}, on your watchlist`
                : r.available === false ? `Watch ${r.title} for a restock`
                : `Watch ${r.title}`}>
        <Icon d={state === 'added' ? P.check : P.plus} size={15} />
        {label}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- app */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'signin' });
  const [checking, setChecking] = useState(true);

  // A signed-in buyer who has not seen the four value screens goes there
  // first: the scope limit and the approval boundary are stated before any
  // data is collected.
  async function afterAuth(): Promise<Route> {
    try {
      const p = await getProfile();
      return { name: p?.onboarded_at ? 'home' : 'onboard' };
    } catch {
      // Can't read the profile — land on home rather than a blank screen,
      // where the reason is shown instead of guessed at.
      return { name: 'home' };
    }
  }

  useEffect(() => {
    getSession().then(async (s) => {
      if (s) setRoute(await afterAuth());
      setChecking(false);
    });
  }, []);

  if (checking) return <div className="frame" />;

  return (
    <div className="frame">
      {route.name === 'signin' &&
        <SignIn onDone={async () => setRoute(await afterAuth())} />}
      {route.name === 'onboard' && <Onboarding onDone={() => setRoute({ name: 'home' })} />}
      {route.name === 'home' && (
        <Home goVault={() => setRoute({ name: 'vault' })}
              goProfile={() => setRoute({ name: 'profile' })}
              goPiece={(id) => setRoute({ name: 'piece', id, from: 'home' })} />
      )}
      {route.name === 'vault' && (
        <Vault goHome={() => setRoute({ name: 'home' })}
               goPiece={(id) => setRoute({ name: 'piece', id, from: 'vault' })} />
      )}
      {route.name === 'piece' && (
        <Piece id={route.id}
               goBack={() => setRoute(route.from === 'vault' ? { name: 'vault' } : { name: 'home' })} />
      )}
      {route.name === 'profile' && (
        <ProfileScreen goHome={() => setRoute({ name: 'home' })}
                       onSignOut={() => setRoute({ name: 'signin' })} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- sign in */
function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); setErr('');
    try { await signIn(email, password); onDone(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="signin">
      <div className="lede">
        <Mark size={34} />
        <h1 className="t-display" style={{ marginTop: '14px' }}>Vanguard Vault</h1>
        <p className="t-meta" style={{ marginTop: '6px' }}>It secures. You decide.</p>
      </div>
      <div className="form">
        <input type="email" placeholder="Email" value={email}
               onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input type="password" placeholder="Password" value={password}
               onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
               onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="btn" onClick={go} disabled={busy}>Sign In</button>
        {err && <p className="t-meta">{err}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- home */
function Home({ goVault, goProfile, goPiece }:
              { goVault: () => void; goProfile: () => void; goPiece: (id: string) => void }) {
  const [view, setView] = useState<'overview' | 'chat'>('overview');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [finds, setFinds] = useState<Find[]>([]);
  const [history, setHistory] = useState<Msg[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [threads, setThreads] = useState<Conversation[]>([]);
  // null until the buyer actually says something — an opening line the
  // concierge spoke is not yet a conversation worth keeping.
  const [convoId, setConvoId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const box = useRef<HTMLTextAreaElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The composer grows with what you type, up to a point, then scrolls.
  // Height has to be reset to auto first or it can only ever get taller.
  // The dock's real height goes into a custom property so the scrolling
  // content can reserve exactly the room the composer is using, rather
  // than a guess that is wrong the moment the text wraps.
  function autosize() {
    const el = box.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 132) + 'px';
    }
    const d = dock.current;
    if (d) d.parentElement?.style.setProperty('--dockh', `${d.offsetHeight}px`);
  }
  useEffect(autosize, [text]);

  // A conversation opens where it left off. Anything else means reading
  // your way down to the part you were in the middle of.
  //
  // stick means "keep the latest message in view". It stays true until the
  // buyer scrolls up to read something, and comes back when they return to
  // the bottom — so nothing ever yanks the view out from under them.
  const stick = useRef(true);

  function toBottom() {
    stick.current = true;
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
  useEffect(() => { if (view === 'chat') toBottom(); },
    [view, history.length, results.length, busy]);

  // Content keeps growing after it is first laid out: web fonts finish
  // loading and change the text metrics, result images decode. Each of
  // those left the view stranded above the newest message, which is what
  // made this look like it was ignoring the scroll entirely.
  useEffect(() => {
    const el = scroller.current;
    if (!el || view !== 'chat') return;
    const pin = () => { if (stick.current) el.scrollTop = el.scrollHeight; };
    const ro = new ResizeObserver(pin);
    Array.from(el.children).forEach((c) => ro.observe(c));
    document.fonts?.ready.then(pin).catch(() => {});
    return () => ro.disconnect();
  }, [view, history.length, results.length]);

  function onScroll() {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
  }

  async function loadFinds() {
    try { setFinds(await listFinds()); } catch (e) { setNote((e as Error).message); }
  }
  async function loadThreads() {
    try { setThreads(await listConversations()); } catch (e) { setNote((e as Error).message); }
  }
  useEffect(() => {
    getProfile().then(setProfile).catch((e) => setNote((e as Error).message));
    loadFinds();
    loadThreads();
  }, []);

  // Reopening a thread shows what the buyer actually saw: the same replies
  // and the same cards, not a fresh search.
  async function resume(c: Conversation) {
    setNote(''); setResults([]); setConvoId(c.id); setView('chat');
    try {
      const stored = await loadConversation(c.id);
      setHistory(stored.map((m) => ({ role: m.role, content: m.content })));
      const last = [...stored].reverse().find((m) => m.results?.length);
      setResults(last?.results ?? []);
    } catch (e) { setNote((e as Error).message); }
  }

  // Leaving a thread ends it. Without this the reopened conversation stayed
  // loaded behind the overview, so the next thing typed there was appended
  // to it — the buyer asked a new question and landed back in an old chat.
  // Nothing is lost: the thread is saved and sits in the list below.
  function toOverview() {
    setConvoId(null); setHistory([]); setResults([]); setNote('');
    setView('overview');
  }

  function open(line: string) {
    setNote(''); setResults([]); setConvoId(null);
    setHistory([{ role: 'assistant', content: line }]);
    setView('chat');
  }

  async function send(prompt?: string) {
    const content = (prompt ?? text).trim();
    if (!content || busy) return;
    setText(''); setNote(''); setResults([]); setBusy(true); setView('chat');
    const next = [...history, { role: 'user', content }];
    setHistory(next);
    try {
      // The thread is created by the first thing the buyer says, so an
      // opened-and-abandoned screen leaves nothing behind.
      let id = convoId;
      if (!id) { id = await startConversation(content); setConvoId(id); await loadThreads(); }
      await appendMessage(id, 'user', content);

      const { reply, results: found } = await chat(next);
      setHistory([...next, { role: 'assistant', content: reply }]);
      setResults(found);
      await appendMessage(id, 'assistant', reply, found);
      await Promise.all([loadFinds(), loadThreads()]);
    } catch (e) {
      setHistory(history);             // roll back the failed turn so the thread stays valid
      setNote((e as Error).message);
    }
    setBusy(false);
  }

  const needsYou = finds.filter((f) => f.status === 'awaiting_approval');
  const onHold = finds.filter((f) => f.status === 'holding');
  const watching = finds.filter((f) => f.status === 'found' || f.status === 'confirming');
  const live = finds.filter((f) => !['expired', 'released'].includes(f.status));
  const priority = needsYou[0] ?? onHold[0] ?? null;

  // Empty means nothing at all — not merely nothing on the watchlist. A
  // buyer with a conversation and no pieces still has something to come back to.
  const nothingYet = finds.length === 0 && threads.length === 0;

  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = (profile?.display_name ?? '').trim().split(' ')[0];

  return (
    <>
      <Header>
        <div className="top">
          <span className="brand"><Mark /><b>Vanguard Vault</b></span>
          <button className="avatar" onClick={goProfile}
                  aria-label={`Profile — ${profile?.display_name || 'your account'}`}>
            <Icon d={P.person} size={19} />
          </button>
        </div>
        {view === 'chat' && (
          <div className="sect">
            <button onClick={toOverview}>← Overview</button>
            <span>{live.length} in motion</span>
          </div>
        )}
      </Header>

      {view === 'chat' ? (
        <>
          <div className="scroll docked composed" ref={scroller} onScroll={onScroll} aria-live="polite">
            <div className="thread">
              {history.map((m, i) => (
                <div key={i} className={`msg ${m.role === 'user' ? 'you' : 'concierge'}`}>{m.content}</div>
              ))}
              {busy && <Thinking />}
              {note && <div className="msg meta">{note}</div>}
            </div>
            {results.length > 0 && (
              <div className="results">
                {results.map((r, i) =>
                  <ResultCard key={r.url + i} r={r} onAdded={loadFinds} goPiece={goPiece} />)}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="scroll docked composed">
          <div className="greet">
            {nothingYet ? (
              <>
                <h1>Your concierge for <em>rare finds.</em></h1>
                <p>It finds, it holds, and it waits for you. Nothing is ever purchased without your tap.</p>
              </>
            ) : needsYou.length > 0 ? (
              <>
                <h1>
                  Good {partOfDay}{firstName ? `, ${firstName}` : ''}.{' '}
                  <em>{needsYou.length === 1 ? 'One piece needs' : `${needsYou.length} pieces need`} you.</em>
                </h1>
                <p>
                  {live.length - needsYou.length > 0
                    ? `The other ${live.length - needsYou.length} ${live.length - needsYou.length === 1 ? 'is' : 'are'} still with your concierge. `
                    : ''}
                  Nothing has been purchased.
                </p>
              </>
            ) : live.length > 0 ? (
              <>
                <h1>
                  Good {partOfDay}{firstName ? `, ${firstName}` : ''}.{' '}
                  {live.length} {live.length === 1 ? 'piece' : 'pieces'} in motion.
                </h1>
                <p>Your concierge is working. Nothing has been purchased.</p>
              </>
            ) : (
              <>
                <h1>Good {partOfDay}{firstName ? `, ${firstName}` : ''}.</h1>
                <p>
                  Nothing on your watchlist yet. Your conversations are below —
                  pick one up, or start something new.
                </p>
              </>
            )}
          </div>

          {nothingYet ? (
            <>
              {/* The concierge speaks first, so the composer reads as a conversation. */}
              <div className="thread" style={{ paddingTop: '18px' }}>
                <div className="msg concierge">
                  What are you looking for? Tell me.
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <button className="tile" onClick={() => open('What are you looking for? Tell me.')}>
                  <span className="glyph"><Icon d={P.discover} /></span>
                  <span>Find me something<span className="sub">Describe the piece you want</span></span>
                  <span className="go"><Icon d={P.arrowRight} size={18} /></span>
                </button>
                <button className="tile" onClick={() => open('Which piece should I watch for a restock?')}>
                  <span className="glyph"><Icon d={P.bell} /></span>
                  <span>Track an item<span className="sub">Watch for a restock</span></span>
                  <span className="go"><Icon d={P.arrowRight} size={18} /></span>
                </button>
                <button className="tile" onClick={goVault}>
                  <span className="glyph"><Icon d={P.vault} /></span>
                  <span>The vault<span className="sub">Finds and the decision record</span></span>
                  <span className="go"><Icon d={P.arrowRight} size={18} /></span>
                </button>
              </div>
            </>
          ) : (
            <>
              {finds.length > 0 && (
              <>
              <div className="sect">
                <h3>Overview</h3>
                <button onClick={goVault}>Open vault</button>
              </div>
              <div className="stats">
                <button className="stat" onClick={goVault}>
                  <b>{needsYou.length}</b><span>{needsYou.length === 1 ? 'Needs you' : 'Need you'}</span>
                </button>
                <button className="stat" onClick={goVault}>
                  <b>{onHold.length}</b><span>On hold</span>
                </button>
                <button className="stat" onClick={goVault}>
                  <b>{watching.length}</b><span>Watching</span>
                </button>
              </div>

              {priority && (
                <div className="card">
                  <div className="eyebrow">
                    {priority.status === 'awaiting_approval'
                      ? <><span className="pulse" />Needs you</>
                      : <>On hold</>}
                  </div>
                  <h2>{priority.title}</h2>
                  <div className="facts">
                    {priority.price_cents != null && <span className="price">{money(priority.price_cents)}</span>}
                    <span className="hold">
                      {priority.status === 'awaiting_approval' ? (
                        'Waiting on your approval — the concierge cannot proceed without it.'
                      ) : (
                        <>
                          Held by {priority.hold_counterparty} · expires in{' '}
                          <Countdown to={priority.hold_expires_at!} />
                        </>
                      )}
                    </span>
                  </div>
                  <div className="acts">
                    <button className="btn" onClick={goVault}>
                      {priority.status === 'awaiting_approval' ? 'Review in the vault' : 'See the piece'}
                    </button>
                  </div>
                  <button className="linkish"
                          onClick={() => send(`Release the hold on "${priority.title}" and tell me why you had it.`)}>
                    <u>Ask the concierge to pass on it</u>
                  </button>
                </div>
              )}

              </>
              )}

              {threads.length > 0 && (
                <>
                  <div className="sect">
                    <h3>Recent activity</h3>
                    <span>{threads.length === 1 ? '1 conversation' : `${threads.length} conversations`}</span>
                  </div>
                  <div className="list">
                    {threads.map((c) => (
                      <ThreadRow key={c.id} c={c}
                                 onOpen={() => resume(c)} onDeleted={loadThreads} />
                    ))}
                  </div>
                </>
              )}

              {finds.length > 0 && (
              <>
              <div className="sect">
                <h3>Watchlist</h3>
                <span>{live.length} active</span>
              </div>
              <div className="list">
                {live.map((f) => (
                  <div key={f.id} className="row">
                    <button className="rowmain" onClick={() => goPiece(f.id)}>
                      <Thumb src={f.image_url} />
                      <span className="txt">
                        <b>{f.title}</b>
                        <span className="sub">
                          <Chip status={f.status} />
                          <small>
                            {f.status === 'holding' && f.hold_counterparty
                              ? `Held by ${f.hold_counterparty}`
                              : f.price_cents != null ? money(f.price_cents) : 'No price recorded'}
                            {f.size_label ? ` · size ${f.size_label}` : ''}
                          </small>
                        </span>
                      </span>
                      {f.status === 'awaiting_approval' && <span className="pulse" />}
                    </button>
                    {f.status !== 'approved' && <RemoveButton find={f} onDone={loadFinds} />}
                  </div>
                ))}
              </div>
              </>
              )}

              {/* Nothing on the watchlist yet, but a thread to come back to. */}
              {finds.length === 0 && (
                <div style={{ marginTop: '18px' }}>
                  <button className="tile" onClick={() => open('What are you looking for? Tell me.')}>
                    <span className="glyph"><Icon d={P.discover} /></span>
                    <span>Find me something<span className="sub">Start a new search</span></span>
                    <span className="go"><Icon d={P.arrowRight} size={18} /></span>
                  </button>
                  <button className="tile" onClick={goVault}>
                    <span className="glyph"><Icon d={P.vault} /></span>
                    <span>The vault<span className="sub">Finds and the decision record</span></span>
                    <span className="go"><Icon d={P.arrowRight} size={18} /></span>
                  </button>
                </div>
              )}
            </>
          )}
          {note && <p className="t-meta" style={{ paddingTop: '12px' }}>{note}</p>}
        </div>
      )}

      <div className="composerdock" ref={dock}>
      <div className="composer grow">
        <textarea ref={box} rows={1} placeholder="Message the concierge" value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends. Shift+Enter is how you get a second line.
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }} />
        <button className="send" onClick={() => send()} disabled={busy} aria-label="Send">
          <Icon d={P.arrowUp} size={18} />
        </button>
      </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- vault */
// The list and the record. A piece's detail lives on its own page now, so
// this screen answers two questions only: what is here, and who did what.
function Vault({ goHome, goPiece }: { goHome: () => void; goPiece: (id: string) => void }) {
  const [finds, setFinds] = useState<Find[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState('');

  async function load() {
    try {
      setFinds(await listFinds());
      setLog(await decisionLog());
    } catch (e) { setNote((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  const live = finds.filter((f) => !['expired', 'released'].includes(f.status));
  const past = finds.filter((f) => ['expired', 'released'].includes(f.status));

  function row(f: Find) {
    return (
      <div key={f.id} className="row">
        <button className="rowmain" onClick={() => goPiece(f.id)}>
          <Thumb src={f.image_url} />
          <span className="txt">
            <b>{f.title}</b>
            <span className="sub">
              <Chip status={f.status} />
              <small>
                {f.status === 'holding' && f.hold_counterparty
                  ? `Held by ${f.hold_counterparty}`
                  : f.price_cents != null ? money(f.price_cents) : 'No price recorded'}
                {f.size_label ? ` · size ${f.size_label}` : ''}
              </small>
            </span>
          </span>
          {f.status === 'awaiting_approval' && <span className="pulse" />}
        </button>
        <span className="rowgo"><Icon d={P.arrowRight} size={17} /></span>
      </div>
    );
  }

  return (
    <>
      <Header>
        <div className="top">
          <button className="back" onClick={goHome} aria-label="Back">
            <Icon d={P.chevron} size={18} />
          </button>
          <span className="brand" style={{ marginRight: 'auto', marginLeft: '10px' }}>
            <b>The vault</b>
          </span>
        </div>
      </Header>

      <div className="scroll docked">
        {finds.length === 0 && (
          <p className="t-meta" style={{ marginTop: '20px' }}>
            Nothing here yet. Nothing has been purchased.
          </p>
        )}

        {live.length > 0 && (
          <>
            <div className="sect"><h3>In motion</h3><span>{live.length}</span></div>
            <div className="list">{live.map(row)}</div>
          </>
        )}

        {past.length > 0 && (
          <>
            <div className="sect"><h3>Let go</h3><span>{past.length}</span></div>
            <div className="list">{past.map(row)}</div>
          </>
        )}

        <div className="sect"><h3>Decision record</h3><span>{log.length} entries</span></div>
        {log.length === 0 && <p className="t-meta">No actions yet.</p>}
        {log.length > 0 && (
          <div className="log">
            {log.map((e) => (
              <div key={e.id} className="logrow">
                <span className="t">
                  {new Date(e.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span>
                  <b>{e.action.replace(/_/g, ' ')}</b><br />
                  {e.detail}
                  <br />
                  <span className={`k ${e.actor === 'you' ? 'you' : 'auto'}`}>
                    {e.actor === 'you' ? 'You' : 'Concierge'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        {note && <p className="t-meta" style={{ paddingTop: '12px' }}>{note}</p>}
        <div style={{ height: '18px' }} />
      </div>
    </>
  );
}
