-- Announcements: custom text for the link button (instead of "Learn more").
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.
alter table public.announcements add column if not exists link_label text;
