-- People page upgrades. Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Needs sql/staff_pay.sql to have been run first.

-- 1) Does the signed-in person have a page through their access group? (works whatever my_pages returns)
create or replace function public.has_page(p text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  begin
    execute 'select coalesce(bool_or(x::text = $1), false) from unnest((select public.my_pages())) x' into ok using p;
  exception when others then
    begin execute 'select exists(select 1 from public.my_pages() x where x::text = $1)' into ok using p;
    exception when others then ok := false; end;
  end;
  return coalesce(ok, false);
end $$;

create or replace function public.staff_loc() returns text language sql stable security definer set search_path = public as
  $$ select location_id::text from public.profiles where id = auth.uid() $$;

-- 2) "Leadership (own studio)": pay, reviews and discipline for their own studio only
create or replace function public.staff_studio_ok(sid text) returns boolean language sql stable security definer set search_path = public as
  $$ select public.staff_ok() or (sid is not null and sid = public.staff_loc() and public.has_page('leadership_studio')) $$;
create or replace function public.staff_row_ok(stid uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select public.staff_ok() or exists (select 1 from public.staff s where s.id = stid and public.staff_studio_ok(s.studio_id::text)) $$;

drop policy if exists staff_all on public.staff;
create policy staff_all on public.staff for all to authenticated using (public.staff_studio_ok(studio_id::text)) with check (public.staff_studio_ok(studio_id::text));
drop policy if exists staff_pay_all on public.staff_pay;
create policy staff_pay_all on public.staff_pay for all to authenticated using (public.staff_row_ok(staff_id)) with check (public.staff_row_ok(staff_id));
drop policy if exists staff_reviews_all on public.staff_reviews;
create policy staff_reviews_all on public.staff_reviews for all to authenticated using (public.staff_row_ok(staff_id)) with check (public.staff_row_ok(staff_id));
drop policy if exists staff_discipline_all on public.staff_discipline;
create policy staff_discipline_all on public.staff_discipline for all to authenticated using (public.staff_row_ok(staff_id)) with check (public.staff_row_ok(staff_id));

-- 3) Sign-in status for the People page (owners only)
create or replace function public.people_status() returns table (id uuid, last_sign_in_at timestamptz, confirmed_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at, coalesce(u.email_confirmed_at, u.confirmed_at), u.created_at from auth.users u
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
$$;
grant execute on function public.people_status() to authenticated;
