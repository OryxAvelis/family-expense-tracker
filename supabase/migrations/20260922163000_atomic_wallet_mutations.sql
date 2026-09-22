begin;

create or replace function app_private.validate_wallet_key(
  p_family_id uuid,
  p_wallet_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member_id bigint;
begin
  if p_wallet_key = 'family_wallet_v1' then
    return;
  end if;
  if p_wallet_key !~ '^member_wallet_[0-9]+$' then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_KEY';
  end if;
  v_member_id := substring(p_wallet_key from '^member_wallet_([0-9]+)$')::bigint;
  if not exists (
    select 1 from public.family_users
    where family_id = p_family_id and id = v_member_id and role = 'member'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_MEMBER';
  end if;
end
$$;

create or replace function public.append_darnaflow_wallet_transaction(
  p_family_id uuid,
  p_wallet_key text,
  p_transaction jsonb,
  p_history_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_wallet jsonb;
  v_updated_wallet jsonb;
  v_entry jsonb;
  v_balance bigint := 0;
  v_amount bigint;
begin
  perform app_private.validate_wallet_key(p_family_id, p_wallet_key);
  if p_history_limit not between 1 and 1000
    or coalesce(p_transaction ->> 'id', '') = ''
    or jsonb_typeof(p_transaction) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_TRANSACTION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_family_id::text || ':' || p_wallet_key, 0));
  select coalesce(nullif(m.value, '')::jsonb, '[]'::jsonb)
    into v_wallet
  from public.family_meta m
  where m.family_id = p_family_id and m.key = p_wallet_key
  for update;
  if not found then v_wallet := '[]'::jsonb; end if;
  if jsonb_typeof(v_wallet) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_STATE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_wallet) entry
    where (entry ->> 'id') = (p_transaction ->> 'id')
  ) then
    return false;
  end if;

  if (p_transaction ->> 'type') in ('return', 'transfer') then
    for v_entry in select value from jsonb_array_elements(v_wallet)
    loop
      begin
        v_amount := (v_entry ->> 'amount_cents')::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_amount := 0;
      end;
      if v_amount > 0 then
        v_balance := v_balance + v_amount;
      elsif v_amount < 0 then
        v_balance := greatest(0, v_balance + v_amount);
      end if;
    end loop;
    v_amount := coalesce((p_transaction ->> 'amount_cents')::bigint, 0);
    if v_amount >= 0 or abs(v_amount) > v_balance then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_WALLET_BALANCE';
    end if;
  end if;

  v_wallet := v_wallet || jsonb_build_array(p_transaction);
  select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
    into v_updated_wallet
  from jsonb_array_elements(v_wallet) with ordinality values_with_position(entry, ordinal)
  where ordinal > greatest(jsonb_array_length(v_wallet) - p_history_limit, 0);

  insert into public.family_meta (family_id, key, value, updated_at)
  values (p_family_id, p_wallet_key, v_updated_wallet::text, now())
  on conflict (family_id, key) do update
  set value = excluded.value, updated_at = excluded.updated_at;
  return true;
end
$$;

create or replace function public.remove_darnaflow_wallet_transaction(
  p_family_id uuid,
  p_wallet_key text,
  p_transaction_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_wallet jsonb;
  v_updated_wallet jsonb;
begin
  perform app_private.validate_wallet_key(p_family_id, p_wallet_key);
  if coalesce(p_transaction_id, '') = '' then
    raise exception using errcode = '22023', message = 'INVALID_TRANSACTION_ID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_family_id::text || ':' || p_wallet_key, 0));
  select coalesce(nullif(m.value, '')::jsonb, '[]'::jsonb)
    into v_wallet
  from public.family_meta m
  where m.family_id = p_family_id and m.key = p_wallet_key
  for update;
  if not found then return false; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_wallet) entry
    where (entry ->> 'id') = p_transaction_id
  ) then
    return false;
  end if;
  select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
    into v_updated_wallet
  from jsonb_array_elements(v_wallet) with ordinality values_with_position(entry, ordinal)
  where (entry ->> 'id') <> p_transaction_id;
  update public.family_meta
  set value = v_updated_wallet::text, updated_at = now()
  where family_id = p_family_id and key = p_wallet_key;
  return true;
end
$$;

create or replace function public.update_darnaflow_wallet_order_amount(
  p_family_id uuid,
  p_wallet_key text,
  p_transaction_id text,
  p_amount_cents integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_wallet jsonb;
  v_updated_wallet jsonb;
begin
  perform app_private.validate_wallet_key(p_family_id, p_wallet_key);
  if p_transaction_id !~ '^order-[0-9]+$' or p_amount_cents < 0 or p_amount_cents > 100000000 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_AMOUNT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_family_id::text || ':' || p_wallet_key, 0));
  select coalesce(nullif(m.value, '')::jsonb, '[]'::jsonb)
    into v_wallet
  from public.family_meta m
  where m.family_id = p_family_id and m.key = p_wallet_key
  for update;
  if not found then return false; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_wallet) entry
    where (entry ->> 'id') = p_transaction_id
  ) then
    return false;
  end if;
  select coalesce(jsonb_agg(
    case
      when (entry ->> 'id') = p_transaction_id
        then jsonb_set(entry, '{amount_cents}', to_jsonb(-abs(p_amount_cents)), true)
      else entry
    end
    order by ordinal
  ), '[]'::jsonb)
    into v_updated_wallet
  from jsonb_array_elements(v_wallet) with ordinality values_with_position(entry, ordinal);
  update public.family_meta
  set value = v_updated_wallet::text, updated_at = now()
  where family_id = p_family_id and key = p_wallet_key;
  return true;
end
$$;

create or replace function public.transfer_darnaflow_member_wallet_to_family(
  p_family_id uuid,
  p_member_id bigint,
  p_transfer_id uuid,
  p_amount_cents integer,
  p_member_name text,
  p_actor_name text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transaction_id text := 'transfer-' || p_transfer_id::text;
  v_created_at timestamptz := now();
begin
  if p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception using errcode = '22023', message = 'INVALID_TRANSFER_AMOUNT';
  end if;

  perform public.append_darnaflow_wallet_transaction(
    p_family_id,
    'member_wallet_' || p_member_id::text,
    jsonb_build_object(
      'id', v_transaction_id,
      'type', 'transfer',
      'amount_cents', -p_amount_cents,
      'cart_id', null,
      'created_at', v_created_at,
      'actor_name', left(coalesce(nullif(btrim(p_actor_name), ''), 'Family Owner'), 80)
    ),
    300
  );

  perform public.append_darnaflow_wallet_transaction(
    p_family_id,
    'family_wallet_v1',
    jsonb_build_object(
      'id', v_transaction_id,
      'type', 'contribution',
      'amount_cents', p_amount_cents,
      'cart_id', null,
      'contributor_id', p_member_id,
      'contributor_name', left(coalesce(nullif(btrim(p_member_name), ''), 'Member'), 80),
      'created_at', v_created_at,
      'actor_name', left(coalesce(nullif(btrim(p_actor_name), ''), 'Family Owner'), 80)
    ),
    500
  );

  return true;
end
$$;

create or replace function public.mark_darnaflow_order_paid_directly(
  p_family_id uuid,
  p_cart_id bigint,
  p_wallet_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member_id bigint;
  v_removed boolean;
begin
  select c.member_id into v_member_id
  from public.carts c
  where c.family_id = p_family_id
    and c.id = p_cart_id
    and c.status = 'completed'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPLETED_CART_NOT_FOUND';
  end if;
  if p_wallet_key <> 'family_wallet_v1'
    and p_wallet_key <> ('member_wallet_' || v_member_id::text) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_WALLET';
  end if;

  select public.remove_darnaflow_wallet_transaction(
    p_family_id,
    p_wallet_key,
    'order-' || p_cart_id::text
  ) into v_removed;
  if not v_removed then return false; end if;

  insert into public.family_meta (family_id, key, value, updated_at)
  values (p_family_id, 'cart_payment_method_' || p_cart_id::text, 'direct', now())
  on conflict (family_id, key) do update
  set value = excluded.value, updated_at = excluded.updated_at;
  return true;
end
$$;

create or replace function public.update_darnaflow_order_charge(
  p_family_id uuid,
  p_cart_id bigint,
  p_wallet_key text,
  p_purchased_total_cents integer,
  p_service_fee_cents integer,
  p_update_wallet boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member_id bigint;
  v_updated boolean := true;
begin
  if p_purchased_total_cents < 0 or p_purchased_total_cents > 100000000
    or p_service_fee_cents < 0 or p_service_fee_cents > 100000 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CHARGE';
  end if;
  select c.member_id into v_member_id
  from public.carts c
  where c.family_id = p_family_id and c.id = p_cart_id and c.status = 'completed'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPLETED_CART_NOT_FOUND';
  end if;
  if p_wallet_key <> 'family_wallet_v1'
    and p_wallet_key <> ('member_wallet_' || v_member_id::text) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_WALLET';
  end if;

  if p_update_wallet then
    select public.update_darnaflow_wallet_order_amount(
      p_family_id,
      p_wallet_key,
      'order-' || p_cart_id::text,
      p_purchased_total_cents + p_service_fee_cents
    ) into v_updated;
    if not v_updated then return false; end if;
  end if;

  insert into public.family_meta (family_id, key, value, updated_at)
  values (p_family_id, 'cart_service_fee_' || p_cart_id::text, p_service_fee_cents::text, now())
  on conflict (family_id, key) do update
  set value = excluded.value, updated_at = excluded.updated_at;
  return true;
end
$$;

revoke all on function app_private.validate_wallet_key(uuid, text) from public, anon, authenticated;
revoke all on function public.append_darnaflow_wallet_transaction(uuid, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.remove_darnaflow_wallet_transaction(uuid, text, text) from public, anon, authenticated;
revoke all on function public.update_darnaflow_wallet_order_amount(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.transfer_darnaflow_member_wallet_to_family(uuid, bigint, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.mark_darnaflow_order_paid_directly(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.update_darnaflow_order_charge(uuid, bigint, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.append_darnaflow_wallet_transaction(uuid, text, jsonb, integer) to service_role;
grant execute on function public.remove_darnaflow_wallet_transaction(uuid, text, text) to service_role;
grant execute on function public.update_darnaflow_wallet_order_amount(uuid, text, text, integer) to service_role;
grant execute on function public.transfer_darnaflow_member_wallet_to_family(uuid, bigint, uuid, integer, text, text) to service_role;
grant execute on function public.mark_darnaflow_order_paid_directly(uuid, bigint, text) to service_role;
grant execute on function public.update_darnaflow_order_charge(uuid, bigint, text, integer, integer, boolean) to service_role;

commit;
