-- Library: one place for training and reference resources (files, links, videos, written pages).
--  * Everyone signed in can browse and open resources.
--  * Only owners can add, edit or remove them.
--  * Uploaded files go in a private "library" storage bucket (signed-in team only).
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.library_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'link' check (kind in ('file', 'link', 'video', 'page')),
  url text,                      -- links and videos (YouTube, Loom, Google Drive...)
  file_path text,                -- uploaded files, in the "library" bucket
  file_name text,
  body text,                     -- written pages
  description text,
  category text not null default 'General',
  tags text[] not null default '{}',
  positions uuid[] not null default '{}',   -- empty = for everyone
  pinned boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

alter table public.library_resources enable row level security;
drop policy if exists library_read on public.library_resources;
create policy library_read on public.library_resources for select to authenticated using (active);
drop policy if exists library_owner_write on public.library_resources;
create policy library_owner_write on public.library_resources for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

-- File storage (private bucket, 50 MB per file)
insert into storage.buckets (id, name, public, file_size_limit) values ('library', 'library', false, 52428800)
on conflict (id) do nothing;
drop policy if exists library_files_read on storage.objects;
create policy library_files_read on storage.objects for select to authenticated using (bucket_id = 'library');
drop policy if exists library_files_owner_write on storage.objects;
create policy library_files_owner_write on storage.objects for all to authenticated
  using (bucket_id = 'library' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (bucket_id = 'library' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
