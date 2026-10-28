-- Staff roster, pay history, reviews and discipline for the Leadership page.
-- Staff no longer need a portal login to be tracked here.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
do $$
declare t text;  -- use whatever type locations.id already has (uuid or text)
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute where attrelid = 'public.locations'::regclass and attname = 'id';
  execute format($f$create table if not exists public.staff (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    studio_id %s references public.locations(id) on delete set null,
    role text, hire_date date,
    status text not null default 'active',          -- active | on_leave | terminated
    employment_type text,                           -- full_time | part_time | contractor
    next_review_due date,
    user_id uuid unique references auth.users(id) on delete set null,   -- optional link to a portal login
    notes text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now())$f$, t);
end $$;

create table if not exists public.staff_pay (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  effective_date date not null,
  pay_type text not null default 'hourly',          -- hourly | salary
  base_rate numeric, per_stretch numeric,
  change_type text, note text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique (staff_id, effective_date));

create table if not exists public.staff_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  review_date date not null, rating integer, summary text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());

create table if not exists public.staff_discipline (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  incident_date date not null, kind text, description text not null, action_taken text,
  follow_up_date date, acknowledged boolean not null default false, resolved boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now());

-- Who may see this: the owner, anyone given the Leadership page, or the older hr_access flag
create or replace function public.staff_ok() returns boolean language plpgsql stable security definer set search_path = public as $$
declare r text; ok boolean := false; hra boolean := false;
begin
  select role into r from public.profiles where id = auth.uid();
  if r = 'owner' then return true; end if;
  begin
    execute 'select coalesce(bool_or(x::text = ''leadership''), false) from unnest((select public.my_pages())) x' into ok;
  exception when others then
    begin execute 'select exists(select 1 from public.my_pages() x where x::text = ''leadership'')' into ok;
    exception when others then ok := false; end;
  end;
  if ok then return true; end if;
  begin execute 'select coalesce(hr_access, false) from public.profiles where id = auth.uid()' into hra;
  exception when others then hra := false; end;
  return coalesce(hra, false);
end $$;

alter table public.staff enable row level security;
alter table public.staff_pay enable row level security;
alter table public.staff_reviews enable row level security;
alter table public.staff_discipline enable row level security;
drop policy if exists staff_all on public.staff;
create policy staff_all on public.staff for all to authenticated using (public.staff_ok()) with check (public.staff_ok());
drop policy if exists staff_pay_all on public.staff_pay;
create policy staff_pay_all on public.staff_pay for all to authenticated using (public.staff_ok()) with check (public.staff_ok());
drop policy if exists staff_reviews_all on public.staff_reviews;
create policy staff_reviews_all on public.staff_reviews for all to authenticated using (public.staff_ok()) with check (public.staff_ok());
drop policy if exists staff_discipline_all on public.staff_discipline;
create policy staff_discipline_all on public.staff_discipline for all to authenticated using (public.staff_ok()) with check (public.staff_ok());

-- One-time copy of anything already entered on the old Leadership page (people with portal logins)
do $$
begin
  insert into public.staff (full_name, studio_id, role, hire_date, user_id)
    select d.full_name, d.location_id, d.job_title, d.start_date, d.id from public.team_directory d
    where d.full_name is not null and not exists (select 1 from public.staff s where s.user_id = d.id);
exception when others then raise notice 'team copy skipped: %', sqlerrm;
end $$;
do $$
begin
  update public.staff s set status = coalesce(p.status, s.status), employment_type = coalesce(p.employment_type, s.employment_type),
    next_review_due = coalesce(s.next_review_due, p.next_review_due), notes = coalesce(s.notes, p.notes)
    from public.hr_profiles p where p.user_id = s.user_id;
exception when others then raise notice 'hr_profiles copy skipped: %', sqlerrm;
end $$;
do $$
begin
  insert into public.staff_pay (staff_id, effective_date, pay_type, base_rate, change_type, note, created_by)
    select s.id, h.effective_date, coalesce(h.pay_type, 'hourly'), h.rate, h.change_type, h.note, h.created_by
    from public.pay_history h join public.staff s on s.user_id = h.user_id
    on conflict (staff_id, effective_date) do nothing;
exception when others then raise notice 'pay copy skipped: %', sqlerrm;
end $$;
do $$
begin
  insert into public.staff_reviews (staff_id, review_date, rating, summary, created_by)
    select s.id, r.review_date, r.rating, r.summary, r.created_by from public.hr_reviews r join public.staff s on s.user_id = r.user_id
    where not exists (select 1 from public.staff_reviews x where x.staff_id = s.id and x.review_date = r.review_date);
exception when others then raise notice 'review copy skipped: %', sqlerrm;
end $$;
do $$
begin
  insert into public.staff_discipline (staff_id, incident_date, kind, description, action_taken, follow_up_date, acknowledged, resolved, created_by)
    select s.id, d.incident_date, d.kind, d.description, d.action_taken, d.follow_up_date, d.acknowledged, d.resolved, d.created_by
    from public.discipline_records d join public.staff s on s.user_id = d.user_id
    where not exists (select 1 from public.staff_discipline x where x.staff_id = s.id and x.incident_date = d.incident_date and x.description = d.description);
exception when others then raise notice 'discipline copy skipped: %', sqlerrm;
end $$;
