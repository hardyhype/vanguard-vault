-- Vanguard Vault POC — migration 0004
-- Sizes are three things, not one.
--
-- A buyer is not "a 42". They are a shoe size, a top size and a bottom
-- size, and a concierge searching outerwear needs a different number than
-- one searching boots. Kept as free text, in the buyer's own words, for
-- the same reason the brief is: 10.5, M, W32 L34 are all real answers and
-- none of them belong in a dropdown.

alter table profiles add column if not exists size_shoe   text not null default '';
alter table profiles add column if not exists size_top    text not null default '';
alter table profiles add column if not exists size_bottom text not null default '';

-- profiles.size_label from 0001 is superseded by the three above. Left in
-- place rather than dropped: it is empty, harmless, and dropping columns
-- is not something to do casually on a live database.
comment on column profiles.size_label is
  'Superseded by size_shoe / size_top / size_bottom in 0004. Unused.';
