-- Double approval for time off.
--  * Staff requests need BOTH: Lennon or Kevin, AND the studio lead (a manager at the requester's studio).
--  * Requests from a lead/manager (or owner), or from a studio with no lead, need only Lennon or Kevin.
--  * Either side can decline, and a decline takes effect right away.
--  * No one else can approve or decline (other owners and the ClubReady bot included).
-- Requests already approved or declined are not changed.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1) Who gives the final ("owner side") approval
create table if not exists public.time_off_admins (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.time_off_admins enable row level security;
drop policy if exists time_off_admins_read on public.time_off_admins;
create policy time_off_admins_read on public.time_off_admins for select to authenticated using (true);

insert into public.time_off_admins (user_id)
select id from public.profiles
where lower(email) = 'lennon@stretch512.com' or full_name ilike 'kevin%'
on conflict do nothing;

-- 2) Track each side's sign-off on a request
alter table public.time_off_requests
  add column if not exists admin_ok_by uuid references public.profiles(id),
  add column if not exists admin_ok_at timestamptz,
  add column if not exists lead_ok_by uuid references public.profiles(id),
  add column if not exists lead_ok_at timestamptz;

-- 3) Does this request also need the studio lead?
create or replace function public.time_off_needs_lead(p_req uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(req.role, 'staff') not in ('owner', 'manager') and exists (
    select 1 from profiles m
    where m.role = 'manager' and m.location_id = req.location_id and m.id <> req.id
      and coalesce(m.full_name, '') !~* '\mbot\M')
  from time_off_requests r join profiles req on req.id = r.user_id
  where r.id = p_req
$$;

-- 4) Approve / decline
drop function if exists public.decide_time_off(uuid, text);
create function public.decide_time_off(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r time_off_requests%rowtype;
  req_loc text; me_role text; me_loc text;
  is_admin boolean; is_lead boolean; need_lead boolean;
begin
  if p_status not in ('approved', 'denied') then raise exception 'Unknown decision'; end if;
  select * into r from time_off_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request was already %', r.status; end if;

  select location_id::text into req_loc from profiles where id = r.user_id;
  select role, location_id::text into me_role, me_loc from profiles where id = auth.uid() and coalesce(full_name, '') !~* '\mbot\M';
  is_admin := coalesce(exists (select 1 from time_off_admins where user_id = auth.uid()) and auth.uid() <> r.user_id, false);
  need_lead := coalesce(time_off_needs_lead(p_id), false);
  is_lead := coalesce(need_lead and me_role = 'manager' and me_loc = req_loc and auth.uid() <> r.user_id, false);
  if not (is_admin or is_lead) then raise exception 'You can''t approve this request'; end if;

  if p_status = 'denied' then
    update time_off_requests set status = 'denied', decided_by = auth.uid(), decided_at = now() where id = p_id;
    return;
  end if;

  if is_admin then
    update time_off_requests set admin_ok_by = auth.uid(), admin_ok_at = now() where id = p_id and admin_ok_by is null;
  else
    update time_off_requests set lead_ok_by = auth.uid(), lead_ok_at = now() where id = p_id and lead_ok_by is null;
  end if;

  update time_off_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_id and admin_ok_by is not null and (lead_ok_by is not null or not need_lead);
end $$;
grant execute on function public.decide_time_off(uuid, text) to authenticated;

-- 5) Pending requests the logged-in person still needs to act on (drives the Approve buttons and badges)
create or replace function public.time_off_to_act() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from time_off_requests r join profiles req on req.id = r.user_id
  where r.status = 'pending' and r.user_id <> auth.uid() and (
    (r.admin_ok_by is null and exists (select 1 from time_off_admins where user_id = auth.uid()))
    or (r.lead_ok_by is null and time_off_needs_lead(r.id) and exists (
      select 1 from profiles me where me.id = auth.uid() and me.role = 'manager' and me.location_id = req.location_id
        and coalesce(me.full_name, '') !~* '\mbot\M')))
$$;
grant execute on function public.time_off_to_act() to authenticated;

-- Check: these people can give the final approval (should be Lennon and Kevin)
select p.full_name, p.email from public.time_off_admins a join public.profiles p on p.id = a.user_id;
