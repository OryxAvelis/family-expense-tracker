begin;

create or replace function public.create_darnaflow_buyer(
  p_family_id uuid,
  p_owner_legacy_user_id bigint,
  p_display_name text,
  p_normalized_username text,
  p_initials text,
  p_pin_hash text
)
returns table (legacy_user_id bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_owner_member_id uuid;
  v_buyer_member_id uuid;
  v_legacy_user_id bigint;
begin
  if char_length(trim(p_display_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_BUYER_NAME';
  end if;
  if char_length(p_normalized_username) not between 2 and 40
    or p_normalized_username ~ '[[:space:]]' then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if p_pin_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'INVALID_PIN_HASH';
  end if;

  select m.member_id
    into v_owner_member_id
  from app_private.legacy_member_map m
  join public.family_users u
    on u.family_id = m.family_id and u.id = m.legacy_user_id
  join public.family_members fm
    on fm.family_id = m.family_id and fm.id = m.member_id
  where m.family_id = p_family_id
    and m.legacy_user_id = p_owner_legacy_user_id
    and u.role = 'admin'
    and u.active = true
    and fm.role = 'owner'
    and fm.status = 'active'
  for update of u, fm;

  if not found then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  if exists (
    select 1
    from public.family_members
    where family_id = p_family_id
      and role = 'buyer'
      and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'BUYER_ALREADY_EXISTS';
  end if;

  insert into public.family_members (
    family_id,
    display_name,
    normalized_username,
    initials,
    role,
    status,
    created_by_member_id
  ) values (
    p_family_id,
    trim(p_display_name),
    p_normalized_username,
    p_initials,
    'buyer',
    'active',
    v_owner_member_id
  ) returning id into v_buyer_member_id;

  insert into app_private.member_credentials (
    family_id,
    member_id,
    pin_hash,
    hash_algorithm
  ) values (
    p_family_id,
    v_buyer_member_id,
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
    p_family_id,
    trim(p_display_name),
    p_normalized_username,
    p_pin_hash,
    'delivery',
    p_initials,
    true
  ) returning id into v_legacy_user_id;

  insert into app_private.legacy_member_map (
    family_id,
    legacy_user_id,
    member_id
  ) values (
    p_family_id,
    v_legacy_user_id,
    v_buyer_member_id
  );

  return query select v_legacy_user_id;
end
$$;

revoke all on function public.create_darnaflow_buyer(
  uuid, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_darnaflow_buyer(
  uuid, bigint, text, text, text, text
) to service_role;

commit;
