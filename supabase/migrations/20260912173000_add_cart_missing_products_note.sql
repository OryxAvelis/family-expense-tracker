alter table public.carts
  add column if not exists missing_products_note text not null default '';
