-- Leads (prospects) for the Members > Leads tab: who came in, and every contact made to them.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
do $$
declare t text;  -- use whatever type locations.id already has (uuid or text)
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute where attrelid = 'public.locations'::regclass and attname = 'id';
  -- One row per lead from ClubReady's "Leads Added" report, plus their latest booking
  execute format($f$create table if not exists public.lead_snapshot (
    studio_id %s not null references public.locations(id) on delete cascade,
    club_id bigint not null,
    name text, added_on date, source text, stage text, added_by text, phone text, email text,
    booking_status text, booking_date date, next_booking date,
    updated_at timestamptz not null default now(),
    primary key (studio_id, club_id))$f$, t);
  -- Every call / text / email / visit to those leads, from the Contact Log
  execute format($f$create table if not exists public.lead_contacts (
    id bigint generated always as identity primary key,
    studio_id %s not null references public.locations(id) on delete cascade,
    club_id bigint not null, contacted_at timestamptz not null,
    staff text, kind text, made boolean, outcome text)$f$, t);
end $$;
create index if not exists lead_contacts_studio on public.lead_contacts (studio_id, club_id, contacted_at desc);

alter table public.lead_snapshot enable row level security;
alter table public.lead_contacts enable row level security;

-- Who is signed in (same helpers as the daily log)
create or replace function public.dl_role() returns text language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.dl_location() returns text language sql stable security definer set search_path = public as
  $$ select location_id::text from public.profiles where id = auth.uid() $$;

-- Owners see every studio; everyone else sees their own studio. Owners and managers can load reports.
drop policy if exists lead_snapshot_read on public.lead_snapshot;
create policy lead_snapshot_read on public.lead_snapshot for select to authenticated
  using (public.dl_role() = 'owner' or studio_id::text = public.dl_location());
drop policy if exists lead_snapshot_write on public.lead_snapshot;
create policy lead_snapshot_write on public.lead_snapshot for all to authenticated
  using (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()))
  with check (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()));
drop policy if exists lead_contacts_read on public.lead_contacts;
create policy lead_contacts_read on public.lead_contacts for select to authenticated
  using (public.dl_role() = 'owner' or studio_id::text = public.dl_location());
drop policy if exists lead_contacts_write on public.lead_contacts;
create policy lead_contacts_write on public.lead_contacts for all to authenticated
  using (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()))
  with check (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()));
