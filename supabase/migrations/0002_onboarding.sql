-- Vanguard Vault POC — migration 0002
-- Onboarding, and the fix for an attribution hole in 0001.

-- ---------------------------------------------------------------
-- 1. Onboarding state
-- ---------------------------------------------------------------

-- Null means the four value screens have not been completed. Kept on the
-- profile rather than in browser storage so the ethics disclosure cannot
-- silently re-appear, or be skipped, depending on the device.
alter table profiles add column if not exists onboarded_at timestamptz;

-- ---------------------------------------------------------------
-- 2. A brand named without a resolved URL is a real state
-- ---------------------------------------------------------------

-- Onboarding asks for brands in the buyer's own words. The store page for
-- "The Brooklyn Circus" is not known at that moment, and pretending it is
-- an empty string would be a lie the rest of the system has to carry.
alter table sources alter column url drop not null;

-- ---------------------------------------------------------------
-- 3. The attribution hole
-- ---------------------------------------------------------------

-- 0001 gave decision_log a select policy and nothing else, on the
-- assumption every insert would arrive through the API layer with
-- service_role. The buyer's own approval does not: it is taken in the
-- buyer's session, under their JWT, which is exactly what makes it
-- theirs. With no insert policy that write was being rejected by RLS and
-- discarded, so the one row that proves a human approved was never
-- written.
--
-- This policy lets the buyer append to their own log and nothing else.
-- The actor check is the point: a client cannot forge a 'concierge' row,
-- so anything attributed to the concierge still can only come from the
-- edge function's service_role, which bypasses RLS entirely.
create policy "append own actions" on decision_log for insert
  with check (private.owns_row (profile_id) and actor = 'you');

-- Still no update and no delete policy, for anyone. History stays
-- append-only from the client's point of view.
