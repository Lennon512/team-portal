-- Time off import from the Google Form ("Request Time Off (Responses)"), as of Nov 18, 2026.
-- Only requests that end today (Nov 18) or later. All are added as APPROVED.
-- People are matched to portal accounts by email first, then by name.
-- Requests already in the portal (same person, same dates) are skipped, so the ones from the last import won't double up.
-- New since the last import: Gabriel Casteel Nov 27, Peyton Farrow Dec 21-25, Alyssa Stanley Dec 30 - Jan 4.
-- Needs sql/time_off_deleted.sql to have been run first (so deleted requests stay deleted).
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. The result lists anyone it could NOT match.

drop table if exists tor_import, tor_matched;
create temp table tor_import (emails text[], names text[], start_date date, end_date date, shift_type text, can_cover text, coverage text, coverage_note text, note text);

insert into tor_import values
  -- Diana Recalde (Westlake)
  ('{dmrecalde@gmail.com}', '{Diana Recalde}', '2026-11-18', '2026-11-23', 'full', 'maybe', 'other', 'Maybe', 'Birthdays and holidays'),
  ('{dmrecalde@gmail.com}', '{Diana Recalde}', '2026-12-22', '2027-01-04', 'full', 'maybe', 'other', 'Maybe', 'Birthdays and holidays'),
  -- Rachel Taylor (Georgetown)
  ('{rtelaine111@gmail.com}', '{Rachel Taylor}', '2026-12-22', '2027-01-03', 'full', 'no', 'no', null, 'Vacation'),
  -- Michael Williams (William Cannon)
  ('{mcwilliams0205@gmail.com}', '{Michael Williams}', '2026-12-19', '2026-12-27', 'full', 'no', 'no', null, 'Christmas trip'),
  -- Brian Wright (Westlake)
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-11-23', '2026-11-25', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-11-27', '2026-11-28', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-12-05', '2026-12-05', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-12-12', '2026-12-12', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-12-19', '2026-12-19', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-12-21', '2026-12-24', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  ('{wrightbeatjr@aol.com}', '{Brian Wright}', '2026-12-26', '2026-12-26', 'full', 'no', 'other', 'Only 1 other person works here', 'Rugby games; going home for the holidays'),
  -- Peyton Farrow (Lakeway)
  ('{farrowpeyton@yahoo.com}', '{Peyton Farrow}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Going home for Thanksgiving with family'),
  -- Peyton Farrow (Lakeway) - NEW
  ('{farrowpeyton@yahoo.com}', '{Peyton Farrow}', '2026-12-21', '2026-12-25', 'full', 'no', 'no', null, 'Family Christmas'),
  -- Dylan Thamsorn (William Cannon)
  ('{dthamsorn@gmail.com}', '{Dylan Thamsorn}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town'),
  -- Dylan Thamsorn (William Cannon)
  ('{dthamsorn@gmail.com}', '{Dylan Thamsorn}', '2026-12-10', '2026-12-18', 'full', 'yes', 'no', null, 'Birthday trip to California'),
  -- Gabriel Casteel (Round Rock)
  ('{golfcharlie0@gmail.com}', '{Gabriel Casteel,Gabe Casteel}', '2026-11-25', '2026-11-25', 'full', 'no', 'no', null, 'Going out of town'),
  -- Gabriel Casteel (Round Rock) - NEW
  ('{golfcharlie0@gmail.com}', '{Gabriel Casteel,Gabe Casteel}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town'),
  -- Dorothy Marie Elemento (William Cannon)
  ('{dorothyelemento@gmail.com}', '{Dorothy Marie Elemento,Dorothy Elemento}', '2026-12-22', '2026-12-31', 'full', 'no', 'no', null, 'Personal'),
  -- Lea Blinder (William Cannon)
  ('{lhblinder@gmail.com}', '{Lea Blinder,Lea Haylie Blinder}', '2026-12-30', '2027-01-03', 'full', 'yes', 'no', null, 'Out of town'),
  -- Gavin Carlton (Georgetown)
  ('{gcarlton2003@gmail.com}', '{Gavin Carlton}', '2026-11-24', '2026-11-28', 'full', 'maybe', 'yes', null, 'Traveling home to see family over the holidays'),
  ('{gcarlton2003@gmail.com}', '{Gavin Carlton}', '2026-12-21', '2026-12-26', 'full', 'maybe', 'yes', null, 'Traveling home to see family over the holidays'),
  -- Tyler Melancon (Georgetown)
  ('{tylermelancon12@gmail.com}', '{Tyler Melancon}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town for Thanksgiving'),
  -- Alyssa Stanley (Lakeway) - NEW
  ('{alyssaangel2011@gmail.com}', '{Alyssa Stanley,Alyssa Standley}', '2026-12-30', '2027-01-04', 'full', 'yes', 'other', 'Work in progress/half coverage', 'Out of town, personal/holiday');

create temp table tor_matched as
select t.*, (
  select p.id from public.profiles p
  where lower(p.email) = any (select lower(e) from unnest(t.emails) e)
     or lower(trim(p.full_name)) = any (select lower(n) from unnest(t.names) n)
  order by (lower(p.email) = any (select lower(e) from unnest(t.emails) e)) desc
  limit 1) as user_id
from tor_import t;

insert into public.time_off_requests (user_id, start_date, end_date, shift_type, can_cover, coverage, coverage_note, note, status, decided_at)
select m.user_id, m.start_date, m.end_date, m.shift_type, m.can_cover, m.coverage, m.coverage_note, m.note || ' (from time off form)', 'approved', now()
from tor_matched m
where m.user_id is not null
  and not exists (select 1 from public.time_off_requests r where r.user_id = m.user_id and r.start_date = m.start_date and r.end_date = m.end_date)
  -- ...and never bring back a request someone deleted in the portal (sql/time_off_deleted.sql)
  and not exists (select 1 from public.time_off_deleted d where d.user_id = m.user_id and d.start_date = m.start_date and d.end_date = m.end_date);

-- In case the database resets new requests to pending, approve the imported ones
update public.time_off_requests r set status = 'approved', decided_at = coalesce(r.decided_at, now())
from tor_matched m
where r.user_id = m.user_id and r.start_date = m.start_date and r.end_date = m.end_date
  and r.status = 'pending' and r.note like '%(from time off form)';

-- Anyone listed here was NOT added: their portal account uses a different email and name. Send me the names and I will fix the match.
select distinct names[1] as not_matched, emails[1] as form_email from tor_matched where user_id is null
union all
select '✓ Everyone matched', null where not exists (select 1 from tor_matched where user_id is null);
