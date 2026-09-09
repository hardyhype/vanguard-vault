// lib/api.ts — the only file that talks to Supabase or the concierge.
// Screens import from here, nothing else touches the network. HMN rule.

import { createClient, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gxwnzfzsjdofpfakypyu.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4d256ZnpzamRvZnBmYWt5cHl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NTA5ODQsImV4cCI6MjEwNDEyNjk4NH0.5Jd3D5q2m1NPXGGACUbcgFI5hR-5S01alFJBPoGrarQ';

export const supabase = createClient(SUPABASE_URL, ANON_KEY);

export type FindStatus =
  | 'found' | 'holding' | 'confirming' | 'awaiting_approval'
  | 'approved' | 'expired' | 'released';

export interface Find {
  id: string;
  title: string;
  url: string;
  size_label: string;
  price_cents: number | null;
  status: FindStatus;
  reasoning: string;
  hold_counterparty: string | null;
  hold_expires_at: string | null;
  image_url: string | null;
}

// What the concierge hands back from a search. Nothing here is in the
// database yet — a result becomes a find only when the buyer taps to add it.
export interface SearchResult {
  title: string;
  url: string;
  image_url?: string | null;
  price_cents?: number | null;
  seller?: string | null;
  detail?: string | null;
  // true confirmed for sale, false sold or out of stock, undefined not
  // confirmed either way. The card says which; it is never left to be read
  // off the price alone.
  available?: boolean | null;
}

export interface LogEntry {
  id: string;
  actor: 'you' | 'concierge';
  action: string;
  detail: string;
  created_at: string;
}

// The four checks read from the store's own page. Approve is impossible
// until all four pass — the database enforces it, this type only reports it.
export type CheckKind = 'retailer' | 'stock_in_size' | 'posted_price' | 'returns';

export interface SourceCheck {
  id: string;
  find_id: string;
  kind: CheckKind;
  result: 'pending' | 'passed' | 'failed';
  evidence: string;
  checked_at: string | null;
}

// Labels are the buyer's words for each check, carried from the capstone.
export const CHECK_LABELS: Record<CheckKind, string> = {
  retailer: 'The seller is the brand or an authorised stockist',
  stock_in_size: 'In stock, in your size',
  posted_price: 'The price is the store’s posted price',
  returns: 'The return window is the store’s own',
};

export interface Profile {
  id: string;
  display_name: string;
  notify_finds: boolean;
  notify_holds: boolean;
  size_shoe: string;
  size_top: string;
  size_bottom: string;
  onboarded_at: string | null;   // null until the four value screens are done
}

// Three sizes, because a concierge searching boots needs a different
// number than one searching outerwear. All optional.
export interface Sizes { shoe: string; top: string; bottom: string; }

export async function getProfile(): Promise<Profile | null> {
  // select('*') rather than named columns so the app still loads against a
  // database that has not run migration 0002 yet; onboarded_at simply comes
  // back undefined, which reads as "not onboarded".
  //
  // maybeSingle, and a throw, on purpose. This used to return null on any
  // error, which meant a grant failure on profiles looked identical to a
  // profile that did not exist yet — so the app quietly showed a nameless
  // greeting instead of saying it could not read the table.
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

// Every human action lands in the decision record attributed to 'you'.
// Migration 0002 adds the insert policy that lets this through, and pins
// the actor to 'you' so a client can never forge a concierge entry.
async function logYou(profileId: string, action: string, detail: string) {
  const { error } = await supabase.from('decision_log')
    .insert({ profile_id: profileId, actor: 'you', action, detail });
  if (error) throw new Error(`Decision log rejected the entry: ${error.message}`);
}

// Onboarding writes three things and gates on none of them. No ceiling is
// asked for, so ceiling_cents stays null — the schema's own word for
// "no ceiling stated". The brands become the sources the concierge may
// search, and they also go into the brief body verbatim, because get_brief
// is the only tool that can currently see them.
export async function saveOnboarding(brands: string[], sizes: Sizes) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');

  // upsert, not update: an update against a missing row changes nothing
  // and reports no error, which is exactly how this failed the first time.
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: uid,
    size_shoe: sizes.shoe,
    size_top: sizes.top,
    size_bottom: sizes.bottom,
    onboarded_at: new Date().toISOString(),
  });
  if (pErr) throw new Error(pErr.message);

  if (brands.length) {
    const { error: sErr } = await supabase.from('sources')
      .insert(brands.map((name) => ({ profile_id: uid, name })));
    if (sErr) throw new Error(sErr.message);
  }

  const parts: string[] = [];
  if (brands.length) parts.push(`Brands: ${brands.join(', ')}`);
  if (sizes.shoe) parts.push(`shoe ${sizes.shoe}`);
  if (sizes.top) parts.push(`tops ${sizes.top}`);
  if (sizes.bottom) parts.push(`bottoms ${sizes.bottom}`);
  const body = parts.join(' · ');

  if (body) {
    const { error: bErr } = await supabase.from('briefs')
      .insert({ profile_id: uid, body, ceiling_cents: null });
    if (bErr) throw new Error(bErr.message);
  }

  await logYou(uid, body ? 'onboarding_completed' : 'onboarding_skipped',
    body || 'Entered without naming brands or a size.');
}

export interface Source { id: string; name: string; url: string | null; }

export async function listSources(): Promise<Source[]> {
  const { data, error } = await supabase.from('sources')
    .select('id, name, url').order('created_at');
  if (error) throw new Error(error.message);
  return data as Source[];
}

// The brief is what get_brief hands the concierge, so it has to follow the
// profile rather than sit where onboarding left it. Rewritten from the
// current sizes and brands every time either changes.
export async function syncBrief(): Promise<string> {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');

  const [prof, srcs] = await Promise.all([getProfile(), listSources()]);
  const parts: string[] = [];
  if (srcs.length) parts.push(`Brands: ${srcs.map((s) => s.name).join(', ')}`);
  if (prof?.size_shoe) parts.push(`shoe ${prof.size_shoe}`);
  if (prof?.size_top) parts.push(`tops ${prof.size_top}`);
  if (prof?.size_bottom) parts.push(`bottoms ${prof.size_bottom}`);
  const body = parts.join(' · ');

  const { data: active } = await supabase.from('briefs')
    .select('id').eq('profile_id', uid).eq('active', true).limit(1);

  if (active?.length) {
    const { error } = await supabase.from('briefs')
      .update({ body, updated_at: new Date().toISOString() }).eq('id', active[0].id);
    if (error) throw new Error(error.message);
  } else if (body) {
    const { error } = await supabase.from('briefs')
      .insert({ profile_id: uid, body, ceiling_cents: null });
    if (error) throw new Error(error.message);
  }
  return body;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').upsert({ id: uid, ...patch });
  if (error) throw new Error(error.message);
  const body = await syncBrief();
  // Changing the brief changes what the concierge does on your behalf, so
  // it belongs in the decision record like any other instruction you give.
  await logYou(uid, 'brief_updated', body || 'Brief cleared.');
}

export async function addSource(name: string) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('sources').insert({ profile_id: uid, name });
  if (error) throw new Error(error.message);
  await syncBrief();
  await logYou(uid, 'brand_added', name);
}

export async function removeSource(id: string, name: string) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('sources').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await syncBrief();
  await logYou(uid, 'brand_removed', name);
}

// Auth changes go through Supabase, never through our own tables. Supabase
// emails a confirmation link before a new address takes effect.
export async function updateEmail(email: string) {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function listChecks(): Promise<SourceCheck[]> {
  // RLS scopes this to checks on the buyer's own finds.
  const { data, error } = await supabase
    .from('source_checks')
    .select('id, find_id, kind, result, evidence, checked_at');
  if (error) throw new Error(error.message);
  return data as SourceCheck[];
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // First-run housekeeping: a profile row must exist. This was unchecked,
  // so when the grants were missing it failed silently and every later
  // write died on a foreign key instead.
  const { error: pErr } = await supabase.from('profiles').upsert({ id: data.user.id });
  if (pErr) throw new Error(`Signed in, but could not create your profile: ${pErr.message}`);
  return data.session;
}

// finds, sources and briefs all carry a foreign key to profiles, so the
// row has to exist before any of them can be written. signIn creates it,
// but a session that predates that call would not have one — this makes
// the guarantee hold regardless of how the session was obtained.
export async function ensureProfile(): Promise<void> {
  const uid = (await getSession())?.user.id;
  if (!uid) return;
  const { error } = await supabase.from('profiles').upsert({ id: uid });
  if (error) throw new Error(`Could not create your profile: ${error.message}`);
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function listFinds(): Promise<Find[]> {
  const { data, error } = await supabase
    .from('finds')
    .select('id, title, url, size_label, price_cents, status, reasoning, hold_counterparty, hold_expires_at, image_url')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Find[];
}

export async function decisionLog(): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('decision_log')
    .select('id, actor, action, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as LogEntry[];
}

// Approving is the buyer's act. It happens here, in the buyer's session,
// under RLS, and is logged as 'you'. The concierge has no path to this.
export async function approve(findId: string) {
  const { error } = await supabase
    .from('finds').update({ status: 'approved' }).eq('id', findId);
  if (error) throw new Error(error.message); // DB gate speaks if checks are short
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  // This insert was previously unchecked, and RLS was rejecting it: the
  // find flipped to approved while the row proving a human did it was
  // thrown away. It now fails loudly instead.
  const { error: logErr } = await supabase.from('decision_log').insert({
    profile_id: uid, find_id: findId, actor: 'you',
    action: 'approved', detail: 'Approved by the buyer.',
  });
  if (logErr) {
    throw new Error(
      `Approved, but the decision record rejected the entry: ${logErr.message}. ` +
      `Run migration 0002.`);
  }
}

// Adding a result to the watchlist is the buyer's act, not the concierge's.
// It happens here, in the buyer's session, and is logged as 'you'.
export async function addFind(r: SearchResult, reasoning: string) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { data, error } = await supabase.from('finds').insert({
    profile_id: uid,
    title: r.title,
    url: r.url,
    image_url: r.image_url ?? null,
    price_cents: r.price_cents ?? null,
    reasoning,
  }).select('id').single();
  if (error) throw new Error(error.message);
  // The gate counts these rows, so they exist from the moment a find does.
  await supabase.from('source_checks').insert(
    ['retailer', 'stock_in_size', 'posted_price', 'returns']
      .map((kind) => ({ find_id: data.id, kind })),
  );
  await logYou(uid, 'added_to_watchlist', r.title);
  return data.id as string;
}

// Taking a piece off the watchlist releases it rather than deleting it.
// decision_log.find_id is "on delete set null", so a hard delete would leave
// the record saying something happened to a piece it can no longer name —
// and this app's whole claim is that its history cannot be rewritten. The
// find leaves the watchlist and stays in the vault, marked Released.
export async function removeFromWatchlist(id: string, title: string) {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase.from('finds')
    .update({ status: 'released', hold_counterparty: null, hold_expires_at: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await logYou(uid, 'removed_from_watchlist', title);
}

export interface Reply { reply: string; results: SearchResult[]; }

/* ---------------------------------------------------------------- threads */

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  results: SearchResult[] | null;
  created_at: string;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return data as Conversation[];
}

export async function loadConversation(id: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, results, created_at')
    .eq('conversation_id', id)
    .order('created_at');
  if (error) throw new Error(error.message);
  return data as StoredMessage[];
}

// The title is the buyer's own opening line, not a summary of it. A thread
// they can recognise is a thread they can come back to.
export async function startConversation(firstMessage: string): Promise<string> {
  const uid = (await getSession())?.user.id;
  if (!uid) throw new Error('Not signed in');
  const title = firstMessage.trim().replace(/\s+/g, ' ').slice(0, 70);
  const { data, error } = await supabase
    .from('conversations').insert({ profile_id: uid, title }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  results?: SearchResult[],
) {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId, role, content,
    results: results && results.length ? results : null,
  });
  if (error) throw new Error(error.message);
  await supabase.from('conversations')
    .update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
}

export async function deleteConversation(id: string) {
  // messages cascade with the thread.
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function chat(messages: { role: string; content: string }[]): Promise<Reply> {
  const session = await getSession();
  if (!session) throw new Error('Not signed in');
  // The conversation opens with the concierge speaking first, but the API
  // requires the first message to be a user turn — drop the opener.
  const firstUser = messages.findIndex((m) => m.role === 'user');
  const payload = firstUser <= 0 ? messages : messages.slice(firstUser);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/concierge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ messages: payload }),
  });
  const out = await res.json();
  if (out.error) throw new Error(out.error);
  return { reply: (out.reply ?? '') as string, results: (out.results ?? []) as SearchResult[] };
}
