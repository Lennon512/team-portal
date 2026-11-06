-- Two more Daily log numbers filled in by the ClubReady bot: renewals (agreements from people with
-- previous agreements) and staff utilization (average of each staff member's Utilization %, 1.0 = 100%).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.daily_log add column if not exists renewals integer;
alter table public.daily_log add column if not exists staff_util numeric;
