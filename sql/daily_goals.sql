-- Daily review goals: adds daily goals for leads, booked, held, sales, cancellations (max) and reactivations
-- to the studio targets (set them on Performance -> Enter numbers -> Targets).
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.
alter table public.studio_targets add column if not exists leads_target numeric;
alter table public.studio_targets add column if not exists booked_target numeric;
alter table public.studio_targets add column if not exists held_target numeric;
alter table public.studio_targets add column if not exists sales_target numeric;
alter table public.studio_targets add column if not exists cancels_max numeric;
alter table public.studio_targets add column if not exists react_target numeric;
