-- Vanguard Vault POC — migration 0001
-- Patterns carried from HMN: RLS on every table, helpers in a private
-- schema so PostgREST can't reach them, a trigger guarding the one
-- transition that matters. No payment tables exist on purpose.

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------

-- The chain of visible states from the capstone IA.
-- found → holding → confirming → awaiting_approval → approved
-- Terminal without action: expired. Manually let go: released.
create type find_status as enum (
  'found', 'holding', 'confirming', 'awaiting_approval',
  'approved', 'expired', 'released'
);

-- Every row in the decision log is attributed. There is no third value.
create type actor as enum ('you', 'concierge');

-- The four source checks, read from the store's own page.
create type check_kind as enum ('retailer', 'stock_in_size', 'posted_price', 'returns');

create type check_result as enum ('pending', 'passed', 'failed');

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

-- One row per auth user. POC is one user, the shape doesn't change.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  size_label text not null default '',            -- e.g. '42'
  notify_finds boolean not null default true,
  notify_holds boolean not null default true,
  created_at timestamptz not null default now()
);

-- The standing brief, editable in plain language, never inferred silently.
create table briefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  body text not null,                             -- 'archival outerwear, size 42, ceiling $2400'
  ceiling_cents integer,                          -- null means no ceiling stated
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sources the buyer names. The assistant searches nowhere else.
create table sources (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,                             -- 'Goorin Bros'
  url text not null,
  created_at timestamptz not null default now()
);

-- A discovered listing. The center of the app.
create table finds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  brief_id uuid references briefs (id) on delete set null,
  source_id uuid references sources (id) on delete set null,
  title text not null,
  url text not null,
  size_label text not null default '',
  price_cents integer,
  currency text not null default 'USD',
  reasoning text not null default '',             -- 'Why this piece?' shown in place
  status find_status not null default 'found',
  hold_counterparty text,                         -- who is holding it. Required to enter 'holding'.
  hold_expires_at timestamptz,                    -- no urgency without a counterparty
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per check per find. Approve is impossible until all four pass.
create table source_checks (
  id uuid primary key default gen_random_uuid(),
  find_id uuid not null references finds (id) on delete cascade,
  kind check_kind not null,
  result check_result not null default 'pending',
  evidence text not null default '',              -- what was read, from where. Never fabricated.
  checked_at timestamptz,
  unique (find_id, kind)
);

-- Every state change lands here, attributed.
-- Anything marked 'you' can only exist because you tapped it.
create table decision_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  find_id uuid references finds (id) on delete set null,
  actor actor not null,
  action text not null,                           -- 'hold_started', 'approval_requested', 'approved'
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- In-app feed. Push dispatch comes in a later migration, HMN pattern.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  find_id uuid references finds (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Private helpers. Never in public. PostgREST can't call these.
-- ---------------------------------------------------------------

create schema if not exists private;

create function private.owns_row (owner uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select owner = auth.uid();
$$;

revoke all on function private.owns_row (uuid) from public;
grant execute on function private.owns_row (uuid) to authenticated, service_role;

-- ---------------------------------------------------------------
-- The gate. The one trigger that makes the ethics structural.
-- ---------------------------------------------------------------

-- A find cannot enter 'approved' unless all four source checks passed
-- and the hold is real. The API layer also enforces this, but the
-- database is the layer that can't be talked out of it.
create function private.guard_approval ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  passed integer;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select count(*) into passed
    from public.source_checks c
    where c.find_id = new.id and c.result = 'passed';

    if passed < 4 then
      raise exception 'Approval blocked: % of 4 source checks passed', passed;
    end if;

    if old.status <> 'awaiting_approval' then
      raise exception 'Approval blocked: find was %, not awaiting_approval', old.status;
    end if;
  end if;

  -- No urgency without a counterparty.
  if new.status = 'holding' and (new.hold_counterparty is null or new.hold_expires_at is null) then
    raise exception 'Hold blocked: a hold needs a named counterparty and a real expiry';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_approval
  before update on finds
  for each row execute function private.guard_approval ();

-- ---------------------------------------------------------------
-- RLS. On for every table, no exceptions.
-- ---------------------------------------------------------------

alter table profiles           enable row level security;
alter table briefs             enable row level security;
alter table sources            enable row level security;
alter table finds              enable row level security;
alter table source_checks      enable row level security;
alter table decision_log       enable row level security;
alter table notifications      enable row level security;
alter table push_subscriptions enable row level security;

create policy "own profile"    on profiles           for all using (private.owns_row (id));
create policy "own briefs"     on briefs             for all using (private.owns_row (profile_id));
create policy "own sources"    on sources            for all using (private.owns_row (profile_id));
create policy "own finds"      on finds              for all using (private.owns_row (profile_id));
create policy "own checks"     on source_checks      for all
  using (exists (select 1 from finds f where f.id = find_id and private.owns_row (f.profile_id)));
create policy "own log"        on decision_log       for select using (private.owns_row (profile_id));
create policy "own notifs"     on notifications      for all using (private.owns_row (profile_id));
create policy "own push"       on push_subscriptions for all using (private.owns_row (profile_id));

-- The decision log is append-only from the client's point of view.
-- Inserts go through the API layer with service_role. No update or
-- delete policy exists, so history can't be rewritten.
