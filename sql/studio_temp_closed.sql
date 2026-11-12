-- Studios: "Temporarily closed" banner (set in Edit studio info), and turn it on for Fourpoints.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.
alter table public.studio_info add column if not exists temp_closed boolean not null default false;
alter table public.studio_info add column if not exists temp_closed_note text;

insert into public.studio_info (location_id, temp_closed)
select id, true from public.locations where name ilike 'four%points%'
on conflict (location_id) do update set temp_closed = true;

select l.name, s.temp_closed from public.studio_info s join public.locations l on l.id = s.location_id where s.temp_closed;
