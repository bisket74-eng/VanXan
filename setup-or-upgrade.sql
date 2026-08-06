-- SAVANNAH & XANDER PARTY APP — VERSION 4 COMPLETE SETUP / SAFE UPGRADE
-- Run this entire file once in Supabase SQL Editor.
-- It is safe to run if the earlier version already created the tables.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

create table if not exists public.webbing_guests (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  device_id text not null,
  guestbook_entry_id uuid,
  guestbook_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.webbing_guests
  add column if not exists guestbook_entry_id uuid,
  add column if not exists guestbook_message text not null default '';

create unique index if not exists webbing_guests_device_name_unique
  on public.webbing_guests (device_id, normalized_name);
create index if not exists webbing_guests_guestbook_entry_idx
  on public.webbing_guests (guestbook_entry_id)
  where guestbook_entry_id is not null;

create table if not exists public.webbing_game_signups (
  guest_id uuid not null references public.webbing_guests(id) on delete cascade,
  game_key text not null check (game_key in ('saran', 'house', 'bingo', 'pinata')),
  created_at timestamptz not null default now(),
  primary key (guest_id, game_key)
);

create table if not exists public.webbing_config (
  id integer primary key default 1 check (id = 1),
  host_pin_hash text not null,
  guestbook_open boolean not null default true,
  games_open boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.webbing_config (id, host_pin_hash, guestbook_open, games_open)
values (1, extensions.crypt('4826', extensions.gen_salt('bf')), true, true)
on conflict (id) do nothing;

alter table public.webbing_guests enable row level security;
alter table public.webbing_game_signups enable row level security;
alter table public.webbing_config enable row level security;

revoke all on public.webbing_guests from anon, authenticated;
revoke all on public.webbing_game_signups from anon, authenticated;
revoke all on public.webbing_config from anon, authenticated;

create or replace function public.webbing_pin_ok(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.webbing_config
    where id = 1
      and crypt(coalesce(p_pin, ''), host_pin_hash) = host_pin_hash
  );
$$;

revoke all on function public.webbing_pin_ok(text) from public, anon, authenticated;

drop function if exists public.webbing_register_guests(text, text[]);
drop function if exists public.webbing_register_guests(text, text[], text);

create function public.webbing_register_guests(
  p_device_id text,
  p_names text[],
  p_message text default ''
)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_name text;
  clean_name text;
  clean_norm text;
  clean_norms text[] := '{}'::text[];
  clean_message text := left(trim(coalesce(p_message, '')), 1000);
  entry_uuid uuid := gen_random_uuid();
  accepted integer := 0;
begin
  if not coalesce((select guestbook_open from public.webbing_config where id = 1), false) then
    raise exception 'The guestbook is currently closed.';
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 or char_length(p_device_id) > 150 then
    raise exception 'Invalid device.';
  end if;
  if coalesce(array_length(p_names, 1), 0) = 0 or array_length(p_names, 1) > 10 then
    raise exception 'Enter between one and ten names.';
  end if;

  foreach raw_name in array p_names loop
    clean_name := left(regexp_replace(trim(coalesce(raw_name, '')), '\s+', ' ', 'g'), 80);
    clean_norm := lower(clean_name);
    if clean_name = '' or clean_norm = any(clean_norms) then
      continue;
    end if;
    clean_norms := array_append(clean_norms, clean_norm);
    accepted := accepted + 1;

    return query
    insert into public.webbing_guests (name, device_id, guestbook_entry_id, guestbook_message)
    values (clean_name, p_device_id, entry_uuid, clean_message)
    on conflict (device_id, normalized_name)
    do update set
      name = excluded.name,
      guestbook_entry_id = excluded.guestbook_entry_id,
      guestbook_message = excluded.guestbook_message,
      updated_at = now()
    returning webbing_guests.id, webbing_guests.name;
  end loop;

  if accepted = 0 then
    raise exception 'Please enter at least one guest name.';
  end if;

  delete from public.webbing_guests
  where device_id = p_device_id
    and not (normalized_name = any(clean_norms));
end;
$$;

create or replace function public.webbing_get_device_state(p_device_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'guestbook_open', coalesce(c.guestbook_open, false),
    'games_open', coalesce(c.games_open, false),
    'guestbook_message', coalesce((
      select g.guestbook_message
      from public.webbing_guests g
      where g.device_id = p_device_id
      order by g.updated_at desc
      limit 1
    ), ''),
    'guests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'games', coalesce((select jsonb_agg(s.game_key order by s.game_key) from public.webbing_game_signups s where s.guest_id = g.id), '[]'::jsonb)
        ) order by g.created_at, g.name
      )
      from public.webbing_guests g
      where g.device_id = p_device_id
    ), '[]'::jsonb)
  )
  from public.webbing_config c
  where c.id = 1;
$$;

create or replace function public.webbing_save_game(p_device_id text, p_game_key text, p_guest_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare saved_count integer;
begin
  if not coalesce((select games_open from public.webbing_config where id = 1), false) then raise exception 'Game signups are currently closed.'; end if;
  if p_game_key not in ('saran', 'house', 'bingo', 'pinata') then raise exception 'Unknown game.'; end if;
  delete from public.webbing_game_signups s using public.webbing_guests g
  where s.guest_id = g.id and g.device_id = p_device_id and s.game_key = p_game_key;
  insert into public.webbing_game_signups (guest_id, game_key)
  select g.id, p_game_key from public.webbing_guests g
  where g.device_id = p_device_id and g.id = any(coalesce(p_guest_ids, '{}'::uuid[]))
  on conflict do nothing;
  get diagnostics saved_count = row_count;
  return jsonb_build_object('count', saved_count);
end;
$$;

create or replace function public.webbing_host_dashboard(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare result jsonb;
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  select jsonb_build_object(
    'guestbook_open', c.guestbook_open,
    'games_open', c.games_open,
    'guests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'device_id', g.device_id,
          'guestbook_entry_id', g.guestbook_entry_id,
          'guestbook_message', g.guestbook_message,
          'created_at', g.created_at,
          'updated_at', g.updated_at,
          'games', coalesce((select jsonb_agg(s.game_key order by s.game_key) from public.webbing_game_signups s where s.guest_id = g.id), '[]'::jsonb)
        ) order by g.name
      ) from public.webbing_guests g
    ), '[]'::jsonb)
  ) into result
  from public.webbing_config c where c.id = 1;
  return result;
end;
$$;

create or replace function public.webbing_host_add_guest(p_pin text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare clean_name text;
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  clean_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if clean_name = '' then raise exception 'Enter a guest name.'; end if;
  insert into public.webbing_guests (name, device_id) values (clean_name, 'host-' || gen_random_uuid()::text);
  return true;
end;
$$;

create or replace function public.webbing_host_update_guest(p_pin text, p_guest_id uuid, p_name text, p_games text[])
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare clean_name text;
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  clean_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if clean_name = '' then raise exception 'Enter a guest name.'; end if;
  update public.webbing_guests set name = clean_name, updated_at = now() where id = p_guest_id;
  if not found then raise exception 'Guest not found.'; end if;
  delete from public.webbing_game_signups where guest_id = p_guest_id;
  insert into public.webbing_game_signups (guest_id, game_key)
  select p_guest_id, game_key from unnest(coalesce(p_games, '{}'::text[])) as game_key
  where game_key in ('saran', 'house', 'bingo', 'pinata') on conflict do nothing;
  return true;
end;
$$;

create or replace function public.webbing_host_delete_guest(p_pin text, p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  delete from public.webbing_guests where id = p_guest_id;
  return true;
end;
$$;

create or replace function public.webbing_host_update_message(p_pin text, p_entry_id uuid, p_message text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  update public.webbing_guests set guestbook_message = left(trim(coalesce(p_message, '')), 1000), updated_at = now()
  where guestbook_entry_id = p_entry_id;
  if not found then raise exception 'Guestbook entry not found.'; end if;
  return true;
end;
$$;

create or replace function public.webbing_host_set_open(p_pin text, p_guestbook_open boolean, p_games_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.webbing_pin_ok(p_pin) then raise exception 'Invalid host PIN.'; end if;
  update public.webbing_config set guestbook_open = p_guestbook_open, games_open = p_games_open, updated_at = now() where id = 1;
  return true;
end;
$$;

create or replace function public.webbing_host_change_pin(p_old_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.webbing_pin_ok(p_old_pin) then raise exception 'Current PIN is incorrect.'; end if;
  if p_new_pin is null or char_length(p_new_pin) < 4 or char_length(p_new_pin) > 12 then raise exception 'The new PIN must be 4 to 12 characters.'; end if;
  update public.webbing_config set host_pin_hash = crypt(p_new_pin, gen_salt('bf')), updated_at = now() where id = 1;
  return true;
end;
$$;

revoke all on function public.webbing_register_guests(text, text[], text) from public;
revoke all on function public.webbing_get_device_state(text) from public;
revoke all on function public.webbing_save_game(text, text, uuid[]) from public;
revoke all on function public.webbing_host_dashboard(text) from public;
revoke all on function public.webbing_host_add_guest(text, text) from public;
revoke all on function public.webbing_host_update_guest(text, uuid, text, text[]) from public;
revoke all on function public.webbing_host_delete_guest(text, uuid) from public;
revoke all on function public.webbing_host_update_message(text, uuid, text) from public;
revoke all on function public.webbing_host_set_open(text, boolean, boolean) from public;
revoke all on function public.webbing_host_change_pin(text, text) from public;

grant execute on function public.webbing_register_guests(text, text[], text) to anon, authenticated;
grant execute on function public.webbing_get_device_state(text) to anon, authenticated;
grant execute on function public.webbing_save_game(text, text, uuid[]) to anon, authenticated;
grant execute on function public.webbing_host_dashboard(text) to anon, authenticated;
grant execute on function public.webbing_host_add_guest(text, text) to anon, authenticated;
grant execute on function public.webbing_host_update_guest(text, uuid, text, text[]) to anon, authenticated;
grant execute on function public.webbing_host_delete_guest(text, uuid) to anon, authenticated;
grant execute on function public.webbing_host_update_message(text, uuid, text) to anon, authenticated;
grant execute on function public.webbing_host_set_open(text, boolean, boolean) to anon, authenticated;
grant execute on function public.webbing_host_change_pin(text, text) to anon, authenticated;

select 'Webbing party database setup/upgrade completed.' as status;
