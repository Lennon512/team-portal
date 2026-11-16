-- Close %: people who had their demo that day AND bought a new agreement (no previous agreements) that day.
-- Filled in by the ClubReady upload. Safe to run more than once.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
alter table public.daily_log add column if not exists demo_sales integer;
