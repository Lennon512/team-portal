-- My performance: let each person see their own ClubReady rows even when ClubReady shortens their name
-- ("Dorothy E" for Dorothy Elemento). A row is yours when it matches:
--   1) your ClubReady name, if one is set on the People page (profiles.clubready_name), else
--   2) your portal name exactly, else
--   3) the same first name and last initial, at your studio.
-- Owners and managers still see everyone. Needs sql/staff_daily.sql first. Safe to run more than once.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
create or replace function public.is_my_staff_name(n text, sid text default null) returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select lower(regexp_replace(regexp_replace(coalesce(p.full_name, ''), '[^A-Za-z ]', ' ', 'g'), '\s+', ' ', 'g')) as fn,
           lower(regexp_replace(regexp_replace(coalesce(p.clubready_name, ''), '[^A-Za-z ]', ' ', 'g'), '\s+', ' ', 'g')) as cr,
           p.location_id::text as loc
    from public.profiles p where p.id = auth.uid()),
  it as (select lower(regexp_replace(regexp_replace(coalesce(n, ''), '[^A-Za-z ]', ' ', 'g'), '\s+', ' ', 'g')) as nm)
  select exists (select 1 from me, it where trim(it.nm) <> '' and (
    case when trim(me.cr) <> '' then trim(it.nm) = trim(me.cr)
    else trim(it.nm) = trim(me.fn)
      or (split_part(trim(it.nm), ' ', 1) = split_part(trim(me.fn), ' ', 1)
          and position(' ' in trim(it.nm)) > 0 and position(' ' in trim(me.fn)) > 0
          and left(regexp_replace(trim(it.nm), '^.* ', ''), 1) = left(regexp_replace(trim(me.fn), '^.* ', ''), 1)
          and (sid is null or me.loc is null or me.loc = sid))
    end))
$$;

drop policy if exists staff_daily_read on public.staff_daily;
create policy staff_daily_read on public.staff_daily for select to authenticated
  using (public.dl_role() in ('owner', 'manager') or public.is_my_staff_name(staff_name, studio_id::text));
drop policy if exists staff_contacts_daily_read on public.staff_contacts_daily;
create policy staff_contacts_daily_read on public.staff_contacts_daily for select to authenticated
  using (public.dl_role() in ('owner', 'manager') or public.is_my_staff_name(staff_name, studio_id::text));

select 'Everyone can now see their own My performance numbers' as done;
