-- Let general managers (role = 'manager') read the Performance data, same as owners:
-- all six studios on the Austin scorecard, the All Stretch Zone tab and the Compare tab.
-- Read only. Uploading and editing stay owner-only.
-- Safe to run more than once. Run it in Supabase: SQL Editor -> New query -> paste -> Run.

create or replace function public.dl_role() returns text language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;

drop policy if exists kpi_monthly_read_mgr on public.kpi_monthly;
create policy kpi_monthly_read_mgr on public.kpi_monthly for select to authenticated
  using (public.dl_role() in ('owner', 'manager'));

drop policy if exists kpi_network_read_mgr on public.kpi_network;
create policy kpi_network_read_mgr on public.kpi_network for select to authenticated
  using (public.dl_role() in ('owner', 'manager'));

drop policy if exists kpi_corp_studio_read_mgr on public.kpi_corp_studio;
create policy kpi_corp_studio_read_mgr on public.kpi_corp_studio for select to authenticated
  using (public.dl_role() in ('owner', 'manager'));

drop policy if exists kpi_network_all_read_mgr on public.kpi_network_all;
create policy kpi_network_all_read_mgr on public.kpi_network_all for select to authenticated
  using (public.dl_role() in ('owner', 'manager'));
