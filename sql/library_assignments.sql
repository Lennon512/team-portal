-- Library: trainings assigned to people.
--  * Owners assign library resources to people (optional due date and note) and see everyone's progress.
--  * Everyone sees their own assigned trainings ("My trainings") and can mark them done.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.library_assignments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.library_resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  due_date date,
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (resource_id, user_id));
create index if not exists library_assignments_user on public.library_assignments (user_id);

alter table public.library_assignments enable row level security;
drop policy if exists lib_assign_read on public.library_assignments;
create policy lib_assign_read on public.library_assignments for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
drop policy if exists lib_assign_owner_write on public.library_assignments;
create policy lib_assign_owner_write on public.library_assignments for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
-- People can mark their own trainings done (and only change that)
drop policy if exists lib_assign_self_done on public.library_assignments;
create policy lib_assign_self_done on public.library_assignments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.library_assignments from authenticated;
grant update (completed_at, due_date, note) on public.library_assignments to authenticated;
-- Non-owners may only touch completed_at on their own rows
create or replace function public.lib_assign_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
     and (new.due_date is distinct from old.due_date or new.note is distinct from old.note) then
    raise exception 'Only owners can change the due date or note';
  end if;
  return new;
end $$;
drop trigger if exists lib_assign_guard on public.library_assignments;
create trigger lib_assign_guard before update on public.library_assignments for each row execute function public.lib_assign_guard();
