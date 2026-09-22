begin;

-- Stable only inside the database. It is never accepted from or returned to a
-- browser, and authorization must never depend on it being difficult to guess.
insert into public.families (
  id,
  support_ref,
  display_name,
  default_locale,
  status
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'DF-7K2M9Q4R',
  'Famille Youssef',
  'fr',
  'active'
)
on conflict (id) do nothing;

alter table public.families
  add column if not exists access_code_hmac text;

create unique index if not exists families_access_code_hmac_unique
  on public.families (access_code_hmac)
  where access_code_hmac is not null;

alter table public.family_users
  add column if not exists family_id uuid references public.families(id);

update public.family_users
set family_id = '00000000-0000-4000-8000-000000000001'::uuid
where family_id is null;

alter table public.family_users
  alter column family_id set default '00000000-0000-4000-8000-000000000001'::uuid,
  alter column family_id set not null;

-- Fail closed after the backfill: every future member creation must name its
-- tenant explicitly rather than silently falling into the migrated family.
alter table public.family_users
  alter column family_id drop default;

alter table public.family_users
  drop constraint if exists family_users_username_key;

create unique index if not exists family_users_family_username
  on public.family_users (family_id, username);

create unique index if not exists family_users_family_id_id
  on public.family_users (family_id, id);

alter table public.family_sessions
  add column if not exists family_id uuid references public.families(id);

update public.family_sessions s
set family_id = u.family_id
from public.family_users u
where s.user_id = u.id and s.family_id is null;

alter table public.family_sessions
  alter column family_id set not null;

create index if not exists family_sessions_family_expiry
  on public.family_sessions (family_id, expires_at);

alter table public.carts
  add column if not exists family_id uuid references public.families(id);

update public.carts c
set family_id = u.family_id
from public.family_users u
where c.member_id = u.id and c.family_id is null;

alter table public.carts
  alter column family_id set not null;

create unique index if not exists carts_family_id_id
  on public.carts (family_id, id);

create index if not exists carts_family_queue
  on public.carts (family_id, status, priority, submitted_at);

alter table public.cart_items
  add column if not exists family_id uuid references public.families(id);

update public.cart_items i
set family_id = c.family_id
from public.carts c
where i.cart_id = c.id and i.family_id is null;

alter table public.cart_items
  alter column family_id set not null;

create index if not exists cart_items_family_cart
  on public.cart_items (family_id, cart_id);

alter table public.family_sessions
  drop constraint if exists family_sessions_user_id_fkey;

alter table public.carts
  drop constraint if exists carts_member_id_fkey;

alter table public.cart_items
  drop constraint if exists cart_items_cart_id_fkey;

do $$
begin
  alter table public.family_sessions
    add constraint family_sessions_family_user_fk
    foreign key (family_id, user_id)
    references public.family_users(family_id, id)
    on delete cascade;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.carts
    add constraint carts_family_member_fk
    foreign key (family_id, member_id)
    references public.family_users(family_id, id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.cart_items
    add constraint cart_items_family_cart_fk
    foreign key (family_id, cart_id)
    references public.carts(family_id, id)
    on delete cascade;
exception
  when duplicate_object then null;
end
$$;

create or replace function app_private.set_legacy_tenant_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'family_sessions' then
    select u.family_id into new.family_id
    from public.family_users u
    where u.id = new.user_id;
  elsif tg_table_name = 'carts' then
    select u.family_id into new.family_id
    from public.family_users u
    where u.id = new.member_id;
  elsif tg_table_name = 'cart_items' then
    select c.family_id into new.family_id
    from public.carts c
    where c.id = new.cart_id;
  end if;

  if new.family_id is null then
    raise exception using errcode = '23502', message = 'MISSING_TENANT_CONTEXT';
  end if;
  return new;
end
$$;

drop trigger if exists family_sessions_set_family on public.family_sessions;
create trigger family_sessions_set_family
before insert or update of user_id on public.family_sessions
for each row execute function app_private.set_legacy_tenant_key();

drop trigger if exists carts_set_family on public.carts;
create trigger carts_set_family
before insert or update of member_id on public.carts
for each row execute function app_private.set_legacy_tenant_key();

drop trigger if exists cart_items_set_family on public.cart_items;
create trigger cart_items_set_family
before insert or update of cart_id on public.cart_items
for each row execute function app_private.set_legacy_tenant_key();

create table if not exists public.family_meta (
  family_id uuid not null references public.families(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, key)
);

alter table public.family_meta enable row level security;
alter table public.family_meta force row level security;
revoke all on table public.family_meta from public, anon, authenticated;
grant select, insert, update, delete on table public.family_meta to service_role;

insert into public.family_meta (family_id, key, value)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  key,
  value
from public.app_meta
where
  key in (
    'family_wallet_v1',
    'family_services_state_v1',
    'family_monthly_budget_cents',
    'delivery_wallet_paid_cents',
    'delivery_push_subscriptions'
  )
  or key like 'member_wallet_%'
  or key like 'member_favorites_%'
  or key like 'cart_service_fee_%'
  or key like 'offline_purchase_%'
  or key like 'cart_payment_method_%'
  or key like 'cart_wallet_scope_%'
  or key like 'cart_receipt_%'
  or key like 'cart_created_by_%'
  or key like 'cart_requested_date_%'
on conflict (family_id, key) do update
set value = excluded.value, updated_at = now();

create table if not exists app_private.legacy_member_map (
  family_id uuid not null references public.families(id),
  legacy_user_id bigint not null,
  member_id uuid not null,
  primary key (family_id, legacy_user_id),
  unique (family_id, member_id),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade,
  foreign key (family_id, legacy_user_id)
    references public.family_users(family_id, id) on delete cascade
);

alter table app_private.legacy_member_map enable row level security;
alter table app_private.legacy_member_map force row level security;
revoke all on table app_private.legacy_member_map from public, anon, authenticated;
grant select, insert, update, delete on table app_private.legacy_member_map to service_role;

with inserted_members as (
  insert into public.family_members (
    family_id,
    display_name,
    normalized_username,
    initials,
    role,
    status
  )
  select
    u.family_id,
    u.name,
    u.username,
    u.initials,
    case u.role
      when 'admin' then 'owner'::public.family_member_role
      when 'delivery' then 'buyer'::public.family_member_role
      else 'member'::public.family_member_role
    end,
    case
      when u.active then 'active'::public.family_member_status
      when u.username in ('amina', 'papa', 'maman', 'yassine', 'sara', 'adam')
        then 'archived'::public.family_member_status
      else 'pending'::public.family_member_status
    end
  from public.family_users u
  where u.family_id = '00000000-0000-4000-8000-000000000001'::uuid
    and not exists (
      select 1
      from app_private.legacy_member_map m
      where m.family_id = u.family_id and m.legacy_user_id = u.id
    )
  returning family_id, id, normalized_username
)
insert into app_private.legacy_member_map (family_id, legacy_user_id, member_id)
select m.family_id, u.id, m.id
from inserted_members m
join public.family_users u
  on u.family_id = m.family_id and u.username = m.normalized_username
on conflict (family_id, legacy_user_id) do nothing;

update public.family_members member
set created_by_member_id = owner.id
from public.family_members owner
where member.family_id = '00000000-0000-4000-8000-000000000001'::uuid
  and owner.family_id = member.family_id
  and owner.role = 'owner'
  and owner.status = 'active'
  and member.created_by_member_id is null;

insert into app_private.member_credentials (
  family_id,
  member_id,
  pin_hash,
  hash_algorithm,
  reset_required
)
select
  u.family_id,
  m.member_id,
  coalesce(nullif(u.password_hash, ''), 'legacy-reset-required'),
  'legacy-pbkdf2-or-sha256',
  u.password_hash = ''
from public.family_users u
join app_private.legacy_member_map m
  on m.family_id = u.family_id and m.legacy_user_id = u.id
on conflict (member_id) do nothing;

insert into public.wallets (family_id, kind, member_id)
values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'family', null),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'subscription_fund', null)
on conflict do nothing;

insert into public.wallets (family_id, kind, member_id)
select family_id, 'personal', member_id
from app_private.legacy_member_map
where family_id = '00000000-0000-4000-8000-000000000001'::uuid
on conflict do nothing;

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
  v_legacy_user_id bigint;
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
  if char_length(p_normalized_username) not between 2 and 40
    or p_normalized_username ~ '[[:space:]]' then
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

  insert into public.families (
    support_ref,
    display_name,
    default_locale,
    status,
    access_code_hmac
  )
  values (p_support_ref, trim(p_display_name), p_locale, 'active', p_code_hmac)
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

  insert into public.family_users (
    family_id,
    name,
    username,
    password_hash,
    role,
    initials,
    active
  ) values (
    v_family_id,
    trim(p_owner_name),
    p_normalized_username,
    p_pin_hash,
    'admin',
    p_initials,
    true
  ) returning id into v_legacy_user_id;

  insert into app_private.legacy_member_map (family_id, legacy_user_id, member_id)
  values (v_family_id, v_legacy_user_id, v_owner_id);

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

commit;
