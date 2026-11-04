-- CalixTrack: Tabelle für den Cloud-Sync.
-- In Supabase unter „SQL Editor“ → „New query“ einfügen und auf „Run“ klicken.

create table if not exists public.calitrack_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: Jeder Nutzer sieht und ändert ausschließlich seine eigene Zeile.
alter table public.calitrack_data enable row level security;

drop policy if exists "Eigene Daten lesen" on public.calitrack_data;
drop policy if exists "Eigene Daten anlegen" on public.calitrack_data;
drop policy if exists "Eigene Daten ändern" on public.calitrack_data;
drop policy if exists "Eigene Daten löschen" on public.calitrack_data;

create policy "Eigene Daten lesen" on public.calitrack_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigene Daten anlegen" on public.calitrack_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigene Daten ändern" on public.calitrack_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigene Daten löschen" on public.calitrack_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Zugriff nur für angemeldete Nutzer (nicht anonym)
revoke all on public.calitrack_data from anon;
grant select, insert, update, delete on public.calitrack_data to authenticated;
