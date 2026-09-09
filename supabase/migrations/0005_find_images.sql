-- Vanguard Vault POC — migration 0005
-- A find is a garment. It should look like one.
--
-- Results arrive from search with a listing image more often than not, and a
-- row of identical line icons tells the buyer nothing about the piece. Null
-- is a real state here: plenty of listings have no usable image, and the
-- interface falls back rather than inventing one.

alter table finds add column if not exists image_url text;
