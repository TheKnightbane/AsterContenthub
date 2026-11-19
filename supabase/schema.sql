-- Run in your Supabase project's SQL editor. Safe to run again.
-- The desktop app uses a public publishable key; never embed a service-role key.
create table if not exists public.media_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id text not null,
  payload jsonb not null,
  primary key (user_id, media_id)
);
alter table public.media_state enable row level security;
revoke all on public.media_state from anon;
grant select, insert, update on public.media_state to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='media_state' and policyname='Read own media') then
    create policy "Read own media" on public.media_state for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='media_state' and policyname='Insert own media') then
    create policy "Insert own media" on public.media_state for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='media_state' and policyname='Update own media') then
    create policy "Update own media" on public.media_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
