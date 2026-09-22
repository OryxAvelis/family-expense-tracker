begin;

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

do $$
begin
  create type public.family_status as enum ('provisioning', 'active', 'suspended', 'archived');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.family_member_role as enum ('owner', 'buyer', 'member');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.family_member_status as enum ('pending', 'active', 'suspended', 'archived');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.wallet_kind as enum ('family', 'subscription_fund', 'personal');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  support_ref text not null unique,
  display_name text not null check (char_length(display_name) between 2 and 80),
  default_locale text not null default 'fr' check (default_locale in ('fr', 'ar', 'en')),
  currency_code char(3) not null default 'MAD',
  time_zone text not null default 'Africa/Casablanca',
  status public.family_status not null default 'provisioning',
  require_member_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id)
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  auth_subject uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 80),
  normalized_username text not null check (char_length(normalized_username) between 2 and 40),
  initials text not null check (char_length(initials) between 1 and 4),
  role public.family_member_role not null,
  status public.family_member_status not null default 'pending',
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (family_id, id),
  unique (family_id, normalized_username),
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);

create unique index if not exists one_active_owner_per_family
  on public.family_members (family_id)
  where role = 'owner' and status = 'active';

create unique index if not exists one_active_buyer_per_family
  on public.family_members (family_id)
  where role = 'buyer' and status = 'active';

create index if not exists family_members_family_status
  on public.family_members (family_id, status);

create table if not exists app_private.member_credentials (
  family_id uuid not null,
  member_id uuid primary key,
  pin_hash text not null,
  hash_algorithm text not null default 'argon2id-v1',
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  reset_required boolean not null default false,
  last_changed_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

create table if not exists app_private.family_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  family_id uuid not null,
  member_id uuid not null,
  auth_subject uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  rotated_from uuid references app_private.family_sessions(id),
  revoked_at timestamptz,
  client_fingerprint_hash bytea,
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

create index if not exists family_sessions_member_active
  on app_private.family_sessions (family_id, member_id, idle_expires_at)
  where revoked_at is null;

create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  code_hmac text not null unique,
  link_token_hash text unique,
  allowed_role public.family_member_role not null default 'member'
    check (allowed_role in ('buyer', 'member')),
  max_uses integer not null default 100 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);

create index if not exists family_invitations_family_active
  on public.family_invitations (family_id, created_at desc)
  where revoked_at is null;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  kind public.wallet_kind not null,
  member_id uuid,
  currency_code char(3) not null default 'MAD',
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (family_id, id),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id),
  check (
    (kind = 'personal' and member_id is not null)
    or (kind in ('family', 'subscription_fund') and member_id is null)
  )
);

create unique index if not exists one_family_wallet_per_family
  on public.wallets (family_id, kind)
  where kind in ('family', 'subscription_fund') and archived_at is null;

create unique index if not exists one_personal_wallet_per_member
  on public.wallets (family_id, member_id)
  where kind = 'personal' and archived_at is null;

create table if not exists app_private.family_onboarding_requests (
  request_id uuid primary key,
  family_id uuid not null unique references public.families(id),
  invitation_id uuid not null unique references public.family_invitations(id),
  created_at timestamptz not null default now()
);

create or replace function public.create_darnaflow_family(
  p_request_id uuid,
  p_display_name text,
  p_owner_name text,
  p_normalized_username text,
  p_initials text,
  p_pin_hash text,
  p_code_hmac text,
  p_support_ref text,
  p_locale text default 'fr'
)
returns table (created_support_ref text, invitation_public_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_family_id uuid;
  v_owner_id uuid;
  v_invitation_id uuid;
  v_existing_support_ref text;
  v_existing_invitation_public_id uuid;
begin
  select f.support_ref, i.public_id
    into v_existing_support_ref, v_existing_invitation_public_id
  from app_private.family_onboarding_requests r
  join public.families f on f.id = r.family_id
  join public.family_invitations i on i.id = r.invitation_id
  where r.request_id = p_request_id;

  if found then
    return query select v_existing_support_ref, v_existing_invitation_public_id;
    return;
  end if;

  if char_length(trim(p_display_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_FAMILY_NAME';
  end if;
  if char_length(trim(p_owner_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_OWNER_NAME';
  end if;
  if p_normalized_username !~ '^[[:alnum:]][[:alnum:]_.-]{1,39}$' then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if p_locale not in ('fr', 'ar', 'en') then
    raise exception using errcode = '22023', message = 'INVALID_LOCALE';
  end if;
  if p_pin_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'INVALID_PIN_HASH';
  end if;
  if char_length(p_code_hmac) <> 64 then
    raise exception using errcode = '22023', message = 'INVALID_CODE_DIGEST';
  end if;
  if p_support_ref !~ '^DF-[A-Z2-9]{8}$' then
    raise exception using errcode = '22023', message = 'INVALID_SUPPORT_REF';
  end if;

  insert into public.families (support_ref, display_name, default_locale, status)
  values (p_support_ref, trim(p_display_name), p_locale, 'provisioning')
  returning id into v_family_id;

  insert into public.family_members (
    family_id,
    display_name,
    normalized_username,
    initials,
    role,
    status
  ) values (
    v_family_id,
    trim(p_owner_name),
    p_normalized_username,
    p_initials,
    'owner',
    'active'
  ) returning id into v_owner_id;

  update public.family_members
    set created_by_member_id = v_owner_id
  where family_id = v_family_id and id = v_owner_id;

  insert into app_private.member_credentials (
    family_id,
    member_id,
    pin_hash,
    hash_algorithm
  ) values (
    v_family_id,
    v_owner_id,
    p_pin_hash,
    'argon2id-v1'
  );

  insert into public.family_invitations (
    family_id,
    code_hmac,
    allowed_role,
    max_uses,
    created_by_member_id
  ) values (
    v_family_id,
    p_code_hmac,
    'member',
    100,
    v_owner_id
  ) returning id into v_invitation_id;

  insert into public.wallets (family_id, kind, member_id)
  values
    (v_family_id, 'family', null),
    (v_family_id, 'subscription_fund', null),
    (v_family_id, 'personal', v_owner_id);

  insert into app_private.family_onboarding_requests (
    request_id,
    family_id,
    invitation_id
  ) values (
    p_request_id,
    v_family_id,
    v_invitation_id
  );

  return query
    select p_support_ref, i.public_id
    from public.family_invitations i
    where i.id = v_invitation_id;
end
$$;

revoke all on function public.create_darnaflow_family(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_darnaflow_family(
  uuid, text, text, text, text, text, text, text, text
) to service_role;

alter table public.families enable row level security;
alter table public.families force row level security;
alter table public.family_members enable row level security;
alter table public.family_members force row level security;
alter table public.family_invitations enable row level security;
alter table public.family_invitations force row level security;
alter table public.wallets enable row level security;
alter table public.wallets force row level security;
alter table app_private.member_credentials enable row level security;
alter table app_private.member_credentials force row level security;
alter table app_private.family_sessions enable row level security;
alter table app_private.family_sessions force row level security;
alter table app_private.family_onboarding_requests enable row level security;
alter table app_private.family_onboarding_requests force row level security;

revoke all on table
  public.families,
  public.family_members,
  public.family_invitations,
  public.wallets
from public, anon, authenticated;

revoke all on table
  app_private.member_credentials,
  app_private.family_sessions,
  app_private.family_onboarding_requests
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.families,
  public.family_members,
  public.family_invitations,
  public.wallets
to service_role;

grant select, insert, update, delete on table
  app_private.member_credentials,
  app_private.family_sessions,
  app_private.family_onboarding_requests
to service_role;

commit;
