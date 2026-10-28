-- OPTIONAL, PERMANENT: deletes the old DPR data (daily rows, sales log, goals, notes).
-- Only run this after the new Daily tab is live and you no longer need the old DPR.
-- There is no undo.
drop table if exists public.dpr_sales cascade;
drop table if exists public.dpr_daily cascade;
drop table if exists public.dpr_goals cascade;
drop table if exists public.dpr_notes cascade;
