-- Announcements: shown at the top of everyone's homepage (holiday specials, contests, news).
--  * Everyone signed in can read them. Only owners can post, edit or remove them.
--  * Each one can have a start date, an optional end date (it disappears after that day),
--    an optional link, and which studios should see it (none picked = every studio).
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  kind text not null default 'news' check (kind in ('news', 'promo', 'contest', 'important')),
  link text,
  starts_on date not null default current_date,
  ends_on date,                               -- blank = stays up until removed
  location_ids uuid[] not null default '{}',  -- empty = every studio
  pinned boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

alter table public.announcements enable row level security;
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using (active);
drop policy if exists announcements_owner_write on public.announcements;
create policy announcements_owner_write on public.announcements for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
