-- Repeating events and meetings on the Calendar.
--  * A repeating event is saved as one row per date, all sharing a series_id,
--    so you can edit or delete one date or that date and everything after it.
--  * repeat_rule is a short label shown on the event ("Every week", "Monthly on the 2nd Tuesday"...).
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.events add column if not exists series_id uuid;
alter table public.events add column if not exists repeat_rule text;
create index if not exists events_series_idx on public.events (series_id, event_date);
