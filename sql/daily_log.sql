-- Daily log, payroll and studio targets for the Daily and Weekly tabs.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
do $$
declare t text;  -- use whatever type locations.id already has (uuid or text)
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute where attrelid = 'public.locations'::regclass and attname = 'id';

  execute format($f$create table if not exists public.daily_log (
    studio_id %s not null references public.locations(id) on delete cascade,
    day date not null,
    revenue numeric, leads integer, contacts integer, open_day boolean default true,
    demos_booked integer, demos_held integer, agreements integer,
    cancellations integer, freezes integer, reactivations integer, active_members integer,
    slots_available numeric, stretches_completed integer, new_eft numeric, refunds numeric,
    notes text, action text, focus_override text,
    updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
    primary key (studio_id, day))$f$, t);

  -- Payroll lives in its own table so it can be locked down separately
  execute format($f$create table if not exists public.daily_payroll (
    studio_id %s not null references public.locations(id) on delete cascade,
    day date not null, payroll numeric,
    updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
    primary key (studio_id, day))$f$, t);

  execute format($f$create table if not exists public.studio_targets (
    studio_id %s primary key references public.locations(id) on delete cascade,
    revenue_goal numeric, labor_max numeric default 0.4, l2d_target numeric default 0.5, show_target numeric default 0.8,
    close_target numeric default 0.4, attrition_max numeric default 0.1, contacts_target numeric default 50,
    util_target numeric default 0.65, nmg_target numeric default 6, objective text,
    updated_at timestamptz not null default now())$f$, t);
end $$;

alter table public.daily_log enable row level security;
alter table public.daily_payroll enable row level security;
alter table public.studio_targets enable row level security;

-- Who is signed in
create or replace function public.dl_role() returns text language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;
create or replace function public.dl_location() returns text language sql stable security definer set search_path = public as
  $$ select location_id::text from public.profiles where id = auth.uid() $$;

-- Daily log: the whole team can read it; owners write any studio, managers write their own
drop policy if exists daily_log_read on public.daily_log;
create policy daily_log_read on public.daily_log for select to authenticated using (true);
drop policy if exists daily_log_write on public.daily_log;
create policy daily_log_write on public.daily_log for all to authenticated
  using (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()))
  with check (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()));

-- Payroll: owners see and edit every studio; managers only their own studio
drop policy if exists daily_payroll_all on public.daily_payroll;
create policy daily_payroll_all on public.daily_payroll for all to authenticated
  using (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()))
  with check (public.dl_role() = 'owner' or (public.dl_role() = 'manager' and studio_id::text = public.dl_location()));

-- Targets: everyone reads, only owners change
drop policy if exists studio_targets_read on public.studio_targets;
create policy studio_targets_read on public.studio_targets for select to authenticated using (true);
drop policy if exists studio_targets_write on public.studio_targets;
create policy studio_targets_write on public.studio_targets for all to authenticated
  using (public.dl_role() = 'owner') with check (public.dl_role() = 'owner');
