begin;

create or replace function public.join_darnaflow_family(
  p_code_hmac text,
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
  v_family_id uuid;
  v_owner_id uuid;
  v_invitation_id uuid;
  v_member_id uuid;
  v_legacy_user_id bigint;
begin
  if char_length(p_code_hmac) <> 64 then
    raise exception using errcode = '22023', message = 'INVALID_FAMILY_CODE';
  end if;
  if char_length(trim(p_display_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_NAME';
  end if;
  if char_length(p_normalized_username) not between 2 and 40
    or p_normalized_username ~ '[[:space:]]' then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if p_pin_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'INVALID_PIN_HASH';
  end if;

  select i.id, i.family_id, i.created_by_member_id
    into v_invitation_id, v_family_id, v_owner_id
  from public.family_invitations i
  join public.families f on f.id = i.family_id
  where i.code_hmac = p_code_hmac
    and i.allowed_role = 'member'
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.use_count < i.max_uses
    and f.status = 'active'
  for update of i;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVALID_FAMILY_CODE';
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
    v_family_id,
    trim(p_display_name),
    p_normalized_username,
    p_initials,
    'member',
    'pending',
    v_owner_id
  ) returning id into v_member_id;

  insert into app_private.member_credentials (
    family_id,
    member_id,
    pin_hash,
    hash_algorithm
  ) values (
    v_family_id,
    v_member_id,
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
    trim(p_display_name),
    p_normalized_username,
    p_pin_hash,
    'member',
    p_initials,
    false
  ) returning id into v_legacy_user_id;

  insert into app_private.legacy_member_map (
    family_id,
    legacy_user_id,
    member_id
  ) values (
    v_family_id,
    v_legacy_user_id,
    v_member_id
  );

  insert into public.wallets (family_id, kind, member_id)
  values (v_family_id, 'personal', v_member_id);

  update public.family_invitations
  set use_count = use_count + 1
  where id = v_invitation_id;

  return query select v_legacy_user_id;
end
$$;

revoke all on function public.join_darnaflow_family(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.join_darnaflow_family(
  text, text, text, text, text
) to service_role;

create or replace function public.set_darnaflow_member_approval(
  p_family_id uuid,
  p_legacy_user_id bigint,
  p_approved boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_member_id uuid;
begin
  select m.member_id
    into v_member_id
  from app_private.legacy_member_map m
  join public.family_users u
    on u.family_id = m.family_id and u.id = m.legacy_user_id
  join public.family_members fm
    on fm.family_id = m.family_id and fm.id = m.member_id
  where m.family_id = p_family_id
    and m.legacy_user_id = p_legacy_user_id
    and u.role = 'member'
    and u.active = false
    and fm.role = 'member'
    and fm.status = 'pending'
  for update of u, fm;

  if not found then
    return false;
  end if;

  if p_approved then
    update public.family_users
    set active = true
    where family_id = p_family_id and id = p_legacy_user_id;

    update public.family_members
    set status = 'active', updated_at = now()
    where family_id = p_family_id and id = v_member_id;
  else
    delete from public.wallets
    where family_id = p_family_id and member_id = v_member_id;

    delete from public.family_users
    where family_id = p_family_id and id = p_legacy_user_id;

    delete from public.family_members
    where family_id = p_family_id and id = v_member_id;
  end if;

  return true;
end
$$;

revoke all on function public.set_darnaflow_member_approval(
  uuid, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.set_darnaflow_member_approval(
  uuid, bigint, boolean
) to service_role;

commit;
