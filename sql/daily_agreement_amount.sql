-- Average sale on the Projection page: each day's total sale amount from the Agreements Log
-- (the Invoice column, add-ons left out), filled in by the ClubReady bot / Members import.
-- Average sale = this month's total ÷ agreements (new + reactivations).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
alter table public.daily_log add column if not exists agreement_amount numeric;
