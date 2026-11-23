-- Remember deleted time off requests, so an import from the Google Form never brings them back.
--  * Every delete (from the portal's Delete / Cancel buttons) is noted here: who, which dates, when, by whom.
--  * The import scripts skip any form request for the same person and the same dates as a deleted one.
-- Requests deleted BEFORE this was run weren't noted, so delete those once more in the portal after running it.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.time_off_deleted (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text,
  note text,
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz not null default now()
);
create index if not exists time_off_deleted_person_dates on public.time_off_deleted (user_id, start_date, end_date);
alter table public.time_off_deleted enable row level security;
-- Lennon and Kevin (the time off admins) can look at the list; nobody edits it directly
drop policy if exists time_off_deleted_read on public.time_off_deleted;
create policy time_off_deleted_read on public.time_off_deleted for select to authenticated
  using (exists (select 1 from public.time_off_admins a where a.user_id = auth.uid()));

-- Same delete rules as before (sql/time_off_delete.sql), now noting the request before removing it
create or replace function public.delete_time_off(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.time_off_requests;
begin
  select * into r from time_off_requests where id = p_id;
  if r.user_id is null then raise exception 'That request was not found (it may already be deleted).'; end if;
  if not (r.user_id = auth.uid()
          or exists (select 1 from time_off_admins a where a.user_id = auth.uid())) then
    raise exception 'Only Lennon, Kevin or the person who asked can delete a time off request.';
  end if;
  insert into time_off_deleted (user_id, start_date, end_date, status, note, deleted_by)
  values (r.user_id, r.start_date, r.end_date, r.status, r.note, auth.uid());
  delete from time_off_requests where id = p_id;
end $$;
grant execute on function public.delete_time_off(uuid) to authenticated;

-- Shows how many deletes are remembered so far
select count(*) as deleted_requests_remembered from public.time_off_deleted;
