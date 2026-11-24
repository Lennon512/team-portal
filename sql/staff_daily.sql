-- Per-person daily numbers for the My performance page.
--  * staff_daily: one row per staff member per day: utilization from ClubReady's Staff Utilization report (every column of
--    that row kept in "data") and clocked-in minutes from Time Clock Payroll. The reports bot fills it each morning.
--  * staff_contacts_daily: how many contacts (calls, texts, emails...) each staff member logged per day, from the Contact Log.
--    Filled whenever the Contact Log is loaded (the bot does this each morning, with about 6 months of history).
--  * profiles.clubready_name: only needed when someone's name in ClubReady differs from their portal name.
-- Who can read: owners and managers see everyone; everyone else sees only their own rows.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.
do $$
declare t text;  -- same type as locations.id (uuid or text)
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute where attrelid = 'public.locations'::regclass and attname = 'id';
  execute format($f$create table if not exists public.staff_daily (
    studio_id %s not null references public.locations(id) on delete cascade,
    day date not null,
    staff_key text not null,          -- ClubReady staff ID when the report has one, otherwise the name
    staff_name text,
    util numeric,                     -- 0.65 = 65%%
    data jsonb,                       -- the whole Staff Utilization row, by column name
    clock_minutes integer,            -- clocked in that day, from Time Clock Payroll (pay is never saved)
    updated_at timestamptz not null default now(),
    primary key (studio_id, day, staff_key))$f$, t);
  execute format($f$create table if not exists public.staff_contacts_daily (
    studio_id %s not null references public.locations(id) on delete cascade,
    day date not null,
    staff_name text not null,
    kind text not null,               -- Call, Text, Email, In person...
    n integer not null default 0,     -- contacts logged
    made integer not null default 0,  -- of those, contact made
    primary key (studio_id, day, staff_name, kind))$f$, t);
end $$;

alter table public.staff_daily add column if not exists clock_minutes integer;   -- for tables made before it was added
alter table public.profiles add column if not exists clubready_name text;

create or replace function public.dl_role() returns text language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;
-- "Is this ClubReady name me?" (portal name, or the ClubReady name set on the People page)
create or replace function public.is_my_staff_name(n text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and lower(regexp_replace(coalesce(nullif(p.clubready_name, ''), p.full_name, ''), '\s+', ' ', 'g')) = lower(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g')))
$$;

alter table public.staff_daily enable row level security;
alter table public.staff_contacts_daily enable row level security;
drop policy if exists staff_daily_read on public.staff_daily;
create policy staff_daily_read on public.staff_daily for select to authenticated
  using (public.dl_role() in ('owner', 'manager') or public.is_my_staff_name(staff_name));
drop policy if exists staff_daily_write on public.staff_daily;
create policy staff_daily_write on public.staff_daily for all to authenticated
  using (public.dl_role() in ('owner', 'manager')) with check (public.dl_role() in ('owner', 'manager'));
drop policy if exists staff_contacts_daily_read on public.staff_contacts_daily;
create policy staff_contacts_daily_read on public.staff_contacts_daily for select to authenticated
  using (public.dl_role() in ('owner', 'manager') or public.is_my_staff_name(staff_name));
drop policy if exists staff_contacts_daily_write on public.staff_contacts_daily;
create policy staff_contacts_daily_write on public.staff_contacts_daily for all to authenticated
  using (public.dl_role() in ('owner', 'manager')) with check (public.dl_role() in ('owner', 'manager'));

select 'Per-person daily tables are ready' as done;
