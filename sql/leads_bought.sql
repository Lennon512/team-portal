-- Performance > Lead flow: which leads bought.
-- bought_on: the first Agreements Log entry for that lead on or after the day they came in as a lead.
-- lead_status: ClubReady's "Current Status" on Leads Added ("Prospect", "Active Customer", ...).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.lead_snapshot add column if not exists bought_on date;
alter table public.lead_snapshot add column if not exists lead_status text;
