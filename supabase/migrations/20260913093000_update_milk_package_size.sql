update public.products
set package_size = '0.5 L',
    unit_price_cents = 400,
    updated_at = now()
where id = 1
  and name_fr = 'Lait entier';

insert into public.app_meta (key, value)
values ('house_catalog_image_version', '4')
on conflict (key) do update set value = excluded.value;
