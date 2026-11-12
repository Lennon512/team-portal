-- Tasks where people enter a number (e.g. "Record your total personal calls completed today").
-- A number task counts as done once a number is entered. The number is saved with the check-off.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.task_templates add column if not exists kind text not null default 'check';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'task_templates_kind_check') then
    alter table public.task_templates add constraint task_templates_kind_check check (kind in ('check', 'number'));
  end if;
end $$;

alter table public.task_checks add column if not exists value numeric;

-- Make the calls task a number task
update public.task_templates set kind = 'number' where title ilike 'record your total personal calls%';
