-- Library: training paths and studio-lead sign-off. Run after sql/library_assignments.sql.
--  * Paths: owners group resources into a path (e.g. "New Flexologist onboarding") and assign the whole set at once.
--  * Sign-off: a resource can need sign-off. The person marks it done, then their studio lead
--    (a manager at their studio) or an owner signs off before it counts as done.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.library_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  items uuid[] not null default '{}',     -- library_resources ids, in order
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now());
alter table public.library_paths enable row level security;
drop policy if exists lib_paths_read on public.library_paths;
create policy lib_paths_read on public.library_paths for select to authenticated using (true);
drop policy if exists lib_paths_owner_write on public.library_paths;
create policy lib_paths_owner_write on public.library_paths for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

alter table public.library_resources add column if not exists needs_signoff boolean not null default false;
alter table public.library_assignments
  add column if not exists path_id uuid references public.library_paths(id) on delete set null,
  add column if not exists signed_off_by uuid references public.profiles(id),
  add column if not exists signed_off_at timestamptz;

-- Is the signed-in person the studio lead (a manager at the same studio) of this person?
create or replace function public.lib_is_lead_of(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles me join profiles p on p.id = p_user
    where me.id = auth.uid() and me.role = 'manager' and me.location_id is not null and me.location_id = p.location_id and p.id <> me.id)
$$;

-- Leads can see and sign off their studio's trainings
drop policy if exists lib_assign_read on public.library_assignments;
create policy lib_assign_read on public.library_assignments for select to authenticated
  using (user_id = auth.uid() or public.lib_is_lead_of(user_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
drop policy if exists lib_assign_lead_signoff on public.library_assignments;
create policy lib_assign_lead_signoff on public.library_assignments for update to authenticated
  using (public.lib_is_lead_of(user_id)) with check (public.lib_is_lead_of(user_id));
grant update (completed_at, due_date, note, signed_off_by, signed_off_at) on public.library_assignments to authenticated;

-- Owners can change anything. Everyone else: people mark their own trainings done (not after sign-off),
-- leads sign off people at their studio, and nobody signs off their own.
create or replace function public.lib_assign_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner') then return new; end if;
  if new.due_date is distinct from old.due_date or new.note is distinct from old.note then
    raise exception 'Only owners can change the due date or note';
  end if;
  if (new.signed_off_at is distinct from old.signed_off_at or new.signed_off_by is distinct from old.signed_off_by) then
    if not lib_is_lead_of(new.user_id) then raise exception 'Only their studio lead or an owner can sign this off'; end if;
    if new.signed_off_at is not null then new.signed_off_by := auth.uid(); end if;
  end if;
  if new.completed_at is distinct from old.completed_at then
    if new.user_id <> auth.uid() and not lib_is_lead_of(new.user_id) then raise exception 'You can only mark your own trainings done'; end if;
    if old.signed_off_at is not null and new.signed_off_at is not null then raise exception 'Already signed off'; end if;
  end if;
  return new;
end $$;
