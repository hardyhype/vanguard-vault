// Profile.tsx — everything onboarding asked for, editable, plus the account
// controls and the way out.
//
// Sizes and brands are the standing brief. Changing either rewrites the brief
// the concierge reads and lands in the decision record as 'you', because it
// changes what it does on your behalf.

import { useEffect, useState } from 'react';
import {
  getProfile, getSession, listSources, updateProfile, addSource, removeSource,
  updateEmail, updatePassword, signOut,
} from './lib/api';
import type { Profile as P, Source } from './lib/api';
import { Header } from './ui';

function Chevron() {
  return (
    <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

function Plus() {
  return (
    <svg className="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function Profile({ goHome, onSignOut }:
                                { goHome: () => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState<P | null>(null);
  const [email, setEmail] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  // Auth fields are held apart from the profile form so a half-typed
  // password can never be saved by the Save button above it.
  const [newEmail, setNewEmail] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  async function load() {
    try {
      const [p, s, sess] = await Promise.all([getProfile(), listSources(), getSession()]);
      setProfile(p);
      setSources(s);
      setEmail(sess?.user.email ?? '');
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  function set<K extends keyof P>(key: K, value: P[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  }

  async function save() {
    if (!profile) return;
    setErr(''); setNote('');
    try {
      await updateProfile({
        display_name: profile.display_name ?? '',
        size_shoe: profile.size_shoe ?? '',
        size_top: profile.size_top ?? '',
        size_bottom: profile.size_bottom ?? '',
        notify_finds: profile.notify_finds,
        notify_holds: profile.notify_holds,
      });
      setNote('Saved. Your brief has been updated.');
    } catch (e) { setErr((e as Error).message); }
  }

  async function add() {
    const name = draft.trim();
    if (!name) return;
    setErr(''); setNote('');
    try { await addSource(name); setDraft(''); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  async function drop(s: Source) {
    setErr(''); setNote('');
    try { await removeSource(s.id, s.name); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  async function changeEmail() {
    setErr(''); setNote('');
    try {
      await updateEmail(newEmail.trim());
      setNewEmail('');
      setNote('Check your inbox. The new address takes effect once you confirm it.');
    } catch (e) { setErr((e as Error).message); }
  }

  async function changePassword() {
    setErr(''); setNote('');
    if (pw1.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (pw1 !== pw2) { setErr('The two passwords do not match.'); return; }
    try {
      await updatePassword(pw1);
      setPw1(''); setPw2('');
      setNote('Password changed.');
    } catch (e) { setErr((e as Error).message); }
  }

  async function out() {
    try { await signOut(); onSignOut(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <Header>
        <div className="top">
          <button className="back" onClick={goHome} aria-label="Back"><Chevron /></button>
          <span className="brand" style={{ marginRight: 'auto', marginLeft: '10px' }}>
            <b>Profile</b>
          </span>
        </div>
      </Header>

      <div className="scroll docked">
        {!profile && !err && <p className="t-meta" style={{ marginTop: '20px' }}>Loading…</p>}

        {profile && (
          <>
            <div className="sect"><h3>You</h3></div>
            <label className="field">
              <span>Name</span>
              <input value={profile.display_name ?? ''} placeholder="Your name"
                     onChange={(e) => set('display_name', e.target.value)} />
            </label>
            <p className="t-meta">Signed in as {email}</p>

            <div className="sect"><h3>Sizes</h3></div>
            <div className="sizefields">
              <label className="sizefield">
                <span>Shoe</span>
                <input value={profile.size_shoe ?? ''} placeholder="e.g. 10.5"
                       onChange={(e) => set('size_shoe', e.target.value)} />
              </label>
              <label className="sizefield">
                <span>Tops</span>
                <input value={profile.size_top ?? ''} placeholder="e.g. M, or 42"
                       onChange={(e) => set('size_top', e.target.value)} />
              </label>
              <label className="sizefield">
                <span>Bottoms</span>
                <input value={profile.size_bottom ?? ''} placeholder="e.g. 32, or W32 L34"
                       onChange={(e) => set('size_bottom', e.target.value)} />
              </label>
            </div>

            <div className="sect"><h3>Notify me</h3></div>
            <label className="switchrow">
              <span>When a piece is found<span className="sub">New matches for your brief</span></span>
              <input type="checkbox" checked={!!profile.notify_finds}
                     onChange={(e) => set('notify_finds', e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
            <label className="switchrow">
              <span>When a piece is held<span className="sub">And when a hold is running out</span></span>
              <input type="checkbox" checked={!!profile.notify_holds}
                     onChange={(e) => set('notify_holds', e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>

            <div className="acts"><button className="btn block" onClick={save}>Save</button></div>
          </>
        )}

        <div className="sect">
          <h3>Brands you follow</h3>
          <span>{sources.length}</span>
        </div>
        <p className="t-meta">
          Kept under standing watch for sales and new arrivals. You can still ask
          the concierge for anything else at any time.
        </p>
        {sources.length > 0 && (
          <div className="brandlist" style={{ marginTop: '10px' }}>
            {sources.map((s) => (
              <span key={s.id} className="brandchip">
                {s.name}
                <button onClick={() => drop(s)} aria-label={`Remove ${s.name}`}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="composer">
          <input placeholder="Add a brand" value={draft}
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button className="send" onClick={add} disabled={!draft.trim()} aria-label="Add brand">
            <Plus />
          </button>
        </div>

        <div className="sect"><h3>Email</h3></div>
        <label className="field">
          <span>New address</span>
          <input type="email" value={newEmail} placeholder={email} autoComplete="email"
                 onChange={(e) => setNewEmail(e.target.value)} />
        </label>
        <p className="t-meta">
          Supabase sends a confirmation link before a new address takes effect.
        </p>
        <div className="acts">
          <button className="btn-quiet block" onClick={changeEmail} disabled={!newEmail.trim()}>
            Change email
          </button>
        </div>

        <div className="sect"><h3>Password</h3></div>
        <label className="field">
          <span>New</span>
          <input type="password" value={pw1} autoComplete="new-password"
                 onChange={(e) => setPw1(e.target.value)} />
        </label>
        <label className="field">
          <span>Again</span>
          <input type="password" value={pw2} autoComplete="new-password"
                 onChange={(e) => setPw2(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && changePassword()} />
        </label>
        <p className="t-meta">At least 8 characters.</p>
        <div className="acts">
          <button className="btn-quiet block" onClick={changePassword} disabled={!pw1 || !pw2}>
            Change password
          </button>
        </div>

        {note && <p className="t-meta" style={{ paddingTop: '12px' }}>{note}</p>}
        {err && <p className="t-meta" style={{ paddingTop: '12px', color: 'var(--bronze-deep)' }}>{err}</p>}

        <div className="sect"><h3>Session</h3></div>
        <div className="acts"><button className="btn-quiet block" onClick={out}>Sign out</button></div>
        <p className="t-meta" style={{ paddingTop: '8px', paddingBottom: '16px' }}>
          Signing out leaves everything as it is. Nothing is purchased, released or
          cancelled, and your finds are waiting when you come back.
        </p>
      </div>
    </>
  );
}
