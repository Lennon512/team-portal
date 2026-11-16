-- Delete a time off request.
--  * Lennon and Kevin (the time off admins) can delete any request: pending, approved or denied.
--  * Anyone can delete their own request.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create or replace function public.delete_time_off(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from time_off_requests where id = p_id;
  if v_user is null then raise exception 'That request was not found (it may already be deleted).'; end if;
  if not (v_user = auth.uid()
          or exists (select 1 from time_off_admins a where a.user_id = auth.uid())) then
    raise exception 'Only Lennon, Kevin or the person who asked can delete a time off request.';
  end if;
  delete from time_off_requests where id = p_id;
end $$;
grant execute on function public.delete_time_off(uuid) to authenticated;
