-- Device-backed profiles. Additive migration: existing media_state stays intact.
begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.aster_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.aster_profile_members (
  profile_id uuid not null references public.aster_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (profile_id,user_id)
);
create table if not exists public.aster_profile_media (
  profile_id uuid not null references public.aster_profiles(id) on delete cascade,
  media_id text not null check (length(media_id) between 1 and 1000),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576),
  primary key (profile_id,media_id)
);
create table if not exists public.aster_pairing_codes (
  code_hash bytea primary key,
  profile_id uuid not null references public.aster_profiles(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.aster_profiles enable row level security;
alter table public.aster_profile_members enable row level security;
alter table public.aster_profile_media enable row level security;
alter table public.aster_pairing_codes enable row level security;
revoke all on public.aster_profiles,public.aster_profile_members,public.aster_profile_media,public.aster_pairing_codes from public,anon,authenticated;
grant select on public.aster_profiles,public.aster_profile_members to authenticated;
grant select,insert,update on public.aster_profile_media to authenticated;

create or replace function public.aster_is_profile_member(target_profile uuid) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.aster_profile_members where profile_id=target_profile and user_id=(select auth.uid())); $$;
revoke all on function public.aster_is_profile_member(uuid) from public,anon;
grant execute on function public.aster_is_profile_member(uuid) to authenticated;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='aster_profiles' and policyname='Members read profiles') then
    create policy "Members read profiles" on public.aster_profiles for select to authenticated using(public.aster_is_profile_member(id));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='aster_profile_members' and policyname='Devices read own membership') then
    create policy "Devices read own membership" on public.aster_profile_members for select to authenticated using(user_id=(select auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='aster_profile_media' and policyname='Members read media') then
    create policy "Members read media" on public.aster_profile_media for select to authenticated using(public.aster_is_profile_member(profile_id));
    create policy "Members insert media" on public.aster_profile_media for insert to authenticated with check(public.aster_is_profile_member(profile_id));
    create policy "Members update media" on public.aster_profile_media for update to authenticated using(public.aster_is_profile_member(profile_id)) with check(public.aster_is_profile_member(profile_id));
  end if;
end $$;

create or replace function public.aster_create_profile(display_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile uuid; caller uuid:=auth.uid();
begin
  if caller is null then raise exception 'Device sign-in required'; end if;
  if length(trim(display_name)) not between 1 and 40 then raise exception 'Use a profile name between 1 and 40 characters'; end if;
  if (select count(*) from public.aster_profiles where created_by=caller)>=10 then raise exception 'Profile limit reached on this device'; end if;
  insert into public.aster_profiles(name,created_by) values(trim(display_name),caller) returning id into profile;
  insert into public.aster_profile_members(profile_id,user_id) values(profile,caller);
  return jsonb_build_object('id',profile,'name',trim(display_name));
end $$;
create or replace function public.aster_create_pairing_code(target_profile uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text; deadline timestamptz:=now()+interval '15 minutes';
begin
  if not public.aster_is_profile_member(target_profile) then raise exception 'Only a connected device can create a pairing code'; end if;
  code:=upper(encode(extensions.gen_random_bytes(16),'hex'));
  delete from public.aster_pairing_codes where profile_id=target_profile or expires_at<now();
  insert into public.aster_pairing_codes(code_hash,profile_id,expires_at) values(extensions.digest(code,'sha256'),target_profile,deadline);
  return jsonb_build_object('code',code,'expiresAt',deadline);
end $$;
create or replace function public.aster_redeem_pairing_code(pairing_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text:=upper(regexp_replace(pairing_code,'[[:space:]-]','','g')); profile uuid; display_name text; caller uuid:=auth.uid();
begin
  if caller is null then raise exception 'Device sign-in required'; end if;
  if length(code)<>32 or code !~ '^[A-F0-9]+$' then raise exception 'Invalid pairing code'; end if;
  delete from public.aster_pairing_codes where code_hash=extensions.digest(code,'sha256') and expires_at>now() returning profile_id into profile;
  if profile is null then raise exception 'Pairing code is invalid, expired or already used'; end if;
  insert into public.aster_profile_members(profile_id,user_id) values(profile,caller) on conflict do nothing;
  select name into display_name from public.aster_profiles where id=profile;
  return jsonb_build_object('id',profile,'name',display_name);
end $$;
revoke all on function public.aster_create_profile(text),public.aster_create_pairing_code(uuid),public.aster_redeem_pairing_code(text) from public,anon;
grant execute on function public.aster_create_profile(text),public.aster_create_pairing_code(uuid),public.aster_redeem_pairing_code(text) to authenticated;
commit;
