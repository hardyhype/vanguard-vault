-- Vanguard Vault POC — migration 0003
-- The layer under RLS.
--
-- 0001 enabled row level security on every table and wrote a policy for
-- each one, but never granted the table privileges those policies sit on
-- top of. The two are different layers and they fail differently: a policy
-- that rejects you returns zero rows and no error, while a missing grant
-- refuses the statement outright with "permission denied for table finds".
-- The app has been hitting the second one on every read.
--
-- Granting here does not widen what anyone can see. RLS is still what
-- decides which rows come back, and every policy from 0001 stays exactly
-- as it was. This only says the roles may address the tables at all.

grant usage on schema public to anon, authenticated;

-- The buyer's own data. Row scope is still private.owns_row in every case.
grant select, insert, update, delete on
  profiles, briefs, sources, finds, source_checks, notifications, push_subscriptions
  to authenticated;

-- The decision record is append-only from the client's point of view, so
-- it gets select and insert and deliberately not update or delete. Even
-- with these, 0002's policy still pins client writes to actor = 'you'.
grant select, insert on decision_log to authenticated;

-- The edge function uses service_role, which bypasses RLS but still needs
-- the grant to reach the tables.
grant all on
  profiles, briefs, sources, finds, source_checks, decision_log,
  notifications, push_subscriptions
  to service_role;

-- Every policy calls private.owns_row. A policy expression is evaluated as
-- the querying role, so that role needs USAGE on the schema to reach the
-- function — EXECUTE alone is not enough. Without this the next error
-- after the grants above would be "permission denied for schema private".
grant usage on schema private to authenticated, service_role;
