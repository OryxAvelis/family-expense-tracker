begin;

create or replace function public.complete_darnaflow_cart(
  p_family_id uuid,
  p_cart_id bigint,
  p_buyer_legacy_user_id bigint,
  p_wallet_scope text,
  p_service_fee_cents integer,
  p_actor_name text
)
returns table (purchased_total_cents bigint, charged_total_cents bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member_id bigint;
  v_missing_note text;
  v_purchased_total bigint;
  v_charged_total bigint;
  v_wallet_key text;
  v_wallet_limit integer;
  v_wallet jsonb;
  v_transaction jsonb;
  v_updated_wallet jsonb;
begin
  if p_wallet_scope not in ('family', 'personal') then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_SCOPE';
  end if;
  if p_service_fee_cents < 0 or p_service_fee_cents > 100000 then
    raise exception using errcode = '22023', message = 'INVALID_SERVICE_FEE';
  end if;

  if not exists (
    select 1
    from public.family_users
    where family_id = p_family_id
      and id = p_buyer_legacy_user_id
      and role = 'delivery'
      and active = true
  ) then
    raise exception using errcode = '42501', message = 'BUYER_REQUIRED';
  end if;

  select c.member_id, coalesce(c.missing_products_note, '')
    into v_member_id, v_missing_note
  from public.carts c
  where c.family_id = p_family_id
    and c.id = p_cart_id
    and c.status in ('pending', 'ready', 'shopping')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CART_ALREADY_COMPLETED';
  end if;

  perform 1
  from public.cart_items i
  where i.family_id = p_family_id and i.cart_id = p_cart_id
  for update;

  if exists (
    select 1
    from public.cart_items i
    where i.family_id = p_family_id
      and i.cart_id = p_cart_id
      and i.purchase_status = 'requested'
  ) then
    raise exception using errcode = 'P0001', message = 'UNRESOLVED_CART_ITEMS';
  end if;

  if not exists (
    select 1
    from public.cart_items i
    where i.family_id = p_family_id and i.cart_id = p_cart_id
  ) and btrim(v_missing_note) = '' then
    raise exception using errcode = 'P0001', message = 'EMPTY_CART';
  end if;

  select coalesce(sum(
    case
      when i.purchase_status <> 'bought' then 0
      when i.requested_unit_price_cents = 2147483647 then i.actual_unit_price_cents
      else round((i.actual_unit_price_cents::numeric * i.quantity_hundredths::numeric) / 100)::bigint
    end
  ), 0)
    into v_purchased_total
  from public.cart_items i
  where i.family_id = p_family_id and i.cart_id = p_cart_id;

  -- The current catalog is a shared transitional catalog. Only the migrated
  -- household may update its legacy price/counter fields; newer tenants keep
  -- real paid prices exclusively on their own cart items.
  if p_family_id = '00000000-0000-4000-8000-000000000001'::uuid then
    update public.products p
    set
      purchase_count = p.purchase_count + 1,
      unit_price_cents = case
        when i.requested_unit_price_cents = 2147483647 then p.unit_price_cents
        else i.actual_unit_price_cents
      end,
      updated_at = now()
    from public.cart_items i
    where i.family_id = p_family_id
      and i.cart_id = p_cart_id
      and i.purchase_status = 'bought'
      and p.id = i.product_id;
  end if;

  v_charged_total := v_purchased_total + p_service_fee_cents;
  v_wallet_key := case
    when p_wallet_scope = 'family' then 'family_wallet_v1'
    else 'member_wallet_' || v_member_id::text
  end;
  v_wallet_limit := case when p_wallet_scope = 'family' then 500 else 300 end;
  v_transaction := jsonb_build_object(
    'id', 'order-' || p_cart_id::text,
    'type', 'order',
    'amount_cents', -v_charged_total,
    'cart_id', p_cart_id,
    'created_at', now(),
    'actor_name', left(coalesce(nullif(btrim(p_actor_name), ''), 'Buyer'), 80)
  );

  perform pg_advisory_xact_lock(hashtextextended(p_family_id::text || ':' || v_wallet_key, 0));

  select coalesce(nullif(m.value, '')::jsonb, '[]'::jsonb)
    into v_wallet
  from public.family_meta m
  where m.family_id = p_family_id and m.key = v_wallet_key
  for update;

  if not found then
    v_wallet := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_wallet) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_STATE';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_wallet) entry
    where entry ->> 'id' = 'order-' || p_cart_id::text
  ) then
    v_wallet := v_wallet || jsonb_build_array(v_transaction);
  end if;

  select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
    into v_updated_wallet
  from jsonb_array_elements(v_wallet) with ordinality values_with_position(entry, ordinal)
  where ordinal > greatest(jsonb_array_length(v_wallet) - v_wallet_limit, 0);

  insert into public.family_meta (family_id, key, value, updated_at)
  values (p_family_id, v_wallet_key, v_updated_wallet::text, now())
  on conflict (family_id, key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.family_meta (family_id, key, value, updated_at)
  values (p_family_id, 'cart_service_fee_' || p_cart_id::text, p_service_fee_cents::text, now())
  on conflict (family_id, key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  update public.carts
  set status = 'completed', completed_at = now()
  where family_id = p_family_id and id = p_cart_id;

  return query select v_purchased_total, v_charged_total;
end
$$;

revoke all on function public.complete_darnaflow_cart(
  uuid, bigint, bigint, text, integer, text
) from public, anon, authenticated;
grant execute on function public.complete_darnaflow_cart(
  uuid, bigint, bigint, text, integer, text
) to service_role;

commit;
