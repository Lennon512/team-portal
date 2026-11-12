-- Staff schedules for tasks: each person's usual work days.
--  * Tasks only count on the days someone usually works (plus approved time off is skipped, as before).
--  * Someone with no schedule set counts every day.
--  * Days are stored 1 = Monday ... 7 = Sunday.
--  * Everyone can see schedules; only owners can change them.
-- Needs task_frequency.sql to have been run first. Safe to run more than once.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.work_schedules (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  days int[] not null default '{1,2,3,4,5,6,7}',
  updated_at timestamptz not null default now());
alter table public.work_schedules enable row level security;
drop policy if exists work_schedules_read on public.work_schedules;
create policy work_schedules_read on public.work_schedules for select to authenticated using (true);
drop policy if exists work_schedules_owner_write on public.work_schedules;
create policy work_schedules_owner_write on public.work_schedules for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create or replace function public.task_scores(p_month date, p_day date, p_today date)
returns table (user_id uuid, total int, done_day int, daily_n int, daily_done int, weekly_n int, weekly_done int,
               monthly_n int, monthly_done int, slots int, done_slots int, pct int)
language sql stable security definer set search_path = public as $$
with me as (
  select id, role, location_id from profiles where id = auth.uid() and coalesce(full_name, '') !~* '\mbot\M'),
b as (
  select date_trunc('month', p_month)::date as ms, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as me_),
cut as (  -- score counts days up to and including c
  select ms, me_, case when p_today between ms and me_ then p_today - 1 when me_ < p_today then me_ else ms - 1 end as c from b),
win as (  -- check-offs we need to look at
  select least(cut.ms - 6, date_trunc('week', p_day)::date, date_trunc('month', p_day)::date) as f,
         greatest(cut.me_, date_trunc('week', p_day)::date + 6, p_day) as t from cut),
people as (
  select p.id from profiles p cross join me
  where me.role = 'owner' or p.id = me.id or (me.role = 'manager' and p.location_id = me.location_id)),
asg as (
  select distinct pp.user_id, t.id as tid, coalesce(t.frequency, 'daily') as f
  from profile_positions pp join task_templates t on t.position_id = pp.position_id and t.active
  join people on people.id = pp.user_id),
chk as (
  select distinct k.user_id, k.template_id, k.check_date
  from task_checks k join people on people.id = k.user_id cross join win
  where k.check_date between win.f and win.t),
off as (  -- days that don't count: approved time off, plus days outside someone's usual work days
  select r.user_id, d::date as d
  from time_off_requests r join people on people.id = r.user_id cross join cut
  cross join lateral generate_series(greatest(r.start_date, cut.ms - 6), least(r.end_date, cut.me_), interval '1 day') d
  where r.status = 'approved' and coalesce(r.shift_type, 'full') <> 'partial'
  union
  select ws.user_id, d::date
  from work_schedules ws join people on people.id = ws.user_id cross join cut
  cross join lateral generate_series(cut.ms - 6, cut.me_, interval '1 day') d
  where not (extract(isodow from d)::int = any (ws.days))),
days as (select d::date as d from cut cross join lateral generate_series(cut.ms, cut.c, interval '1 day') d),
weeks as (
  select w::date as w from cut cross join lateral generate_series(date_trunc('week', cut.ms)::date, cut.c, interval '1 week') w
  where (w::date + 6) between cut.ms and cut.c),
ds as (  -- daily: one slot per task per working day
  select a.user_id, count(*) as slots,
         count(*) filter (where exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid and k.check_date = dd.d)) as done
  from asg a cross join days dd
  where a.f = 'daily' and not exists (select 1 from off o where o.user_id = a.user_id and o.d = dd.d)
  group by a.user_id),
wsc as (  -- weekly: one slot per task per finished week, unless off the whole week
  select a.user_id, count(*) as slots,
         count(*) filter (where exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid and k.check_date between wk.w and wk.w + 6)) as done
  from asg a cross join weeks wk
  where a.f = 'weekly' and (select count(*) from off o where o.user_id = a.user_id and o.d between wk.w and wk.w + 6) < 7
  group by a.user_id),
msc as (  -- monthly: one slot per task once the month is over, unless off the whole month
  select a.user_id, count(*) as slots,
         count(*) filter (where exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid and k.check_date between cut.ms and cut.me_)) as done
  from asg a cross join cut
  where a.f = 'monthly' and cut.c = cut.me_
    and (select count(*) from off o where o.user_id = a.user_id and o.d between cut.ms and cut.me_) < (cut.me_ - cut.ms + 1)
  group by a.user_id),
dayc as (  -- the picked day: daily done that day, weekly done that week, monthly done that month
  select a.user_id, count(*) as total,
    count(*) filter (where a.f = 'daily') as dn, count(*) filter (where a.f = 'weekly') as wn, count(*) filter (where a.f = 'monthly') as mn,
    count(*) filter (where a.f = 'daily' and exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid and k.check_date = p_day))  as dd,
    count(*) filter (where a.f = 'weekly' and exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid
      and k.check_date between date_trunc('week', p_day)::date and date_trunc('week', p_day)::date + 6)) as wd,
    count(*) filter (where a.f = 'monthly' and exists (select 1 from chk k where k.user_id = a.user_id and k.template_id = a.tid
      and k.check_date between date_trunc('month', p_day)::date and (date_trunc('month', p_day) + interval '1 month - 1 day')::date)) as md
  from asg a group by a.user_id)
select pe.id,
  coalesce(dc.total, 0)::int, coalesce(dc.dd + dc.wd + dc.md, 0)::int,
  coalesce(dc.dn, 0)::int, coalesce(dc.dd, 0)::int, coalesce(dc.wn, 0)::int, coalesce(dc.wd, 0)::int, coalesce(dc.mn, 0)::int, coalesce(dc.md, 0)::int,
  (coalesce(ds.slots, 0) + coalesce(wsc.slots, 0) + coalesce(msc.slots, 0))::int,
  (coalesce(ds.done, 0) + coalesce(wsc.done, 0) + coalesce(msc.done, 0))::int,
  case when coalesce(ds.slots, 0) + coalesce(wsc.slots, 0) + coalesce(msc.slots, 0) > 0
    then round(100.0 * (coalesce(ds.done, 0) + coalesce(wsc.done, 0) + coalesce(msc.done, 0))
               / (coalesce(ds.slots, 0) + coalesce(wsc.slots, 0) + coalesce(msc.slots, 0)))::int end
from people pe
left join dayc dc on dc.user_id = pe.id
left join ds on ds.user_id = pe.id
left join wsc on wsc.user_id = pe.id
left join msc on msc.user_id = pe.id
$$;
grant execute on function public.task_scores(date, date, date) to authenticated;
